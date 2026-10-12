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
import { createM6Settings, type AchievementId, type CombatEvent, type DefeatWith, type DigEvent, type ItemId, type SwingAnim, type YokaiKind } from './contracts';
import { ACHIEVEMENT_DEFS, AchievementSystem, AchievementsPageModel, createAchievementsHook, type StepContext } from './achievements';
import { CelebrateUi } from './ui/celebrate';
import { AchievementsPage, achievementArtUrl } from './ui/achievementsPage';
import { StorageSystem } from './storage/StorageSystem';
import { createStorageHook, createInventoryM6Extras } from './storage/hook';
import { ItemDropper, DropController } from './storage/ItemDropper';
import { StorageScreen } from './ui/storageScreen';
import { DragOut } from './ui/dragOut';
import { playStorage } from './fx/storageSounds';
import { CraftMadeTracker } from './ui/craftModel';
import { createItemInfo, type InfoNumbers } from './craft/info';
import { createCraftPanelHook } from './craft/hook';
import { mountInventoryTabs } from './ui/craftPanel.tabs';
import { noticeCluster } from './ui/craftHint';
import { CLOCK_PHASES, type ClockPhases } from './ui/clockModel';
import { markUrl } from './ui/medalArt';
import { itemIconUrl } from './ui/itemIcon';
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
// M6 の設定（実績・演出・すてる・たんす）。settings から変えたら すぐ効く
const m6 = createM6Settings();
// E でたんす: ScreenController より先に押しを聞く（画面は ScreenController が開く）
let tryOpenTansu: () => boolean = () => false;
let modalIsOpen: () => boolean = () => false;
game.input.onPress((action) => {
  if (action === 'toggleInventory' && !modalIsOpen()) tryOpenTansu();
});
const screen = new ScreenController(lock, inventory, game.input, screenSettings, pointerLock);
modalIsOpen = () => screen.modalOpen() || screen.inventoryOpen();
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
// 落とし物の設定: 戦いの設定（消えるまで・拾う距離）と M6 の すてる設定をひとつに見せる
const dropLive = {
  get dropBagTicks() {
    return combatCfg.dropBagTicks;
  },
  get pickupRadius() {
    return combatCfg.pickupRadius;
  },
  get dropPickupDelay() {
    return m6.dropPickupDelay;
  },
  get dropThrowSpeed() {
    return m6.dropThrowSpeed;
  },
  get dropThrowUp() {
    return m6.dropThrowUp;
  },
};
let onDropPicked: (item: ItemId, count: number) => void = () => {};
const drops = new DropField({
  world,
  inventory,
  player: () => controller.state.position,
  rng: createRng(seed ^ 0x5eed),
  live: dropLive,
  requestSave: () => requestSave(),
  onFull: () => {
    if (game.tick - lastFullSignal < FULL_SIGNAL_GAP_TICKS) return;
    lastFullSignal = game.tick;
    hudSignal.full();
  },
  onPickup: (item, count) => onDropPicked(item, count),
});
let yokaiManager: YokaiManager | null = null;
let onDefeatAch: (kind: YokaiKind) => void = () => {};
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
// たんす（M6 §2.9）と すてる（§2.8）
const storage = new StorageSystem({
  world,
  inventory,
  player: () => controller.state.position,
  scatter: (p, stacks) => {
    drops.scatter(p, stacks);
  },
  inventoryOpen: () => screen.inventoryOpen(),
  openScreen: () => screen.toggle(),
  closeScreen: () => screen.toggle(),
  live: m6,
  tick: () => game.tick,
  requestSave: () => requestSave(),
  onSound: (name) => playStorage(fxSound, name),
  // たんす の いっぱい は 実績（いっぱいにした）に数えない（もちものだけ）
  onFull: () => showSignalRaw('full'),
});
const dropper = new ItemDropper({
  inventory,
  storage,
  armor,
  throwItem: (st) => drops.throwItem(st, controller.state.yawDeg, controller.settings.eyeHeight),
  tick: () => game.tick,
  onThrown: () => {
    playStorage(fxSound, 'throw');
    const sw = { anim: 'throw' as SwingAnim, tick: game.tick };
    swingBuf = swingBuf === NO_SWINGS ? [sw] : swingBuf.concat(sw);
  },
});
let dragOut: DragOut | null = null;
const dropController = new DropController({
  actions: game.input,
  dropper,
  playEnabled: () => lock.playInputEnabled() && !screen.inventoryOpen(),
  inventoryOpen: () => screen.inventoryOpen(),
  hover: () => dragOut?.hoverTarget() ?? null,
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
    storage,
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
  onDefeat: (kind) => {
    level.onDefeat(kind);
    onDefeatAch(kind);
  },
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
// 「もちもの が いっぱい」の合図は 実績（いっぱいにした）にも数える
let onFullSignal: () => void = () => {};
const showSignalRaw = notice.showSignal.bind(notice);
notice.showSignal = (kind) => {
  if (kind === 'full') onFullSignal();
  showSignalRaw(kind);
};
hudSignal.full = () => notice.showSignal('full');
// 時計の ひる の分け方（settings の clockPhases）
const clockPhases: ClockPhases = { ...CLOCK_PHASES };
const combatUi = createCombatUi(hud, clockPhases);
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
  events: () => {
    const r = digBuf;
    digBuf = NO_DIG;
    return r;
  },
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

// ---- M6: 実績・演出・たんす画面・説明 ----
const RARITY_INDEX = { common: 0, uncommon: 1, rare: 2, superRare: 3 } as const;
const rarity4 = (item: ItemId) => RARITY_INDEX[itemRarity(item)];
const achievements = new AchievementSystem(() => m6);
onFullSignal = () => achievements.feedFull();
const pageModel = new AchievementsPageModel(achievements);
const achievementsPage = new AchievementsPage(achievements, pageModel, inventoryScreen);
const defById = new Map(ACHIEVEMENT_DEFS.map((d) => [d.id, d]));
const craftPanel = inventoryScreen.craftPanel!;
const celebrate = new CelebrateUi({
  hud,
  badgeParent: noticeCluster(hud),
  sound: fxSound,
  screen,
  settings: () => m6,
  tileEl: (id) => craftPanel.tileElFor(id),
  itemName: nameOf,
  itemRarity: rarity4,
  itemIconUrl,
  achievement: (id: AchievementId) => {
    const d = defById.get(id)!;
    return { name: d.name, tier: d.medal, artUrl: achievementArtUrl(d) ?? markUrl('medal') };
  },
  levelUpShowing: () => levelHud.celebrating(),
});
achievements.attach(celebrate.modal, celebrate.busy);
// 設定を変えたらすぐ効くよう、毎回 m6 を読む
const madeTracker = new CraftMadeTracker({
  get comboTicks() {
    return m6.craftComboTicks;
  },
  get comboMax() {
    return m6.craftComboMax;
  },
  isFirstMade: (kind, recipe) => achievements.isFirstMade(kind, recipe),
});
madeTracker.onMade((e) => celebrate.made(e));
const infoNumbers = (): InfoNumbers => ({
  toolPower: toolConfig.toolPower,
  toolLevel: toolConfig.toolLevel,
  weaponDamage: toolConfig.weaponDamage,
  weaponReach: toolConfig.weaponReach,
  weaponTicks: toolConfig.weaponTicks,
  arrowDamage: toolConfig.arrowDamage,
  arrowRange: toolConfig.arrowRange,
  armorValue: craftConfig.armorValue,
  punchDamage: combatCfg.punchDamage,
  punchReach: combatCfg.punchReach,
  punchTicks: combatCfg.punchTicks,
  handPower: digCfg.handPower,
  handLevel: digCfg.handLevel,
  harvestLevel: (item) => (digCfg.harvestLevel as Record<string, number>)[item] ?? 0,
  tansuSlots: m6.tansuSlots,
});
craftPanel.configure({
  info: createItemInfo({ recipes: () => craft.recipes(), nameOf, numbers: infoNumbers }),
  cursorHeld: () => inventory.cursor() !== null,
  isMade: (kind, id) => !achievements.isFirstMade(kind, id),
  onSelect: () => playCraft(fxSound, 'tab'),
  onFull: () => notice.showSignal('full'),
});
const inventoryTabs = mountInventoryTabs(inventoryScreen, {
  dot: () => pageModel.ui(screen.inventoryOpen()).tabDot,
  onSwitch: (tab) => {
    pageModel.setTab(tab);
    pageModel.sync(screen.inventoryOpen());
    playCraft(fxSound, 'tab');
  },
});
const storageScreen = new StorageScreen(inventoryScreen, storage, m6.tansuSlots);
dragOut = new DragOut(inventoryScreen, {
  inventory,
  dropper,
  storage,
  armor,
  shiftMove: (i) => {
    if (storage.ui().open) storage.shiftClick('inv', i);
    else inventory.shiftMove(i);
  },
});
tryOpenTansu = () => dig.tryOpenAimedStorage();
// 出来事の入れ物（毎ステップ 1 回だけ drain して、画面・音・実績に配る）
const NO_DIG: DigEvent[] = [];
let digBuf: DigEvent[] = NO_DIG;
time.onPhaseChange((p) => achievements.feedPhase(p));
const defeatWith = (): DefeatWith => {
  const h = inventory.held()?.item;
  if (h === 'bokuto' || h === 'katana' || h === 'naginata' || h === 'crystal_katana' || h === 'yumi') return h;
  if (h === 'wood_pickaxe' || h === 'stone_pickaxe' || h === 'iron_pickaxe') return 'pickaxe';
  return 'hand';
};
onDefeatAch = (kind) => achievements.feedDefeat({ kind, tick: game.tick, with: defeatWith(), hp: combat.hp() });

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
  // たんすは ブロックの復元のあとに（SaveManager が その順で呼ぶ）
  storage: { serialize: () => storage.serialize(), deserialize: (d) => storage.deserialize(d) },
  achievements: { serialize: () => achievements.serialize(), deserialize: (d) => achievements.deserialize(d) },
});
requestSave = () => save.saveIfChanged();
if (saveOptions.reset) {
  save.clear();
  history.replaceState(null, '', stripResetParam(location.href));
} else {
  save.load();
}
achievements.syncSilently({ level: level.get().level, armor: [armor.equipped('head'), armor.equipped('body'), armor.equipped('arms'), armor.equipped('legs')] });
celebrate.setPending(achievements.pendingCount());
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
};
let yokaiSample: StepContext['yokai'] = [];
const regions = island.regions();
const armorNow: (ItemId | null)[] = [null, null, null, null];
/** 実績に今の状態を渡す（画面ステップ: あそぶ 1・もちもの 1÷timeScale・止まっているとき 0） */
let achMuted = false;
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
  if (!achMuted) achievements.update(ctx);
  celebrate.setPending(achievements.pendingCount());
}

game.onUpdate((dt) => {
  // おめでとう画面のあいだ: 世界・妖怪・時刻・プレイヤーは進まない（画面の時間だけ進む。§2.6 (3)）
  if (screen.mode() === 'celebrate') {
    crosshair.setVisible(false);
    celebrate.step();
    updateAchievements();
    inventoryScreen.update();
    storageScreen.update();
    achievementsPage.update();
    return;
  }
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
  storage.update();
  dropController.update();
  // 出来事を 1 回だけ取り出して配る（実績へは、記録する前に「はじめて」を決めてから）
  const modeNow = screen.mode();
  if (modeNow === 'play') madeTracker.advance(1);
  else if (modeNow === 'inventory' && screen.timeScale() > 0) madeTracker.advance(1 / screen.timeScale());
  const craftEvents = craft.drainEvents();
  if (craftEvents.length > 0) {
    handleCraftEvents(craftEvents, { sound: fxSound, pickupLog, celebrate: true });
    for (const e of craftEvents) {
      madeTracker.handle(e);
      if (e.type === 'craftFail') celebrate.failed();
      rig.onCraftEvent(e);
    }
    achievements.feedCraft(craftEvents);
  }
  const digEvents = dig.drainEvents();
  if (digEvents.length > 0) {
    digBuf = digBuf === NO_DIG ? digEvents : digBuf.concat(digEvents);
    achievements.feedDig(digEvents);
  }
  const storageA = storage.drainEvents();
  const storageB = dropper.drainEvents();
  if (storageA.length > 0 || storageB.length > 0) {
    achievements.feedStorage(storageB.length === 0 ? storageA : storageA.length === 0 ? storageB : storageA.concat(storageB));
  }
  const swings = tools.drainSwings();
  if (swings.length > 0) {
    const held = inventory.held()?.item ?? null;
    for (const sw of swings) playSwing(fxSound, sw.anim, held);
    swingBuf = swingBuf === NO_SWINGS ? swings : swingBuf.concat(swings);
  }
  for (const e of tools.drainArrowEvents()) {
    if (e.type === 'noArrow') notice.showSignal('noArrow');
    else if (e.type === 'arrowHit') {
      playCombat(fxSound, 'hit');
      achievements.feedArrow('hit');
    } else if (e.type === 'arrowShot') achievements.feedArrow('shot');
  }
  const combatEvents = combat.drainEvents();
  if (combatEvents.length > 0) {
    for (const e of combatEvents) rig.onCombatEvent(e);
    handleGuardEvents(combatEvents, fxSound);
    combatBuf = combatEvents;
    achievements.feedCombat(combatEvents);
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
  combatUi.clock.setTime(time.dayTick(), timeSettings, time.day() + 1);
  viewActions.endFrame();
  crosshair.setVisible(rig.crosshairVisible() && screen.mode() === 'play');
  hotbar.update();
  inventoryScreen.update();
  storageScreen.update();
  achievementsPage.update();
  if (screen.inventoryOpen()) inventoryTabs.update();
  updateAchievements();
  celebrate.step();
  notice.update(dt);
  renderer.update({ x: game.camera.position.x, z: game.camera.position.z });
  save.update(game.tick + 1);
});
game.onUpdate((dt) => overlay.update(dt));
// ロックがないあいだは時間を止める。F3 だけは効く（M1-02 §2.4）
game.setRealtimeGate(() => lock.realtimeAllowed());
// おめでとう画面の中の時間は 実時間で進める（世界は上で止めてある）
game.setTimeScale(() => (screen.mode() === 'celebrate' ? 1 : screen.timeScale()));
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
const storageHook = createStorageHook(storage, screen);
const achievementsHook = {
  ...createAchievementsHook(achievements, pageModel, {
    inventoryOpen: () => screen.inventoryOpen(),
    onTab: (tab) => inventoryScreen.setTab(tab),
  }),
  modal: () => celebrate.modalInfo(),
  close: () => celebrate.close(),
  sounds: () => celebrate.drainAchievementSounds(),
  /** テスト用: true のあいだ 実績の画面（おめでとう画面）を出さない（古いテストが世界を止められないように） */
  mute: (on: boolean) => {
    achMuted = on;
  },
};
const guideHook = createGuideHook(playOverlay);
const lockHook = createLockHook(lock);
const combatHook = createCombatHook(combat);
installTestHook(game, overlay, {
  world: createWorldHook(world, renderer, island),
  render: { chunks: () => renderer.chunkStats() },
  player: { ...createPlayerHook(controller), doll: cameraHook.doll } as unknown as TestHookGroups['player'],
  ...createDigHook(dig),
  inventory: createInventoryHook(inventory, screen, {
    ...createPickupHook(craft),
    ...craftUiHook.inventory,
    ...createInventoryM6Extras({ inventory, storage, dropper, screen }),
  }),
  save: createSaveHook(save),
  time: createTimeHook(time),
  combat: {
    ...combatHook,
    arrows: toolHook.arrows,
    events: () => [...combatHook.events(), ...toolHook.arrowEvents()],
  } as unknown as TestHookGroups['combat'],
  craft: {
    ...craftHook,
    ...craftUiHook.craft,
    ...createCraftPanelHook(craftPanel),
    fx: () => celebrate.fxInfo(),
    sounds: () => celebrate.drainCraftSounds(),
  } as unknown as TestHookGroups['craft'],
  achievements: achievementsHook as unknown as TestHookGroups['achievements'],
  storage: storageHook as unknown as TestHookGroups['storage'],
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
      m6,
      { clockPhases },
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
