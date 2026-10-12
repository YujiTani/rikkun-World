import { CameraRig } from './camera/CameraRig';
import { createCrosshair } from './camera/crosshair';
import { createCameraHook } from './camera/hook';
import { DigFx } from './fx/DigFx';
import { CombatFx } from './fx/combatFx';
import { createCombatUi } from './fx/combatUi';
import { PlayerCombatImpl, createCombatConfig, createCombatHook } from './combat';
import { ArmorSystemImpl, CraftSystemImpl, createArmorHook, createCraftConfig, createCraftHook, createFurnaceHook, createPickupHook } from './craft';
import { ToolSystemImpl, createToolConfig, createToolHook } from './tools';
import { ArrowVisuals } from './fx/arrowVisuals';
import { FurnaceFx } from './fx/furnaceFx';
import type { FurnaceFxEntry } from './fx/furnaceFxModel';
import { playCombat } from './fx/combatSounds';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from './fx/craftConfig';
import { playCraft } from './fx/craftSounds';
import { CraftUiHud, createCraftUiHook, handleCraftEvents, handleGuardEvents, playSwing } from './ui/craftUi';
import { PickupLog } from './ui/pickupLog';
import { PickupLogModel } from './ui/pickupLogModel';
import { itemRarity } from './drops/rarity';
import { itemType } from './inventory/items';
import { createGuideHook } from './ui/playOverlay';
import type { CombatEvent, ItemId, SwingAnim } from './contracts';
import { DropField } from './drops';
import { Lighting, Sky } from './sky';
import { TimeOfDayImpl, createTimeHook } from './time';
import { YokaiManager, createYokaiHook } from './yokai';
import { LevelSystem, createLevelHook } from './level';
import { LevelHud } from './ui/levelHud';
import { createRng } from './world/gen/random';
import { FX_SETTINGS } from './fx/config';
import { SoundFx } from './fx/sound';
import { DigSystemImpl, createDigConfig, createDigHook } from './dig';
import { InventoryImpl, createInventoryHook } from './inventory';
import { ScreenController } from './screen/ScreenController';
import { createScreenSettings } from './screen/config';
import { SaveManager, createSaveHook, parseSaveOptions, snapshotWorld, stripResetParam } from './save';
import { Hotbar } from './ui/hotbar';
import { InventoryScreen } from './ui/inventoryScreen';
import { Notice } from './ui/notice';
import { PerfOverlay } from './debug/perfOverlay';
import { installTestHook, type TestHookGroups } from './debug/testHook';
import { Game } from './game/Game';
import { buildScenery } from './game/scenery';
import { createSettingsHook } from './game/settings';
import { ActionState, bindKeyboardAndMouse } from './input/actions';
import { LockController, MouseLook, WheelAccumulator, bindPointerLock, createInputHook, createLockHook } from './input';
import { createPlayerHook } from './player/hook';
import { PlayerController } from './player/PlayerController';
import { mountHud } from './ui/hud';
import { PlayOverlay } from './ui/playOverlay';
import { ArrayVoxelWorld } from './world/VoxelWorld';
import { GEN_CONFIG } from './world/gen/config';
import { generateIsland } from './world/gen/generateIsland';
import { createWorldHook } from './world/hook';
import { WorldRenderer } from './world/render/WorldRenderer';
import { darkenFromBrightness, skyDarkness } from './world/light';

const container = document.getElementById('game')!;
const hud = document.getElementById('hud')!;

/** URL の ?seed=数 で島を変えられる（なければふだんのシード） */
function readSeed(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) ? n : GEN_CONFIG.defaultSeed;
}

/** dig.config のうち settings に出す名前だけを、そのまま読み書きできる見え方にする（digResumeTicks は出さない） */
/** 同じ名前の設定を 2 か所に書く（knockback はプレイヤーと妖怪の両方） */
function sharedSettingsView(name: string, targets: object[]): object {
  const view = {};
  Object.defineProperty(view, name, {
    enumerable: true,
    get: () => (targets[0] as Record<string, number>)[name],
    set: (v: number) => {
      for (const t of targets) (t as Record<string, number>)[name] = v;
    },
  });
  return view;
}

/** 設定の入れ物のうち、配列（fuelOrder）と除く名前を外した見え方（そのまま読み書きできる） */
function settingsViewOf(obj: object, exclude: readonly string[] = []): object {
  const view = {};
  for (const n of Object.keys(obj)) {
    if (n === 'fuelOrder' || exclude.includes(n)) continue;
    Object.defineProperty(view, n, {
      enumerable: true,
      get: () => (obj as Record<string, unknown>)[n],
      set: (v) => ((obj as Record<string, unknown>)[n] = v),
    });
  }
  return view;
}

function digSettingsView(cfg: DigSystemImpl['config']): object {
  const names = [
    'reach', 'hardness', 'harvestLevel', 'handPower', 'handLevel', 'digCooldown',
    'placeRepeatTicks', 'digDecayRate', 'crackStages', 'rarity', 'dropMax',
  ] as const;
  const view = {};
  for (const n of names) {
    Object.defineProperty(view, n, { enumerable: true, get: () => cfg[n], set: (v) => ((cfg as unknown as Record<string, unknown>)[n] = v) });
  }
  return view;
}

const game = new Game(container);

// 世界: 入れ物 → 島 → 絵
const world = new ArrayVoxelWorld();
const seed = readSeed();
const island = generateIsland(seed, world);
const baseline = snapshotWorld(world);
const renderer = new WorldRenderer(world);
renderer.setViewer(island.spawn().x, island.spawn().z);
renderer.attach(game.scene);
const lighting = new Lighting();
const sceneBefore = new Set(game.scene.children);
buildScenery(game.scene, world.size);
for (const child of game.scene.children) if (!sceneBefore.has(child)) lighting.registerTree(child, 'block');
for (const m of renderer.materials()) lighting.register(m, 'block');
const time = new TimeOfDayImpl();
const timeSettings = time.settings;
const sky = new Sky({ scene: game.scene, time, timeSettings, lighting, light: renderer.light, focus: () => controller.state.position });

// 入力・スタート画面
mountHud(hud);
const lock = new LockController();
const wheel = new WheelAccumulator(game.input, () => lock.playInputEnabled());
bindKeyboardAndMouse(window, game.input, wheel);
const look = new MouseLook(lock);
const pointerLock = bindPointerLock(document, window, game.renderer.domElement, lock, look, game.input);
const fxSound = new SoundFx();
const playOverlay = new PlayOverlay(hud, lock, () => pointerLock.request(), () => playCraft(fxSound, 'tab'));

// プレイヤーとカメラ
const controller = new PlayerController(world, game.input, look, lock, () => island.spawn());
// V（視点の切り替え）はロックがないあいだは無視する（T5 の指摘）。
// CameraRig には専用の ActionState を渡し、ロックがあるときだけ押しを写して読ませる。
const viewActions = new ActionState();
const rig = new CameraRig(game.camera, game.scene, world, () => controller.state, viewActions);
lighting.registerTree(rig.doll.group, 'doll');
const crosshair = createCrosshair(hud);
crosshair.setVisible(rig.crosshairVisible());

// 持ち物・画面の状態・ほる／おく
const inventory = new InventoryImpl();
const screenSettings = createScreenSettings();
const screen = new ScreenController(lock, inventory, game.input, screenSettings, pointerLock);
// 保存の要求は、あとで作る SaveManager へ（循環をさけるため関数でつなぐ）
let requestSave: () => void = () => {};
const hudSignal: { full: () => void } = { full: () => {} };
// 設定は 1 つずつ作って、settings から変えたら すぐ効くようにみんなで共有する
const combatCfg = createCombatConfig();
const digCfg = createDigConfig();
const craftConfig = createCraftConfig();
const toolConfig = createToolConfig();
// 画面の数値。焼く時間・ログの数は つくる側の設定と同じものを見る
const craftUi: CraftUiSettings = { ...CRAFT_UI_SETTINGS, fuelOrder: craftConfig.fuelOrder };
for (const n of ['bakeTicks', 'pickupLogTicks', 'pickupLogMax'] as const) {
  Object.defineProperty(craftUi, n, { enumerable: true, get: () => craftConfig[n], set: (v: number) => (craftConfig[n] = v) });
}
// 「いっぱい」の合図は 2 秒は出しなおさない（近くにいるあいだ毎ステップ呼ばれるため）
const FULL_SIGNAL_GAP_TICKS = 120;
let lastFullSignal = -FULL_SIGNAL_GAP_TICKS;
let onDropPicked: (item: ItemId, count: number) => void = () => {};
const drops = new DropField({
  world,
  inventory,
  player: () => controller.state.position,
  rng: createRng(seed ^ 0x5eed),
  live: combatCfg,
  requestSave: () => requestSave(),
  onFull: () => {
    if (game.tick - lastFullSignal < FULL_SIGNAL_GAP_TICKS) return;
    lastFullSignal = game.tick;
    hudSignal.full();
  },
  onPickup: (item, count) => onDropPicked(item, count),
});
let yokaiManager: YokaiManager | null = null;
// 経験値とレベル（妖怪をたおすと入る。レベルアップでハート全回復）
const level = new LevelSystem({
  tick: () => game.tick,
  requestSave: () => requestSave(),
  onLevelUp: () => combat.healFull(),
});
const armor = new ArmorSystemImpl(inventory, craftConfig);
const craft = new CraftSystemImpl({ world, inventory, drops, requestSave: () => requestSave(), config: craftConfig });
const tools = new ToolSystemImpl({
  inventory,
  world,
  player: () => controller.state,
  yokai: () => yokaiManager,
  base: { dig: digCfg, combat: combatCfg },
  config: toolConfig,
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
  yokai: () => yokaiManager!,
  spawn: () => island.spawn(),
  closeInventory: () => {
    if (screen.inventoryOpen()) screen.toggle();
  },
  requestSave: () => requestSave(),
  drops,
});
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
    armor,
    onPickup: (item, count) => craft.notifyPickup(item, count),
    scatterItem: (pos, item, count) => {
      drops.scatter(pos, [{ item, count }], { kind: 'yokai' });
    },
  },
);
yokaiManager = new YokaiManager({
  world,
  time,
  getPlayer: () => controller.state,
  combat,
  inventory,
  drops,
  tick: () => game.tick + 1,
  seed,
  light: renderer.light,
  onDefeat: (kind) => level.onDefeat(kind),
  // ぬりかべ: たおれこみでこわす・みず で石になる（くだけるつぶと音。fx はあとで作るので関数で包む）
  onBlocks: (cells, why) => {
    for (const c of cells) fx.particles.burst({ x: c.x, y: c.y, z: c.z }, why === 'stone' ? c.to : c.from, FX_SETTINGS);
    fxSound.play('break');
  },
});
game.scene.add(yokaiManager.group);
const yokaiM = yokaiManager;
rig.setHeldProvider(() => inventory.held()?.item ?? null);

// 出来事は 1 か所で 1 回だけ drain して、受け手（画面・音・人形）に配る。
// 受け手がその場で読む列は、この入れ物から渡す（読んだら空にする）
const NO_COMBAT: CombatEvent[] = [];
let combatBuf: CombatEvent[] = NO_COMBAT;
const NO_SWINGS: { anim: SwingAnim; tick: number }[] = [];
let swingBuf = NO_SWINGS;
rig.setSwingSource(() => {
  const r = swingBuf;
  swingBuf = NO_SWINGS;
  return r;
});
rig.setArmorProvider((slot) => armor.equipped(slot));
const arrowVisuals = new ArrowVisuals();
arrowVisuals.addTo(game.scene);

// 画面の見た目と音
const notice = new Notice(hud);
hudSignal.full = () => notice.showSignal('full');
const combatUi = createCombatUi(hud);
const levelHud = new LevelHud(hud);
const hotbar = new Hotbar(hud, inventory, notice);
const nameOf = (item: ItemId): string => itemType(item)?.name ?? item;
const inventoryScreen = new InventoryScreen(hud, inventory, screen, () => screen.toggle(), {
  craft,
  armor,
  furnaces: { get: (x, y, z) => craft.furnaceAt(x, y, z) },
  nameOf,
  rarityOf: itemRarity,
  placeable: (item) => itemType(item)?.placeBlock != null,
  onFull: () => notice.showSignal('full'),
  tools: toolConfig,
  ui: craftUi,
});
const pickupLog = new PickupLog(hud, { nameOf, rarityOf: itemRarity }, new PickupLogModel(craftUi));
const craftHud = new CraftUiHud({ hud, craft, inv: inventory, nameOf, rarityOf: itemRarity }, pickupLog);
const furnaceFx = new FurnaceFx(game.scene, fxSound, craftUi);
onDropPicked = (item, count) => {
  craft.notifyPickup(item, count);
  hotbar.pickup(item, count);
};
const fx = new DigFx({
  scene: game.scene,
  dig,
  sound: fxSound,
  doll: rig.doll,
  view: rig,
  notice,
  onPickup: (item, count) => hotbar.pickup(item, count),
});
const combatFx = new CombatFx({
  scene: game.scene,
  sound: fxSound,
  // 出来事は上の入れ物から（combat.drainEvents は main が 1 回だけ呼ぶ）
  combat: {
    hp: () => combat.hp(),
    maxHp: () => combat.maxHp(),
    dead: () => combat.dead(),
    invincibleTicks: () => combat.invincibleTicks(),
    drainEvents: () => {
      const r = combatBuf;
      combatBuf = NO_COMBAT;
      return r;
    },
  },
  yokai: yokaiM,
  time,
  bags: () => combat.bags(),
  doll: rig.doll,
  view: rig,
  hearts: combatUi.hearts,
  deathScreen: combatUi.deathScreen,
  homeNotice: combatUi.homeNotice,
  edge: combatUi.edge,
  clock: combatUi.clock,
  onPickup: (item, count) => hotbar.pickup(item, count),
});

// 自動セーブ（?nosave=1 は保存しない、?reset=1 は消してから始める）
const saveOptions = parseSaveOptions(location.search);
let store: Storage | null = null;
try {
  store = saveOptions.nosave ? null : window.localStorage;
} catch {
  store = null;
}
const save = new SaveManager({
  world,
  seed,
  baseline,
  inventory,
  player: {
    get: () => controller.state,
    set: (v) => controller.set({ position: v.position, velocity: v.velocity, yawDeg: v.yawDeg, pitchDeg: v.pitchDeg }),
    isThirdPerson: () => rig.getView() === 'third',
    setThirdPerson: (third) => {
      if ((rig.getView() === 'third') !== third) rig.toggleView();
    },
  },
  spawn: () => island.spawn(),
  store,
  tick: () => game.tick,
  settings: screenSettings,
  bags: { serialize: () => combat.serializeBags(), deserialize: (d) => combat.deserializeBags(d) },
  clock: time,
  furnaces: { serialize: () => craft.serializeFurnaces(), deserialize: (d) => craft.deserializeFurnaces(d) },
  armor: { serialize: () => armor.serialize(), deserialize: (d) => armor.deserialize(d) },
  level: { serialize: () => level.serialize(), deserialize: (d) => level.deserialize(d) },
});
requestSave = () => save.saveIfChanged();
if (saveOptions.reset) {
  save.clear();
  history.replaceState(null, '', stripResetParam(location.href));
} else {
  save.load();
}
lock.onChange((locked) => {
  if (!locked) save.saveIfChanged();
});
screen.onClose(() => {
  craft.closeFurnace();
  save.saveIfChanged();
});
save.bindPageEvents(window, document);

const overlay = new PerfOverlay(hud, game);

function updateFurnaceFx(dt: number): void {
  furnaceFx.update(dt, craft.furnaceFxEntries() as readonly FurnaceFxEntry[], controller.state.position);
}

// 毎ステップの順: プレイヤー → カメラ → 世界の作り直し →（Game が）入力の「押した」を消す
game.onUpdate((dt) => {
  time.update();
  // 空の光の弱まりを先に今の時刻にそろえる（妖怪の出現の「暗い所」がこれを読む。Sky は あとで画面ぶんを更新）
  skyDarkness.value = darkenFromBrightness(time.brightness(), timeSettings.nightBrightness);
  controller.update(dt);
  if (lock.playInputEnabled() && game.input.wasPressed('toggleView')) {
    viewActions.press('toggleView');
    viewActions.release('toggleView');
  }
  yokaiM.update();
  dig.update();
  combat.update();
  craft.update();
  // 出来事を 1 回だけ取り出して配る
  const craftEvents = craft.drainEvents();
  if (craftEvents.length > 0) {
    handleCraftEvents(craftEvents, { sound: fxSound, pickupLog });
    for (const e of craftEvents) rig.onCraftEvent(e);
  }
  const swings = tools.drainSwings();
  if (swings.length > 0) {
    const held = inventory.held()?.item ?? null;
    for (const sw of swings) playSwing(fxSound, sw.anim, held);
    swingBuf = swingBuf === NO_SWINGS ? swings : swingBuf.concat(swings);
  }
  for (const e of tools.drainArrowEvents()) {
    if (e.type === 'noArrow') notice.showSignal('noArrow');
    else if (e.type === 'arrowHit') playCombat(fxSound, 'hit');
  }
  const combatEvents = combat.drainEvents();
  if (combatEvents.length > 0) {
    for (const e of combatEvents) rig.onCombatEvent(e);
    handleGuardEvents(combatEvents, fxSound);
    combatBuf = combatEvents;
  }
  arrowVisuals.sync(tools.arrows());
  combatUi.hearts.setArmor(armor.snapshot().hudIcons);
  craftHud.update(dt);
  fx.update(dt);
  combatFx.update(dt);
  for (const e of level.drainEvents()) {
    if (e.type === 'levelUp') {
      levelHud.celebrate();
      fxSound.play('levelUp');
    }
  }
  levelHud.update(level.get());
  levelHud.tick(dt);
  updateFurnaceFx(dt);
  rig.update(dt);
  sky.update(game.camera);
  combatUi.clock.setTime(time.dayTick(), timeSettings);
  viewActions.endFrame();
  crosshair.setVisible(rig.crosshairVisible() && screen.mode() === 'play');
  hotbar.update();
  inventoryScreen.update();
  notice.update(dt);
  renderer.update({ x: game.camera.position.x, z: game.camera.position.z });
  save.update(game.tick + 1);
});
game.onUpdate((dt) => overlay.update(dt));
// ロックがないあいだは時間を止める。F3 だけは効く（M1-02 §2.4）
game.setRealtimeGate(() => lock.realtimeAllowed());
game.setTimeScale(() => screen.timeScale());
game.onIdle((dt) => overlay.update(dt));

const cameraHook = createCameraHook(rig);
const toolHook = createToolHook(tools);
const craftHook = createCraftHook(craft, screen);
const craftUiHook = createCraftUiHook({
  panel: inventoryScreen.craftPanel!,
  craft,
  inv: inventory,
  pickupLog,
  tooltip: inventoryScreen.tooltip!,
  armorClick: (slot) => armor.click(slot),
});
const guideHook = createGuideHook(playOverlay);
const lockHook = createLockHook(lock);
const combatHook = createCombatHook(combat);
installTestHook(game, overlay, {
  world: createWorldHook(world, renderer, island),
  render: { chunks: () => renderer.chunkStats() },
  player: { ...createPlayerHook(controller), doll: cameraHook.doll } as unknown as TestHookGroups['player'],
  ...createDigHook(dig),
  inventory: createInventoryHook(inventory, screen, { ...createPickupHook(craft), ...craftUiHook.inventory }),
  save: createSaveHook(save),
  time: createTimeHook(time),
  combat: {
    ...combatHook,
    arrows: toolHook.arrows,
    events: () => [...combatHook.events(), ...toolHook.arrowEvents()],
  } as unknown as TestHookGroups['combat'],
  craft: { ...craftHook, ...craftUiHook.craft },
  furnace: createFurnaceHook(craft, screen),
  armor: createArmorHook(armor, screen),
  level: createLevelHook(level),
  tool: toolHook.tool,
  ...createYokaiHook(yokaiM),
  camera: cameraHook.camera,
  lock: {
    ...lockHook,
    tab: guideHook.tab,
    get: () => ({ ...lockHook.get(), ...guideHook.state() }),
  },
  input: createInputHook(game.input, look, wheel),
  settings: createSettingsHook(controller.settings, rig.config, [
      digSettingsView(dig.config),
      settingsViewOf(craftConfig),
      settingsViewOf(toolConfig),
      settingsViewOf(craftUi, ['bakeTicks', 'pickupLogTicks', 'pickupLogMax']),
      screenSettings,
      FX_SETTINGS,
      sharedSettingsView('knockback', [combat.config, yokaiM.config]),
      sharedSettingsView('yokaiLeaveTicks', [timeSettings, yokaiM.config]),
      sharedSettingsView('safeFallHeight', [combat.config, yokaiM.config]),
      sharedSettingsView('fallDamagePerBlock', [combat.config, yokaiM.config]),
      sharedSettingsView('waterSpeedMul', [controller.settings, yokaiM.config]),
      combat.config,
      yokaiM.config,
      timeSettings,
    ]),
});
game.start();
