// main.ts の 流れ 7: 保存と 世界の 読みこみ・毎ステップの 準備・ゲームの 毎コマの 登録と 影。
import { createCameraHook } from '../../camera/hook';
import { createCombatHook } from '../../combat';
import { createCraftHook } from '../../craft';
import { createToolHook } from '../../tools';
import type { FurnaceFxEntry } from '../../fx/furnaceFxModel';
import { createCraftUiHook } from '../../ui/craftUi';
import { createLogHook } from '../../ui/log';
import { type FarmPlacement, type ItemId, CROP_KINDS, SEED_ITEM } from '../../contracts';
import { type StepContext, createAchievementsHook } from '../../achievements';
import { createStorageHook } from '../../storage/hook';
import { itemIconPixels } from '../../ui/itemIcon';
import { SaveManager, stripResetParam, isBodyPlaceable, exportSave, EXPORT_FILE_NAME, importSave, PENDING_KEY } from '../../save';
import { ColumnIO } from '../../save/columnIO';
import { StreamHost } from '../../world/stream/StreamHost';
import { PrepCard } from '../../ui/prep';
import { showPrepCard } from '../../ui/prepModel';
import { generateChunk } from '../../world/gen/chunk';
import { PerfOverlay } from '../../debug/perfOverlay';
import { followScenery } from '../../game/scenery';
import { createLockHook } from '../../input';
import { peakNear } from '../../world/gen/peak';
import { MICRO_RADII } from '../../world/render/voxel/tier';
import { groundBelow } from '../../fx/blobShadow';
import { WATER, isSolidIndex } from '../../world/blocks/blockTypes';
import { ShadowSystem } from '../../world/render/shadow/ShadowSystem';
import { saveShadowPref } from '../../world/render/shadow/shadowPref';
import { createShadowSetting } from '../../ui/shadowSetting';
import { START_PITCH_DEG } from '../../player/config';
import { computeFarmPlacement, applyFarmPlacement } from '../../world/gen/farmPlacement';
import { createFarmVisual } from '../../world/render/farmVisual';
import type { WiredAchievements } from './ui';

export function wireSave(deps: WiredAchievements) {
  const {
    shared, world, seed, saveId, idb, restored, inventory, controller, spawnPlain, store, game,
    strengthToWrite, screenSettings, combat, time, craft, armor, level, storage, achievements,
    countryWatch, animals, deliverAnimalEvents, legendBook, ninjaBook, kodachi, ninjaHave, samuraiBook,
    samuraiHave, farm, saveOptions, island, hud, renderer, frameClock, raiseAboveBlocks, startPoint,
    playOverlay, m7, celebrate, lock, book, screen, inventoryScreen, toItemsTab, house,
  } = deps;
  // 自動セーブ（?nosave=1 は保存しない、?reset=1 は消してから始める。消すのは開発サーバーだけ）
  const save = new SaveManager({
    world,
    seed,
    saveId,
    db: idb,
    restored,
    inventory,
    player: {
      get: () => controller.state,
      // 読みこんだら 向きはカメラの yaw と同じ（背中が見える）
      set: (v) => controller.set({ position: v.position, velocity: v.velocity, yawDeg: v.yawDeg, pitchDeg: START_PITCH_DEG, facingDeg: v.yawDeg }),
    },
    saveOverrides: () => shared.gashaSaveOverrides(),
    spawn: spawnPlain, // 保存の meta に 書くだけ（スタートへ もどす動きは しない）
    store,
    tick: () => game.tick,
    strength: strengthToWrite,
    settings: screenSettings,
    bags: { serialize: () => combat.serializeBags(), deserialize: (d) => combat.deserializeBags(d) },
    clock: time,
    furnaces: { serialize: () => craft.serializeFurnaces(), deserialize: (d) => craft.deserializeFurnaces(d) },
    armor: { serialize: () => armor.serialize(), deserialize: (d) => armor.deserialize(d) },
    level: { serialize: () => level.serialize(), deserialize: (d) => level.deserialize(d) },
    // たんすは ブロックの復元のあとに（SaveManager が その順で呼ぶ）
    storage: { serialize: () => storage.serialize(), deserialize: (d) => storage.deserialize(d) },
    achievements: {
      serialize: () => achievements.serialize(),
      deserialize: (d) => {
        achievements.deserialize(d);
        countryWatch.reset(); // ロードした直後は 今の国 なし（もう一度 180 コマで 決まる）
      },
    },
    animals: {
      // LIVE-3 §4.4: 演出 中 の 子 は その場 で おわらせて から 保存（にく は 持ち物 へ。出来事 は すぐ 配る）
      prepare: () => {
        animals.finishMeat();
        deliverAnimalEvents();
      },
      serialize: () => animals.serialize(),
      deserialize: (d) => {
        animals.deserialize(d);
        shared.prevKits = -1;
        shared.prevCoops = -1;
      },
    },
    legend: { serialize: () => legendBook.serialize(), deserialize: (d) => legendBook.deserialize(d) },
    // HOUSE-1A: くら・建築士さんの 記録。前の 保存（キーなし）は 空の くら・最初の 1 人は 決まった 場所に 出る
    house: { serialize: () => house.state.serialize(), deserialize: (d) => house.load(d) },
    // NINJA-1: 忍者帳。前の 保存（帳なし）は 空。読んだ とき もちもの・防具の マスに ある 忍者装備は 帳に 入れる（#298 で もう 足袋を 持って いる 人に 2 こ目を 出さない）
    ninja: { serialize: () => ninjaBook.serialize(), deserialize: (d) => { kodachi.clear(); ninjaBook.deserialize(d, ninjaHave()); const k = ninjaBook.got().length; if (k > 0) achievements.feedNinja('', k); } },
    // SAMURAI-1: 侍帳。前の 保存（帳なし）は 空。読んだ とき もちもの・防具の マスに ある 侍装備は 帳に 入れる
    samurai: { serialize: () => samuraiBook.serialize(), deserialize: (d) => { samuraiBook.deserialize(d, samuraiHave()); const k = samuraiBook.got().length; if (k > 0) achievements.feedSamurai('', k); } },
    // #293: がしゃどくろの たおした 回数。係は あとで 作る ので、読みこみが 先に 来たら 預かって、作った あとで わたす
    gasha: { serialize: () => shared.gashaRelease?.serialize() ?? shared.gashaSavedPending, deserialize: (d) => { shared.gashaSavedPending = d; shared.gashaRelease?.deserialize(d); } },
    // 農業: 作物・印。前の保存（印なし）には 読んだあとに 置きものを置く
    farm,
    // VOX-D: 列は stream が読みこむ。保険から戻したときの最初の保存は ready のあと
    streaming: true,
    onWritten: (cols) => columnIO.noteWritten(cols),
    storedChunks: () => restored.keys.size,
  });
  shared.requestSave = () => save.saveIfChanged();
  if (saveOptions.reset) history.replaceState(null, '', stripResetParam(location.href));
  const loadedSave = save.load();
  // 列の出どころ・保存先（VOX-D D1〜D5）。保存できない（?nosave=1・IndexedDB なし・読むだけ）ときは 捨てる列を ページの中に預ける
  const columnIO = new ColumnIO({
    db: idb,
    saveId,
    nSections: Math.ceil(world.size.y / 16),
    keys: restored.keys,
    generate: (cx, cz) => {
      const t0 = performance.now();
      const col = generateChunk(seed, cx, cz);
      island.noteGen?.(performance.now() - t0);
      return col;
    },
    saveOn: () => save.isOn(),
    saving: () => save.saving(),
    writing: (cx, cz) => save.writing(cx, cz),
    canFlush: () => save.isOn(),
    flush: () => save.flushNow(),
    onCorrupt: () => {
      restored.corrupt++;
    },
    onReadTimeout: () => {
      restored.readOnly = true; // 列の読みが 止まった: この遊びでは 保存をやめる（IDB に書かない。捨てる列は ページの中に預ける）
    },
    onNewer: () => {
      restored.readOnly = true; // 新しい形式の保存は さわらない・この遊びでは 保存しない
    },
  });
  // 新しい世界: 地形の上に 置きもの（やせいの やさい・ふるい はたけ）を置く（R が 生成ずみになったとき 1 回。stream が呼ぶ）。保存があれば 保存の側
  if (!loadedSave) save.holdWrites = true; // 置きものを書くまで 保存しない（「置いた」印が 先に保存されないように）
  const applyPlacementNow = (): void => {
    const placement: FarmPlacement = computeFarmPlacement(seed, { world, info: island });
    applyFarmPlacement(world, placement);
    farm.noteNewWorldPlaced(placement);
    save.holdWrites = false;
    shared.requestSave();
  };
  // 保存を読んだ世界では たんす の場所が わからないので、ここで 1 回だけ 計算する（あそびの途中では 計算しない）
  if (loadedSave && shared.oldTansu === null && farm.kakashi()) shared.oldTansu = computeFarmPlacement(seed).oldFarm?.tansu ?? null;
  // ストリーミング（VOX-D）: プレイヤーのまわりの列を 近い順に作り、遠くなったら捨てる。起動・テレポート・遠くへもどる は「中心を変えて、そろったら立たせる」
  const prepCard = new PrepCard(hud);
  const host = new StreamHost({
    world,
    renderer,
    io: columnIO,
    info: island,
    seed,
    newWorld: !loadedSave,
    applyPlacement: applyPlacementNow,
    pending: restored.pending,
    clock: frameClock,
    placePlayer: (p) => controller.set({ position: { x: p.x, y: raiseAboveBlocks(p.x, p.y, p.z), z: p.z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: p.yawDeg, pitchDeg: p.pitchDeg }),
    onColumnsLoaded: () => farm.rescan(),
    onReady: (kind) => {
      if (kind !== 'boot') return;
      // 保存したプレイヤーの位置が ブロックと重なっていたら スタートへ（D6。そろうまで その場で まつ）
      if (loadedSave && !isBodyPlaceable(world, controller.state.position)) {
        const sp = startPoint();
        controller.set({ position: { x: sp.x, y: sp.y, z: sp.z }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: sp.yawDeg, pitchDeg: START_PITCH_DEG });
      }
      // 保険から戻したときの 最初の保存（保険を当てたあと）
      if (restored.fromPending) {
        save.releasePendingHold();
        void save.now();
      }
    },
  });
  shared.streamHost = host;
  {
    const n = new URLSearchParams(location.search).get('streamWork');
    if (n !== null && n.trim() !== '' && Number.isInteger(Number(n)) && Number(n) >= 0) host.stream.setWork(Number(n));
    const p = controller.state.position;
    host.boot(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4);
    renderer.setViewer(p.x, p.z);
  }
  /** 世界が 動けるか（そろうまでは プレイヤー・妖怪を 動かさない・落とさない） */
  const worldReady = (): boolean => host.stream.ready;
  /** 輪の仕事・じゅんびちゅうの表示（毎コマ。案内画面で 止まっている間も 進める） */
  function streamFrame(): void {
    const p = controller.state.position;
    host.update(p.x, p.z);
    followScenery(game.scene, p.x, p.z);
    const s = host.stream;
    const now = performance.now();
    playOverlay.setPrep(host.everReady ? null : s.progress, now);
    prepCard.update(showPrepCard(s.phase, s.waitedFrames), s.progress, now);
  }
  // 農業の見た目（作物の絵・光）
  const farmVisual = createFarmVisual({
    world,
    light: renderer.light,
    crops: { stageAt: (x, y, z) => farm.crop(x, y, z)?.stage ?? null },
    ripeMin: () => m7.farmRipeMinBrightness,
    itemIcon: (name) => {
      try {
        return itemIconPixels(name as ItemId).map((c) => (c[3] === 0 ? null : `#${[c[0], c[1], c[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`));
      } catch {
        return null;
      }
    },
  });
  // ふるい たんす から たね を持ち物へ うつしたか（たんす を開いているあいだ、たねの数がふえたら）
  let seedsInInv = 0;
  const seedCount = (): number => CROP_KINDS.reduce((n, k) => n + inventory.count(SEED_ITEM[k]), 0);
  function trackOldFarmSeeds(): void {
    const ui = storage.ui();
    const n = seedCount();
    if (ui.open && ui.position && n > seedsInInv) {
      const p = ui.position;
      if (shared.oldTansu && shared.oldTansu.x === p.x && shared.oldTansu.y === p.y && shared.oldTansu.z === p.z) {
        for (const k of CROP_KINDS) farm.noteSeedFound('oldfarm', SEED_ITEM[k], p);
      }
    }
    seedsInInv = n;
  }
  achievements.syncSilently({ level: level.get().level, armor: [armor.equipped('head'), armor.equipped('body'), armor.equipped('arms'), armor.equipped('legs')] });
  celebrate.setPending(achievements.pendingCount());
  lock.onChange((locked) => {
    if (!locked) save.saveIfChanged();
    // あそびが はじまった・もちもの画面やおめでとう画面が 出る: 本は すぐ しまう（案内画面が 出ていない 間は 本も 出さない）
    if (!lock.overlayVisible()) book.closeNow();
  });
  screen.onClose(() => {
    // できごと で とじたあと E で開いたら もちもの から（L で開いた画面は L で開き直す）
    if (inventoryScreen.tab() === 'log') toItemsTab();
    craft.closeFurnace();
    save.saveIfChanged();
  });
  save.bindPageEvents(window, document);
  if (idb) {
    // おとな向け: ほぞんを ファイル（.rikkun.gz）に だす・よみこむ（Safari の 7 日消去にそなえる）
    playOverlay.mountAdult({
      exportSave: async () => {
        await save.now();
        const bytes = await exportSave(idb, saveId);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/gzip' }));
        a.download = EXPORT_FILE_NAME;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      },
      importSave: async (file) => {
        if (!window.confirm('いまの せかいが ファイルの ものに かわります。いいですか？')) return;
        try {
          save.suspend(); // 読みなおすまで、いまの世界で ファイルの中身を 上書きしない
          await save.idle();
          await importSave(idb, saveId, new Uint8Array(await file.arrayBuffer()), seed);
          store?.removeItem(PENDING_KEY);
          location.reload();
        } catch (e) {
          save.resume();
          window.alert(e instanceof Error ? e.message : 'よみこめませんでした');
        }
      },
    });
  }
  return { save, host, worldReady, streamFrame, farmVisual, trackOldFarmSeeds };
}

type WiredSave = WiredAchievements & ReturnType<typeof wireSave>;

export function wireFrame(deps: WiredSave) {
  const {
    shared, hud, game, renderer, furnaceFx, craft, controller, island, screen, time, combat, yokaiM, level,
    armor, seed, achievements, countryWatch, celebrate,
  } = deps;
  // #144 SHADOW-1: 光の位置から計算する影（?shadow=0 は作らない。くわしくは docs/design/SHADOW.md）
  const overlay = new PerfOverlay(hud, game, {
    lines: () => {
      const m = renderer.meshStats();
      return [
        `micro r=${renderer.microRadiusNow} (F4)  mesh ${m.meshCount}  wait ${m.pending}  geo ${(m.geometryBytes / 1048576).toFixed(1)}MB`,
        ...(shared.shadowSystem ? [shared.shadowSystem.line()] : []),
      ];
    },
    cycle: () => {
      const radii = MICRO_RADII as readonly number[];
      const i = radii.indexOf(renderer.microRadiusNow);
      renderer.config.microRadius = radii[(i + 1) % radii.length];
    },
  });

  function updateFurnaceFx(dt: number): void {
    furnaceFx.update(dt, craft.furnaceFxEntries() as readonly FurnaceFxEntry[], controller.state.position);
  }

  // 毎ステップの順: プレイヤー → カメラ → 世界の作り直し →（Game が）入力の「押した」を消す
  const ctx: StepContext = {
    tick: 0,
    day: 0,
    mode: 'play',
    screenSteps: 1,
    position: { x: 0, y: 0, z: 0 },
    velocityY: 0,
    onGround: true,
    inWater: false,
    dead: false,
    yokai: [],
    level: 1,
    armor: [null, null, null, null],
    regions: null,
    peak: null,
  };
  let peakKey = NaN;
  let yokaiSample: StepContext['yokai'] = [];
  const regions = island.regions();
  const armorNow: (ItemId | null)[] = [null, null, null, null];
  function updateAchievements(): void {
    const st = controller.state;
    const mode = screen.mode();
    const ts = screen.timeScale();
    ctx.tick = game.tick;
    ctx.day = time.day();
    ctx.mode = mode;
    ctx.screenSteps = mode === 'play' ? 1 : mode === 'inventory' && ts > 0 ? 1 / ts : 0;
    ctx.position = st.position;
    ctx.velocityY = st.velocity.y;
    ctx.onGround = st.onGround;
    ctx.inWater = st.inWater;
    ctx.dead = combat.dead();
    if (game.tick % 10 === 0) yokaiSample = yokaiM.list();
    ctx.yokai = yokaiSample;
    ctx.level = level.get().level;
    armorNow[0] = armor.equipped('head');
    armorNow[1] = armor.equipped('body');
    armorNow[2] = armor.equipped('arms');
    armorNow[3] = armor.equipped('legs');
    ctx.armor = armorNow;
    ctx.regions = regions;
    // COUNTRY-1 §5.2: てっぺん の 判定の もと（16 ブロックの 升目が かわったときだけ 計算しなおす）
    const pk = Math.floor(st.position.x / 16) * 100003 + Math.floor(st.position.z / 16);
    if (pk !== peakKey) {
      peakKey = pk;
      ctx.peak = peakNear(seed, Math.floor(st.position.x), Math.floor(st.position.z));
    }
    if (!shared.achMuted) {
      achievements.update(ctx);
      // COUNTRY-1 §4.1: やられた画面の 間は 数えない（止まっている 間は screenSteps = 0）
      countryWatch.step(st.position, ctx.dead ? 0 : ctx.screenSteps);
    }
    celebrate.setPending(achievements.pendingCount());
  }
  return { overlay, updateFurnaceFx, updateAchievements };
}

export type WiredFrame = WiredSave & ReturnType<typeof wireFrame>;

export function wireLoop(deps: WiredFrame) {
  const {
    shared, game, rig, overlay, frameClock, host, streamFrame, controller, renderer, world, blobShadow,
    lock, screen, parry, tools, craft, log, inventoryScreen, inventory, pickupLog, armor, storage,
    achievements, pageModel, syncPages, celebrate, dig, actionHint, yokaiFocus, combat, store, weighted,
    startBoot, strengthLevel, soundSettingsUi, timeSettings, time,
  } = deps;
  // ヒットストップで 世界が 止まっている 間も カメラの ゆれだけは 動く
  game.onFrozenUpdate((dt) => rig.updateFrozen(dt));
  game.onUpdate((dt) => overlay.update(dt));
  // 案内画面で止まっている間も 読みこみは進める（B3）
  // count の時計（E2E のサーバー）: そろって いまの中心のまわりも そろったら、止めている間は進めない
  // （そのあとは テストが step したコマだけ 仕事をする。#179）
  game.onIdle(() => {
    if (frameClock === 'count' && host.everReady && host.stream.startSettled()) return;
    streamFrame();
    const p = controller.state.position;
    renderer.update({ x: p.x, z: p.z });
  });
  game.onUpdate(() => {
    const p = controller.state.position;
    const bx = Math.floor(p.x);
    const bz = Math.floor(p.z);
    const ground = groundBelow(p.y, (y) => {
      const b = world.getIndex(bx, y, bz);
      return b === WATER ? 'water' : b > 0 && isSolidIndex(b) ? 'solid' : 'other';
    });
    // #293: がしゃどくろの 体・ガラスの 雲・置いた ブロックの 上でも 足もとに 丸い 影（真下の いちばん 近い 体の 上面の 高さ。ワールドの 地面より 高い ほうを 使う）
    const onBody = shared.gashaBodyBlocks?.surfaceBelow(p.x, p.y, p.z) ?? null;
    blobShadow.update(p, onBody !== null && (ground === null || onBody > ground) ? onBody : ground, rig.doll.group.visible);
  });
  // ロックがないあいだは時間を止める。F3 だけは効く（M1-02 §2.4）
  game.setRealtimeGate(() => lock.realtimeAllowed());
  // おめでとう画面の中の時間は 実時間で進める（世界は上で止めてある）
  game.setTimeScale(() => screen.timeScale() * (screen.mode() === 'play' ? parry.state().timeScale : 1));
  game.onIdle((dt) => overlay.update(dt));

  const cameraHook = createCameraHook(rig);
  const toolHook = createToolHook(tools);
  const craftHook = createCraftHook(craft, screen);
  const logHook = createLogHook(log);
  const craftUiHook = createCraftUiHook({
    panel: inventoryScreen.craftPanel!,
    craft,
    inv: inventory,
    pickupLog,
    tooltip: inventoryScreen.tooltip!,
    armorClick: (slot) => armor.click(slot),
  });
  const storageHook = createStorageHook(storage, screen);
  const achievementsHook = {
    ...createAchievementsHook(achievements, pageModel, {
      inventoryOpen: () => screen.inventoryOpen(),
      onTab: (tab) => {
        inventoryScreen.setTab(tab);
        syncPages();
      },
    }),
    modal: () => celebrate.modalInfo(),
    /** 今すぐ 出す（準備用）。出ている テロップは すてる */
    flush: () => {
      celebrate.preempt();
      achievements.flush();
    },
    sounds: () => celebrate.drainAchievementSounds(),
    /** テスト用: true のあいだ 実績の画面（おめでとう画面）を出さない（古いテストが世界を止められないように） */
    mute: (on: boolean) => {
      shared.achMuted = on;
    },
  };
  const facingTmp = { x: 0, y: 0, z: 0 };
  const hudHook = { toolHint: () => { const h = dig.toolHint(); return h ? { slot: h.slot, ticksLeft: h.ticksLeft } : null; }, actionHint: () => actionHint.current(), yokaiFocus: () => yokaiFocus.current(), yokaiFocusHulls: () => yokaiFocus.hullCount(), hpBar: (id: number) => shared.yokaiManager?.hpBarInfo(id) ?? null, announce: () => shared.yokaiManager?.announce() ?? null, nameplate: (id: number) => shared.yokaiManager?.nameplateInfo(id) ?? null, staggerIcon: (id: number) => shared.yokaiManager?.staggerIconInfo(id) ?? null };
  const lockHook = createLockHook(lock);
  const combatHook = createCombatHook(combat);
  const shadowStore = store;
  const shadowStart = weighted.shadow;
  startBoot.setInfo({ strength: strengthLevel, microR: weighted.microR, ring: weighted.ring, shadowBuilt: shadowStart.build });
  const shadowSettingUi = createShadowSetting(soundSettingsUi.el);
  if (shadowStart.build) {
    ShadowSystem.activate();
    const sys = new ShadowSystem({
      renderer: game.renderer,
      worldRenderer: renderer,
      timeSettings,
      dayTick: () => time.dayTick(),
      yokaiGroup: shared.yokaiManager!.group,
      player: () => controller.state.position,
      facing: () => controller.state.facingDeg,
      world,
    });
    sys.enabled = shadowStart.on;
    const sprite = rig.doll.group.getObjectByName('charSprite');
    if (sprite) sys.attachSprite(sprite as import('three').Mesh);
    game.onBeforeRender(() => sys.preRender());
    shared.shadowSystem = sys;
    window.addEventListener('pagehide', () => sys.dispose());
  }
  const setShadow = (on: boolean): void => {
    if (!shared.shadowSystem) return;
    shared.shadowSystem.enabled = on;
    saveShadowPref(shadowStore, on);
    shadowSettingUi.refresh(on);
    game.step(0); // 次のコマで画面を合わせる
  };
  shadowSettingUi.bind(shared.shadowSystem !== null, shadowStart.on, setShadow);
  return {
    cameraHook, toolHook, craftHook, logHook, craftUiHook, storageHook, achievementsHook, facingTmp,
    hudHook, lockHook, combatHook, setShadow,
  };
}

export type WiredLoop = WiredFrame & ReturnType<typeof wireLoop>;
