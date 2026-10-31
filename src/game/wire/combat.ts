// main.ts の 流れ 4: 戦い・道具・レジェンダリー・たんす・作る・農業・掘る。
import { aimPivot } from '../../camera/pivot';
import { PlayerCombatImpl } from '../../combat';
import { ArmorSystemImpl, CraftSystemImpl } from '../../craft';
import { ToolSystemImpl } from '../../tools';
import { createBladeSystem } from '../../tools/blade/BladeSystem';
import { createParry } from '../../combat/parry';
import { ParryFx } from '../../fx/parryFx';
import { playLegend, startLegendLoop, startLegendOneShot } from '../../fx/legendSounds';
import { createLegendSystem } from '../../legend/LegendSystem';
import { createWaveSystem } from '../../legend/WaveSystem';
import { createSpiralDebris } from '../../legend/spiralDebris';
import { createChargeLight } from '../../legend/chargeLight';
import { pointOnScreen, FIRST_DEPTH, CHEST_UP, newHandInfo, computeHand } from '../../legend/handPos';
import { WindWaveFx } from '../../fx/windWaveFx';
import { SpiralFx } from '../../fx/spiralFx';
import { createWaveView3D } from '../../legend/waveView';
import { ChargeLightFx } from '../../fx/chargeLightFx';
import { NijiFx } from '../../fx/nijiFx';
import { SlashFx } from '../../fx/slashFx';
import { FujinOrbitFx } from '../../fx/fujinOrbitFx';
import { RaijinStormFx } from '../../fx/raijinStormFx';
import { RainbowFx } from '../../fx/rainbowFx';
import { createDomeGrains } from '../../legend/domeGrains';
import { createBuffModel } from '../../ui/buffIconsModel';
import { ThunderFx } from '../../fx/thunderFx';
import { tekkoBladeMulOf } from '../../craft/samuraiPower';
import { GetaStepper } from '../../craft/geta';
import { playGeta } from '../../fx/getaSounds';
import { legendPowerOf, chargeOf } from '../../legend/defs';
import type { SwingAnim } from '../../contracts';
import { StorageSystem } from '../../storage/StorageSystem';
import { ItemDropper, DropController } from '../../storage/ItemDropper';
import { playStorage } from '../../fx/storageSounds';
import { LevelSystem } from '../../level';
import { createRng } from '../../world/gen/random';
import { DigSystemImpl } from '../../dig';
import { createFarmSystem } from '../../farm';
import { setWaterCapacity } from '../../ui/waterGauge';
import { createSprinklers } from '../../farm/sprinkler';
import { Pet } from '../../farm/pet';
import { createWatering } from '../../farm/watering';
import { createBucket } from '../../farm/bucket';
import { setCanCapacitySource } from '../../tools/durability';
import { raycastBlocks, lookDirection } from '../../dig/raycast';
import { pickAimAssist } from '../../camera/aimAssist';
import { computeFarmPlacement } from '../../world/gen/farmPlacement';
import { NO_SWINGS } from './shared';
import { wireGadgets } from './gadgets';
import { wireSeat } from './seat';
import { playSleepJingle } from '../../fx/sleepJingle';
import type { WiredDrops } from './inventory';

export function wireWeapons(deps: WiredDrops) {
  const {
    shared, game, inventory, craftConfig, w2, world, controller, digCfg, combatCfg, toolConfig, fxSound,
    seed, screen, rig,
  } = deps;
  // 実績は あとで作る（たいきゅうの へった量を わたす先）
  // 経験値とレベル（妖怪をたおすと入る。レベルアップでハート全回復）
  const level = new LevelSystem({
    tick: () => game.tick,
    requestSave: () => shared.requestSave(),
    onLevelUp: () => shared.combat.healFull(),
  });
  const armor = new ArmorSystemImpl(inventory, craftConfig, { settings: () => w2, tick: () => game.tick });
  const tools = new ToolSystemImpl({
    inventory,
    world,
    player: () => controller.state,
    yokai: () => shared.yokaiManager,
    base: { dig: digCfg, combat: combatCfg },
    config: toolConfig,
    settings: w2,
  });
  const blade = createBladeSystem({
    world,
    yokai: () => shared.yokaiManager!,
    settings: w2,
    // WEAPON-7: レジェンダリーの 強さは 設定 `legendary` の power（ふつうの 刀は 今の 表）
    // 虹は 1 本ごとの 強さ（手に 持っている 1 本）
    // SAMURAI-1 §4.5: 明珍手甲を 着ていれば 刀の 強さ × 1.5（わざの 倍率の 前に かける）
    weaponDamage: (item) => (legendPowerOf(w2, item, item === 'niji' ? (inventory.held()?.power ?? null) : null) ?? toolConfig.weaponDamage[item] ?? 1) * tekkoBladeMulOf(armor, item),
    onHit: () => {
      inventory.wearHeld(w2.toolWear.blade.hit);
    },
    lunge: (dx, dz) => controller.lunge(dx, dz),
    tick: () => game.tick,
  });
  // WEAPON-7: レジェンダリー武器の ため・ためわざ（落雷）。たいきゅうは 1 体 以上に 当たった ときだけ 1
  const legend = createLegendSystem({
    world,
    yokai: () => shared.yokaiManager!,
    settings: w2,
    tick: () => game.tick,
    onWear: () => {
      inventory.wearHeld(1);
    },
    sound: (n) => playLegend(fxSound, n),
    // WEAPON-8 §3.6: ため音は 続く 音。剣ごとの 味（風神 / 雷神）は ためわざの しゅるいで えらぶ
    loop: (name) => (name === 'domePull' ? startLegendLoop(fxSound, name) : startLegendLoop(fxSound, name, chargeOf(w2, inventory.held()?.item ?? null)?.kind === 'spiral' ? 'fujin' : chargeOf(w2, inventory.held()?.item ?? null)?.kind === 'shining' ? null : 'raijin')),
    // WEAPON-8: らせんの かぜは F6 に 体の 点 B（足もと + 1.4）から
    powerMul: (item) => tekkoBladeMulOf(armor, item), // SAMURAI-1: 雷・ドームの 強さ P × 手甲
    launchSpiral: (a) => {
      const p = controller.state.position;
      waveSys.launchSpiral({ item: a.item, dirDeg: a.dirDeg, body: { x: p.x, y: p.y + 1.4, z: p.z } });
    },
    seed,
  });
  const nijiC = { x: 0, y: 0, z: 0 };
  const nijiCenter = (p: { x: number; y: number; z: number }) => {
    nijiC.x = p.x;
    nijiC.y = p.y + 0.9;
    nijiC.z = p.z;
    return nijiC;
  };
  screen.canOpen = () => !legend.locked();
  const waveView3d = createWaveView3D(game.camera);
  // WEAPON-7 PR2: 風神剣の 真空波（ふつうの わざの 当たりの はじめの F に 1 つ。たいきゅうは へらさない）
  const waveSys = createWaveSystem({
    world,
    yokai: () => shared.yokaiManager!,
    settings: w2,
    tick: () => game.tick,
    emit: (e) => legend.emit(e),
    sound: (v) => playLegend(fxSound, 'windWave', v),
    spiralSound: () => startLegendOneShot(fxSound, 'spiralWind'),
    onSpiralHit: () => inventory.wearHeld(1),
    powerMul: (item) => tekkoBladeMulOf(armor, item), // SAMURAI-1: 真空波・らせんの 強さ P × 手甲（出した ステップに 1 回）
    reducedMotion: () => reducedMotionMq?.matches ?? false,
    view: () => waveView3d.view(),
    seed,
  });
  // WEAPON-5: 刀のパリィ（Shift＋クリック）。「動きを へらす」のときは スローにしない
  const reducedMotionMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const parry = createParry(w2, { reducedMotion: () => reducedMotionMq?.matches ?? false });
  // SAMURAI-1 §4.6: 下駄の 1 歩（音は 4 つから 1 つ。ファイルは 最初の 操作の あとに 読みこむ）
  const geta = new GetaStepper(armor, () => playGeta(fxSound));
  const parryFx = new ParryFx({ scene: game.scene, camera: game.camera, basePath: './models/fx/' });
  const sparkAt = { x: 0, y: 0, z: 0 };
  const thunderFx = new ThunderFx({ scene: game.scene, camera: game.camera, seed });
  // ART-PIPE-1: 落雷の 間だけ 世界を 絵に 描く 道（深さを 読む 雷・まわりを 明るく）
  // 虹の 発光（ブルーム）も この 道で: 虹が 出て いない 間は 回さない。落雷の 間は 雷の 道を 優先
  const rainbowFx = new RainbowFx(game.scene, game.camera, (tech) => w2.bladeTech[tech]);
  game.setWorldPass({
    active: () => thunderFx.active() || rainbowFx.active(),
    render: (r, sc, cam) => {
      if (thunderFx.active()) thunderFx.render(r, sc, cam);
      else rainbowFx.renderWorld(r, sc, cam);
    },
  });
  thunderFx.warmUp(game.renderer, game.camera); // 読みこみ中に 雷 B の プログラムを 作る
  const windWaveFx = new WindWaveFx({ scene: game.scene, camera: game.camera });
  // WEAPON-8: らせんの かぜ（S2）・土と 草の つぶ・手もとの 光・速さバフの アイコン
  const spiralFx = new SpiralFx({ scene: game.scene, camera: game.camera });
  // WEAPON-9: 虹の ドーム・かけら・すいよせの つぶ・斬撃（材質は 読みこみ中に ぜんぶ 作る）
  const nijiFx = new NijiFx(game.scene, game.camera);
  const domeGrains = createDomeGrains();
  nijiFx.warmUp(game.renderer, game.camera, game.scene);
  const slashFx = new SlashFx(game.scene, game.camera);
  slashFx.warmUp(game.renderer, game.camera, game.scene);
  // 白い 斬撃の 上の 層（武器ごとの エフェクト）: 雷神剣 = 段ごとに 強くなる 黄色い 雷・風神剣 = 体の まわりを まわる 風の 帯
  const raijinFx = new RaijinStormFx(game.scene, game.camera, (tech) => w2.bladeTech[tech]);
  const fujinFx = new FujinOrbitFx(game.scene, game.camera);
  raijinFx.warmUp(game.renderer, game.camera, game.scene);
  fujinFx.warmUp(game.renderer, game.camera, game.scene);
  rainbowFx.warmUp(game.renderer, game.camera, game.scene); // ブルームの 作業用の 絵と プログラムも 読みこみ中に
  const spiralDebris = createSpiralDebris({ world, seed });
  const chargeLight = createChargeLight();
  const chargeLightFx = new ChargeLightFx({ scene: game.scene, camera: game.camera });
  /** WEAPON-9 §5.8: ため中の 光が あつまる 体の 中心（むね = 足もと ＋ 約 1.1）。一人称は 画面の まん中より 少し 下 */
  const _chest = { x: 0, y: 0, z: 0 };
  function chargeChest(): { x: number; y: number; z: number } {
    const p = controller.state.position;
    if (handInfo.first) return pointOnScreen(game.camera, 0.5, 0.6, FIRST_DEPTH, _chest);
    _chest.x = p.x;
    _chest.y = p.y + CHEST_UP;
    _chest.z = p.z;
    return _chest;
  }
  const handInfo = newHandInfo();
  /** 今の 剣を 持つ 手の 位置（三人称は 体から、一人称〈カメラが 体に 近く 人形が 見えない〉は 画面の 右下の にぎり） */
  const handNow = (): typeof handInfo => {
    game.camera.updateMatrixWorld();
    return computeHand({ first: rig.getInfo().hideChar, pos: controller.state.position, yawDeg: controller.state.yawDeg, camera: game.camera }, handInfo);
  };
  const buffModel = createBuffModel();
  controller.lungeYokai = () => (shared.yokaiManager ? shared.yokaiManager.list() : []);
  return {
    level, armor, tools, blade, legend, nijiCenter, waveSys, reducedMotionMq, parry, geta, parryFx,
    sparkAt, thunderFx, rainbowFx, windWaveFx, spiralFx, nijiFx, domeGrains, slashFx, raijinFx, fujinFx,
    spiralDebris, chargeLight, chargeLightFx, chargeChest, handInfo, handNow, buffModel,
  };
}

type WiredWeapons = WiredDrops & ReturnType<typeof wireWeapons>;

export function wireFighters(deps: WiredWeapons) {
  const {
    shared, combatCfg, tools, armor, world, controller, inventory, startPoint, legend, screen, drops, m6,
    game, fxSound, craftConfig, craft2Settings, lock, timeSettings, m7, renderer, seed, island, digCfg,
    harapanRoll, animals, live, blade, parry, w2, rig, hud, time,
  } = deps;
  // ITEM-FX-1: ふとんで ねる・たこ・わらじ
  const gadgets = wireGadgets({
    hud,
    scene: game.scene,
    time,
    tick: () => game.tick,
    held: () => inventory.held()?.item ?? null,
    controller,
    armor,
    lock,
    onSleepStart: () => playSleepJingle(fxSound),
  });
  const combat = new PlayerCombatImpl({
    config: combatCfg,
    tool: tools,
    armor,
    onPickup: (item, count) => craft.notifyPickup(item, count),
    world,
    player: {
      get: () => controller.state,
      set: (v) => controller.set(v),
    },
    inventory,
    yokai: () => shared.yokaiManager!,
    spawn: startPoint,
    // WEAPON-9: シャイニング中は 受ける ダメージ 1/3・落下ダメージなし
    takenMul: () => legend.takenMul(),
    noFall: () => legend.noFall() || shared.protoNoFall,
    // 妖怪のねらい（CHAR-1 第 5.2 版 §4.5）: 届く距離は P から。S からの線で当たらないときは やさしい ねらい補助
    reachOrigin: (out) => aimPivot(world, controller.state.position, out),
    assist: (eye, dir, reach) => aimAssistPick(eye, dir, reach),
    closeInventory: () => {
      if (screen.inventoryOpen()) screen.toggle();
    },
    requestSave: () => shared.requestSave(),
    drops,
  });
  shared.combat = combat;
  // たんす（M6 §2.9）と すてる（§2.8）
  const storage = new StorageSystem({
    world,
    inventory,
    player: () => controller.state.position,
    scatter: (p, stacks) => {
      drops.scatter(p, stacks);
    },
    inventoryOpen: () => screen.inventoryOpen(),
    openScreen: () => {
      screen.toggle();
      shared.toItemsTab(); // たんす は もちもの タブで開く（できごと・じっせき の画面が のこっていても）
    },
    closeScreen: () => screen.toggle(),
    live: m6,
    tick: () => game.tick,
    requestSave: () => shared.requestSave(),
    onSound: (name) => playStorage(fxSound, name),
    // たんす の いっぱい は 実績（いっぱいにした）に数えない（もちものだけ）
    onFull: (which) => {
      // たんす が いっぱい: 画面の合図は今のまま。履歴には「たんす が いっぱい！」を 1 件（もちもの の文は 入れない）
      if (which === 'tansu') {
        shared.log.signal('tansuFull');
        shared.skipSignalLog = true;
        shared.showSignalRaw('full');
        shared.skipSignalLog = false;
      } else shared.showSignalRaw('full');
    },
  });
  // つくる・やく（CRAFT-2: たんす の素材も数える。たんす を先に作る）
  const craft = new CraftSystemImpl({ world, inventory, drops, requestSave: () => shared.requestSave(), config: craftConfig, tansu: storage, player: () => controller.state.position, tansuRange: () => craft2Settings.craftTansuRange });
  const dropper = new ItemDropper({
    inventory,
    storage,
    armor,
    throwItem: (st) => drops.throwItem(st, controller.state.yawDeg, controller.settings.eyeHeight),
    tick: () => game.tick,
    onThrown: () => {
      playStorage(fxSound, 'throw');
      const sw = { anim: 'throw' as SwingAnim, tick: game.tick };
      shared.swingBuf = shared.swingBuf === NO_SWINGS ? [sw] : shared.swingBuf.concat(sw);
    },
  });
  const dropController = new DropController({
    blocked: () => legend.locked(),
    actions: game.input,
    dropper,
    playEnabled: () => lock.playInputEnabled() && !screen.inventoryOpen(),
    inventoryOpen: () => screen.inventoryOpen(),
    hover: () => shared.dragOut?.hoverTarget() ?? null,
  });
  // 農業（M7）。作物の段階を描画へ、出来事は 毎ステップ 1 回だけ drain して配る
  // ふるい たんす の場所（置いたとき・保存を読んだあとに 1 回だけ決める）
  const dayLengthNow = () => timeSettings.dayTicks + timeSettings.duskTicks + timeSettings.nightTicks + timeSettings.dawnTicks;
  // M7-2: スプリンクラーの はんい（B）・ごきげん（C）
  setWaterCapacity(() => m7.farmCanCapacity);
  setCanCapacitySource(() => m7.farmCanCapacity);
  const sprinklers = createSprinklers({ radius: () => m7.farmSprinklerRadius });
  const pet = new Pet({ settings: m7, dayLength: dayLengthNow });
  const farm = createFarmSystem({
    sprinkler: sprinklers,
    pet,
    world,
    light: renderer.light,
    seed,
    dayLength: dayLengthNow,
    settings: m7,
    tick: () => game.tick,
    fillTansu: (pos, items) => {
      shared.oldTansu = { x: pos.x, y: pos.y, z: pos.z };
      items.forEach((st, i) => storage.set(pos.x, pos.y, pos.z, i, st));
    },
    placement: computeFarmPlacement,
    regions: () => island.regions(),
  });
  renderer.setCropStageSource({ stageAt: (x, y, z) => farm.crop(x, y, z)?.stage ?? null });
  // ブロックを 置く・こわす → スプリンクラーの 追いかけ（農業の 出来事 sprinklerPlaced / Broken もここから）
  {
    const setBlock = world.setBlock.bind(world);
    world.setBlock = (x, y, z, id) => {
      const before = world.getBlock(x, y, z);
      const ok = setBlock(x, y, z, id);
      if (ok && before !== 'outside' && before !== id) farm.onBlockChanged(x, y, z, before, id);
      return ok;
    };
    const fill = world.fill.bind(world);
    world.fill = (x0, y0, z0, x1, y1, z1, id) => {
      const had = sprinklers.peek().length > 0;
      const n = fill(x0, y0, z0, x1, y1, z1, id);
      if (n > 0 && (had || (id as string) === 'sprinkler')) sprinklers.rescan(world);
      return n;
    };
  }
  // HOUSE-1D: 家具の はたらき（いす・おふろ・ほんだな）
  const furniture = wireSeat({ game, world, controller, combat, rig, book: deps.book, lock, pointerLock: deps.pointerLock });
  // #293 試作: 体の 上に ブロックを 置く 口（?proto=gashaBig の ときだけ 後から 入る）
  const dig = new DigSystemImpl(
    world,
    () => controller.state,
    game.input,
    lock,
    inventory,
    () => controller.settings.eyeHeight,
    digCfg,
    createRng(20240601),
    combat,
    {
      bodyBlocks: {
        aim: (o, d, reach) => shared.gashaBodyBlocks?.aim(o, d, reach) ?? null,
        canPlace: (cell, block) => shared.gashaBodyBlocks?.canPlace(cell, block) ?? false,
        place: (cell, block) => shared.gashaBodyBlocks?.place(cell, block) ?? false,
        remove: (cell) => shared.gashaBodyBlocks?.remove(cell) ?? null,
        accepts: (block) => shared.gashaBodyBlocks?.accepts(block) ?? false,
        solid: (x, y, z) => shared.gashaBodyBlocks?.solid(x, y, z) ?? false,
        surfaceBelow: (x, y, z) => shared.gashaBodyBlocks?.surfaceBelow(x, y, z) ?? null,
      },
      tools,
      craft: {
        isFurnace: (x, y, z) => craft.isFurnace(x, y, z),
        // かまど を右クリック: 中を開いて、もちもの画面（やく）を出す
        openFurnace: (x, y, z) => {
          craft.openFurnace(x, y, z);
          if (!screen.inventoryOpen()) screen.toggle();
        },
        furnaceBroken: (x, y, z) => craft.furnaceBroken(x, y, z),
        fixedDrop: (id) => craft.fixedDrop(id),
      },
      armor: { tryEquip: (item) => armor.tryEquip(item), canEquip: (item) => armor.slotFor(item) !== null },
      storage,
      onPickup: (item, count) => craft.notifyPickup(item, count),
      scatterItem: (pos, item, count) => {
        drops.scatter(pos, [{ item, count }]);
      },
      harapan: (id, y) => harapanRoll.block(id, y),
      farm,
      water: createWatering({ farm, inventory, settings: m7, tick: () => game.tick }),
      bucket: createBucket({ inventory, emit: (e) => farm.emit(e), tick: () => game.tick }),
      pet,
      animals,
      eggHeal: () => live.animalEggHeal,
      meatHeal: () => live.meatHeal,
      coopMenu: (id) => shared.openCoopMenu(id),
      // HOUSE-1A: 建築士さん（wireHouse で あとから 作る ので 関数で 包む）
      architects: {
        rayHit: (origin, dir, reach) => shared.house?.manager.rayHit(origin, dir, reach) ?? null,
        talk: (id) => shared.house?.talkTo(id) ?? false,
        hit: (id) => shared.house?.hit(id),
      },
      // HOUSE-1C PR-2: 建築中の 場所の 守りと みずもり・どうづき（wireHouse で あとから 作る ので 関数で 包む）
      build: {
        locked: (x, y, z) => shared.house?.build.builder.locked(x, y, z) ?? false,
        level: (x, y, z) => shared.house?.build.useLevel(x, y, z),
        tamp: (x, y, z) => shared.house?.build.useTamp(x, y, z),
      },
      live: () => ({ netSwingTicks: live.netSwingTicks, carryHoldTicks: live.carryHoldTicks, coopCountMax: live.coopCountMax, coopMax: live.coopMax, kitEggMax: live.kitEggMax }),
      emitFarm: (e) => farm.emit(e),
      nowTick: () => game.tick,
      vitals: combat,
      blade,
      legend,
      parry,
      w2,
      yokai: () => shared.yokaiManager!,
      gadgets: gadgets.port,
      furniture: furniture.port,
    },
  );
  // ねらいの線・矢・刀・パンチの出どころは 目でなく 回転の中心 P（CHAR-1 §4.5）
  dig.aimOrigin = (_p, out) => rig.aimOrigin(out); // ねらいの線の出どころは 肩の点 S
  dig.reachOrigin = (p, out) => aimPivot(world, p.position, out); // 届く距離は P から
  // WEAPON-3: 体の点 B = P の 真上で 肩の点 S と 同じ高さ（右へは ずらさない）
  dig.bodyOrigin = (_p, out) => rig.aimOrigin(out);
  // ねらい補助の 設定（settings の aimAssistDeg）と、そのつなぎ（CHAR-1 第 5.2 版 §4.5）
  const aimCfg = { aimAssistDeg: 4 };
  const assistP = { x: 0, y: 0, z: 0 };
  const assistDir = { x: 0, y: 0, z: 0 };
  const assistShoulder = { x: 0, y: 0, z: 0 };
  function aimAssistPick(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, reach: number): number | null {
    if (!(aimCfg.aimAssistDeg > 0)) return null;
    return pickAimAssist({
      camera: game.camera.position,
      dir,
      shoulder: eye,
      pivot: aimPivot(world, controller.state.position, assistP),
      reach,
      assistDeg: aimCfg.aimAssistDeg,
      boxes: shared.yokaiM.aimBoxes(),
      blocked: (from, to) => {
        const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-6) return false;
        assistDir.x = dx / len; assistDir.y = dy / len; assistDir.z = dz / len;
        return raycastBlocks(world, from.x, from.y, from.z, assistDir.x, assistDir.y, assistDir.z, len, true) !== null;
      },
    });
  }
  /** ねらいの点 X（S から D の線で 最初に当たる 固いブロックか 妖怪の箱の点。なければ S + D × 64） */
  const AIM_FAR = 64;
  function aimPointInto(out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const st = controller.state;
    const S = rig.aimOrigin(assistShoulder);
    const D = lookDirection(st.yawDeg, st.pitchDeg, assistDir);
    const b = raycastBlocks(world, S.x, S.y, S.z, D.x, D.y, D.z, AIM_FAR, true);
    const y = shared.yokaiM.raycast(S, D, b ? b.distance : AIM_FAR);
    const t = y ? y.distance : b ? b.distance : AIM_FAR;
    out.x = S.x + D.x * t;
    out.y = S.y + D.y * t;
    out.z = S.z + D.z * t;
    return out;
  }
  // 矢は P から X へ向けて出す（CHAR-1 第 5.2 版 §4.5）
  {
    const toolStep = tools.step.bind(tools);
    const aimX = { x: 0, y: 0, z: 0 };
    const aimPv = { x: 0, y: 0, z: 0 };
    const aimV = { x: 0, y: 0, z: 0 };
    tools.step = (primary, _eye, dir) => {
      const pv = aimPivot(world, controller.state.position, aimPv);
      aimPointInto(aimX);
      const dx = aimX.x - pv.x, dy = aimX.y - pv.y, dz = aimX.z - pv.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-3) toolStep(primary, pv, dir);
      else {
        aimV.x = dx / len; aimV.y = dy / len; aimV.z = dz / len;
        toolStep(primary, pv, aimV);
      }
    };
  }
  return {
    combat, storage, craft, dropper, dropController, sprinklers, pet, farm, dig, aimCfg, aimPointInto, gadgets,
    seat: furniture.seat,
  };
}

export type WiredFighters = WiredWeapons & ReturnType<typeof wireFighters>;
