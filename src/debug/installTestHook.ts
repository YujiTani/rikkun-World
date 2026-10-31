// 開発用の 窓口 `window.__rikkun` の 中身を 集める（main.ts から 移した）。名前と 中身は かえない。
import { type Fog as ThreeFog, Color as ThreeColor } from 'three';
import { createPickupHook, createFurnaceHook, createArmorHook } from '../craft';
import { createBladeHook } from '../tools/blade/hook';
import { parryGlowLevel } from '../combat/parry';
import { NINJA_TUNING } from '../craft/ninjaTuning';
import { knockbackMulOf } from '../craft/samuraiPower';
import { SENSE } from '../yokai/ai/senseTuning';
import { uiAlpha } from '../ui/theme';
import { WORLD_LIMIT, type ItemId } from '../contracts';
import { ITEM_RARITY_SETTINGS } from '../drops/rarity';
import { createRarityHook } from '../drops/rarityHook';
import { createInventoryM6Extras } from '../storage/hook';
import { createCraftPanelHook } from '../craft/hook';
import { createTimeHook } from '../time';
import { createYokaiHook } from '../yokai';
import { createLevelHook } from '../level';
import { FX_SETTINGS } from '../fx/config';
import { drainSounds } from '../fx/soundLog';
import { parseChord } from '../fx/bgm/compile';
import { createAudioHook } from '../fx/bgm/hook';
import { createDigHook } from '../dig';
import { createInventoryHook } from '../inventory';
import { createSaveHook } from '../save';
import { colKey } from '../world/stream/ring';
import { createWorkHook } from '../debug/workHook';
import { installTestHook, type TestHookGroups, withSpriteDoll } from '../debug/testHook';
import { createSettingsHook } from '../game/settings';
import { createInputHook } from '../input';
import { createPlayerHook } from '../player/hook';
import { createBiomeHook } from '../world/gen/biomeHook';
import { createMineHook } from '../world/gen/mineHook';
import { createWorldHook } from '../world/hook';
import { createRenderHook } from '../world/render/renderHook';
import { createShadowHook } from '../world/render/shadow/shadowHook';
import { createFarmHook } from '../farm';
import { createHouseHook } from '../house/hook';
import { lookDirection } from '../dig/raycast';
import { computeFarmPlacement } from '../world/gen/farmPlacement';
import { digSettingsView, settingsViewOf, sharedSettingsView } from './settingsViews';
import type { WiredLoop } from '../game/wire/save';

export function installGameHook(deps: WiredLoop): void {
  const {
    shared, game, overlay, host, startBoot, world, charCtl, controller, setShadow, seed, achievements,
    countryWatch, renderer, island, save, blobShadow, sky, parry, thunderFx, legend, legendBook, waveSys,
    spiralDebris, chargeLight, handNow, chargeChest, slashFx, kodachiFx, nijiFx, fujinFx, windWaveFx,
    raijinFx, rainbowFx, domeGrains, w2, cameraHook, sprite, rig, dig, hudHook, inventory, screen, craft,
    craftUiHook, storage, dropper, restored, time, combatHook, toolHook, kodachiHookBuf, ninjaBook,
    kodachi, samuraiBook, armor, geta, logHook, impactBus, celebrate, coopMenu, itadakimasu, buffModel,
    craftHook, craftPanel, achievementsHook, storageHook, farm, farmVisual, sparkle, facingTmp, sprayFx,
    waterFx, drops, store, level, yokaiM, blade, weaponFx, animals, deliverAnimalEvents, animalEvents,
    currentKitRows, animalFx, animalHint, aimPointInto, combat, lockHook, book, look, wheel, mixer, bgm,
    bgmScene, audioSettings, fxSound, craftConfig, toolConfig, craftUi, craft2Settings, screenSettings, m6,
    m7, hintSettings, aimCfg, live, clockPhases, timeSettings, frameClock, house, gadgets,
  } = deps;
  installTestHook(game, overlay, () => host.everReady, {
    start: startBoot.hook,
    work: createWorkHook(() => game.tick, world),
    char: charCtl,
    shadow: createShadowHook({
      system: shared.shadowSystem,
      renderer: game.renderer,
      scene: game.scene,
      camera: game.camera,
      world,
      player: () => controller.state.position,
      step: (n) => game.step(n),
      renderNow: () => game.renderNow(),
      setEnabled: setShadow,
    }),
    biome: createBiomeHook({
      seed,
      player: () => controller.state.position,
      countries: {
        found: () => achievements.found(),
        setFound: (kinds) => achievements.setFound(kinds),
        current: () => countryWatch.current(),
        quiet: (on) => countryWatch.quiet(on),
      },
    }),
    // MINE-1A §6.1: 層・鉱石・かたまり・地下の判定。妖怪を 出す 高さの はばは 設定（yokaiSpawnHeight）の 今の 値
    mine: createMineHook({ seed, world, player: () => controller.state.position, spawnHeight: () => yokaiM.config.yokaiSpawnHeight }),
    world: createWorldHook(world, renderer, island, {
      teleport: (x, z) => host.goTo({ x, y: null, z }, true),
      stream: () => host.info(),
      // ready・保存が書きおわり・捨てる待ち 0（full なら 仕事も 0）まで 1 コマずつ進める。保存の返事（IndexedDB）は待つ
      settle: async (opt) => {
        const full = opt?.full === true;
        const max = opt?.maxFrames ?? 2000;
        for (let i = 0; i < max; i++) {
          const s = host.info();
          if (s.ready && !s.saving && s.unloadPending === 0 && s.columns.loading === 0 && (!full || s.queued === 0)) return s;
          if (s.ready && s.saving) await save.idle();
          else if (s.columns.loading > 0) await new Promise<void>((ok) => setTimeout(ok, 0));
          game.step(1);
        }
        return host.info();
      },
      setStreamWork: (n) => host.stream.setWork(n),
      chunkStage: (cx, cz) => host.stream.stageOf(cx, cz),
      wall: () => WORLD_LIMIT,
    }),
    render: createRenderHook({
      world,
      renderer,
      gl: game.renderer,
      camera: game.camera,
      renderNow: () => game.renderNow(),
      blob: blobShadow,
      chunks: () => renderer.chunkStats(),
      env: () => ({
        fog: game.scene.fog ? { near: (game.scene.fog as ThreeFog).near, far: (game.scene.fog as ThreeFog).far, colorHex: game.scene.fog.color.getHex() } : null,
        backgroundHex: game.scene.background instanceof ThreeColor ? game.scene.background.getHex() : null,
        dollBrightness: sky.lastDoll,
      }),
    }),
    parry: {
      state: () => parry.state(),
      events: () => parry.events(),
    } as unknown as TestHookGroups['parry'],
    thunder: thunderFx.hook(game),
    legend: {
      state: () => ({ ...legend.state(), got: legendBook.got() }),
      events: () => legend.peekEvents(),
      waves: () => waveSys.list().map((w) => ({ id: w.id, kind: w.kind, position: { ...w.position }, dir: { ...w.dir }, traveled: w.traveled, age: w.age, spin: w.spin, drawPos: { ...w.drawPos }, face: w.face, bodyAlpha: w.bodyAlpha, backAlpha: w.backAlpha })),
      debris: () => ({ ...spiralDebris.view() }),
      chargeFx: () => {
        const v = chargeLight.view();
        const on = v.phase !== 'off';
        const h = on ? handNow() : null;
        return {
          phase: v.phase,
          palette: v.palette,
          alpha: v.alpha,
          particles: v.particles,
          hand: v.hand,
          handCore: v.handCore,
          handRing: v.handRing,
          F: v.F,
          center: h ? { ...h.world } : null,
          chest: on ? { ...chargeChest() } : null,
          screen: h && h.screen ? { ...h.screen } : null,
        };
      },
      chargeSound: () => ({ ...legend.chargeSound() }),
      spiralSound: () => legend.spiralSound(),
      pullSound: () => legend.pullSound(),
      slashes: () => slashFx.slashes(),
      kodachiSlashes: () => kodachiFx.slashes(),
      nijiFx: () => ({ ...nijiFx.info(), ...slashFx.info() }),
      fujinFx: () => fujinFx.info(),
      windWaveFx: () => windWaveFx.info(),
      raijinFx: () => raijinFx.info(),
      rainbowFx: () => rainbowFx.info(),
      grains: () => ({ ...domeGrains.counts() }),
    } as unknown as TestHookGroups['legend'],
    player: { ...createPlayerHook(controller), handPos: () => { const h = handNow(); return { world: { ...h.world }, screen: h.screen ? { ...h.screen } : null }; }, glow: () => { const g = parry.state().glowLeft; return { visible: g > 0, ticksLeft: g, level: parryGlowLevel(g, w2) }; }, respawn: () => controller.respawn(), doll: withSpriteDoll(cameraHook.doll, sprite, rig.doll.group) } as unknown as TestHookGroups['player'],
    ...createDigHook(dig),
    hud: hudHook,
    inventory: createInventoryHook(inventory, screen, {
      ...createPickupHook(craft),
      ...craftUiHook.inventory,
      ...createInventoryM6Extras({ inventory, storage, dropper, screen }),
    }),
    save: createSaveHook(save, (cx, cz) => restored.keys.has(colKey(cx, cz))),
    time: createTimeHook(time),
    sleep: gadgets.hook.sleep,
    kite: gadgets.hook.kite as TestHookGroups['kite'],
    combat: {
      ...combatHook,
      arrows: toolHook.arrows,
      /** 鳴らす頼み・鳴らした音の名前の列（呼ぶと空） */
      sounds: () => drainSounds(),
      events: () => [...combatHook.events(), ...toolHook.arrowEvents(), ...kodachiHookBuf.splice(0)],
    } as unknown as TestHookGroups['combat'],
    // NINJA-1: 調整表の 上書き（Object.assign(__rikkun.ninja.tune, { tekkoDamage: 10 })）・忍者帳・追い打ちの 待ち
    ninja: {
      tune: NINJA_TUNING as unknown as Record<string, number>,
      sense: SENSE,
      book: { got: () => ninjaBook.got(), set: (items) => ninjaBook.deserialize({ got: items }) },
      pending: () => kodachi.pending(),
    },
    // SAMURAI-1: 調整表は ninja.tune と 同じ（NINJA_TUNING 1 か所）。侍帳（E2E 用）・とばされにくさの 倍率・下駄の 数え
    samurai: {
      book: { got: () => samuraiBook.got(), set: (items) => samuraiBook.deserialize({ got: items }) },
      knockbackMul: () => knockbackMulOf(armor),
      getaTicks: () => geta.ticks(),
    },
    ...logHook,
    impact: {
      stopLeft: () => game.hitStopLeft(),
      trauma: () => rig.traumaNow(),
      log: () => impactBus.log.map((l) => ({ ...l })),
    },
    ui: { telop: (item: ItemId, source: 'nushi' | 'gasha' | 'chest' = 'nushi') => celebrate.enqueueTelop(item, source), coopMenu: () => coopMenu.model.info(), coopMenuPress: (button: string, id?: number) => coopMenu.press(button as never, id), meatText: () => itadakimasu.text(), alpha: () => uiAlpha(), topBand: () => celebrate.topBand(), buffs: () => buffModel.list().map((b) => ({ ...b })), houseNameBand: () => celebrate.houseNameBand() },
    craft: {
      ...craftHook,
      ...craftUiHook.craft,
      ...createCraftPanelHook(craftPanel),
      fx: () => celebrate.fxInfo(),
      sounds: () => celebrate.drainCraftSounds(),
    } as unknown as TestHookGroups['craft'],
    achievements: achievementsHook as unknown as TestHookGroups['achievements'],
    storage: storageHook as unknown as TestHookGroups['storage'],
    farm: createFarmHook({
      farm,
      visual: {
        texture: (n) => farmVisual.texture(n),
        look: (x, y, z) => {
          const l = farmVisual.look(x, y, z);
          return l ? ({ ...l, sway: sparkle.sway(x, y, z) } as typeof l) : l;
        },
      },
      inventory,
      facing: () => {
        const d = lookDirection(controller.state.yawDeg, controller.state.pitchDeg, facingTmp);
        return { dx: d.x, dz: d.z };
      },
      fx: () => ({
        particles: [...sparkle.list(), ...sprayFx.particles(game.tick), ...waterFx.particles()],
        counts: { star: sparkle.counts.star, heart: sparkle.counts.heart, spray: sprayFx.total, splash: waterFx.model.total },
      }),
      fxReset: () => {
        sparkle.reset();
        sprayFx.reset();
        waterFx.model.reset();
      },
      aimed: () => dig.target()?.block ?? null,
      bucketSpot: () => dig.bucketSpot(),
      give: (items) => {
        for (const st of items) {
          const left = inventory.add(st.item, st.count);
          if (left > 0) drops.scatter(controller.state.position, [{ item: st.item, count: left }]);
        }
      },
      store,
      seed,
      world,
      placement: computeFarmPlacement,
    }) as unknown as TestHookGroups['farm'],
    furnace: createFurnaceHook(craft, screen),
    armor: createArmorHook(armor, screen),
    level: createLevelHook(level),
    tool: toolHook.tool,
    bow: toolHook.bow,
    ...createYokaiHook(yokaiM),
    ...createBladeHook(blade, () => weaponFx.trailInfo()),
    animals: {
      spawn: (x, y, z, opts) => animals.spawn(x, y, z, opts),
      list: () => animals.list(),
      // GOLD-1 §6: なかよし パネル の 状態（`shown`・`hearts`・`gold`・`bugReady`・`petReady`）
      natsukiView: (id) => animals.natsukiView(id),
      clear: () => animals.clear(),
      trySpawn: () => animals.trySpawn(),
      target: () => dig.animalTarget(),
      events: () => {
        deliverAnimalEvents();
        return animalEvents.splice(0, animalEvents.length);
      },
      // LIVE-2.1 §6.2: こたつ の 3 わく・小屋 の 子 の 大きな しるし・こたつ の 中 の たまご の 3D の 物（いつも 0）・土けむり。絵 を 描く 側 が 同じ 名前 で 持って いれば そちら が 優先
      fx: () => {
        return { kitIcons: currentKitRows(), kitEggMeshes: 0, homePop: animals.homePop(), dust: 0, ...animalFx.fx() };
      },
      fxReset: () => animalFx.fxReset(),
      // 今 チップに出ている合図（120 ステップで消える。消えたら null）
      lastHint: () => animalHint.model.current(),
      carrying: () => animals.carrying(),
      throwSpot: () => animals.throwSpot(dig.throwAim()),
      throwTo: (x, y, z) => animals.throwTo(x, y, z),
      fighters: () => animals.fighters(),
      placeCoop: (x, y, z, dir) => animals.placeCoop(x, y, z, dir),
      coops: () => animals.coops(),
      kits: () => animals.kits(),
      machoMiss: (n) => animals.machoMiss(n),
      // LIVE-3 §6.1: えらべる 子 の 一覧・いただきます（メニュー の ボタン と 同じ）
      meatList: (coopId) => animals.meatList(coopId),
      meat: (coopId, id) => animals.meat(coopId, id),
      serialize: () => animals.serialize(),
      deserialize: (d) => animals.deserialize(d),
    },
    attack: { preview: () => dig.attackPreview(), last: () => dig.attackLast() },
    camera: cameraHook.camera,
    aim: {
      /** ねらいの点 X（§4.5） */
      point: () => ({ ...aimPointInto({ x: 0, y: 0, z: 0 }) }),
      /** 補助で えらんだ妖怪の id（線がそのまま当たっているときと いないときは null） */
      assist: () => {
        dig.aimedYokaiId();
        return combat.lastAssist;
      },
    },
    lock: {
      ...lockHook,
      /** ロックが はずれた ことに する。本物の ポインターロックも はなす（テストの クリックが ロック中の 要素へ 飛ばないように） */
      simulate: (locked: boolean) => {
        lockHook.simulate(locked);
        if (!locked && document.pointerLockElement) document.exitPointerLock();
      },
      /** 本を 出して その章の ② へ（動きなし・音なし）。BOOK-1 §4.4 */
      tab: (name: string) => {
        if (book.model.data.chapters.some((c) => c.id === name)) book.jump(name);
      },
      /** 本を 出して 'toc'・章の id・項目の id の ページへ（動きなし・音なし） */
      book: (target: string) => book.jump(target),
      /** 本だけの 描画回数・三角形（前回の 描画。性能の 記録用） */
      bookStats: () => book.renderInfo(),
      get: () => ({ ...lockHook.get(), ...book.state() }),
    },
    input: createInputHook(game.input, look, wheel),
    audio: createAudioHook({
      mixer,
      bgm,
      tracker: bgmScene,
      audio: audioSettings,
      fx: FX_SETTINGS,
      // contract 3.: chord は { root, minor }、t は秒（ゲームの時間）
      sfx: () => fxSound.drainRecords().map((r) => ({ ...r, chord: parseChord(r.chord), t: game.tick / 60 })),
      sfxVoices: () => fxSound.activeVoices(),
    }),
    rarity: createRarityHook(() => dig.config.dropMax),
    house: createHouseHook(house),
    settings: createSettingsHook(controller.settings, rig.config, [
        digSettingsView(dig.config),
        ITEM_RARITY_SETTINGS,
        settingsViewOf(craftConfig),
        settingsViewOf(toolConfig),
        settingsViewOf(craftUi, ['bakeTicks', 'pickupLogTicks', 'pickupLogMax']),
        craft2Settings,
        screenSettings,
        m6,
        m7,
        w2,
        hintSettings,
        aimCfg,
        live,
        { clockPhases },
        FX_SETTINGS,
        audioSettings,
        sharedSettingsView('knockback', [combat.config, yokaiM.config]),
        sharedSettingsView('yokaiLeaveTicks', [timeSettings, yokaiM.config]),
        sharedSettingsView('safeFallHeight', [combat.config, yokaiM.config]),
        sharedSettingsView('fallDamagePerBlock', [combat.config, yokaiM.config]),
        sharedSettingsView('waterSpeedMul', [controller.settings, yokaiM.config]),
        combat.config,
        yokaiM.config,
        timeSettings,
        renderer.config,
      ]),
  }, frameClock);
}
