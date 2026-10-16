import { CameraRig } from './camera/CameraRig';
import { useBlockDoll } from './debug/glbDoll';
import { aimPivot } from './camera/pivot';
import { createCharSprite } from './char';
import { AimMarks } from './ui/aimMarks';
import { createCrosshair } from './camera/crosshair';
import { createCameraHook } from './camera/hook';
import { DigFx } from './fx/DigFx';
import { CombatFx } from './fx/combatFx';
import { createCombatUi } from './fx/combatUi';
import { PlayerCombatImpl, createCombatConfig, createCombatHook } from './combat';
import { ArmorSystemImpl, CraftSystemImpl, createArmorHook, createCraftConfig, createCraftHook, createFurnaceHook, createPickupHook } from './craft';
import { ToolSystemImpl, createToolConfig, createToolHook } from './tools';
import { createBladeSystem } from './tools/blade/BladeSystem';
import { createBladeHook } from './tools/blade/hook';
import { WeaponFx } from './fx/weaponFx';
import { EventRelay } from './fx/eventRelay';
import { BladeHud } from './ui/bladeHud';
import { WearNotice } from './ui/wearNotice';
import { setWearSettings } from './ui/wearGauge';
import { ArrowVisuals } from './fx/arrowVisuals';
import { FurnaceFx } from './fx/furnaceFx';
import type { FurnaceFxEntry } from './fx/furnaceFxModel';
import { playCombat } from './fx/combatSounds';
import { CRAFT_UI_SETTINGS, type CraftUiSettings } from './fx/craftConfig';
import { playCraft } from './fx/craftSounds';
import { CraftUiHud, createCraftUiHook, handleCraftEvents, handleGuardEvents, playSwing } from './ui/craftUi';
import { PickupLog } from './ui/pickupLog';
import { LogSystem, LogPage, createLogHook } from './ui/log';
import { applyUiAlpha, uiAlpha } from './ui/theme';
import { createCraft2Settings } from './contracts';
import { FARM_HINT_VIEW } from './ui/farmHintModel';
import { itemRarity } from './drops/rarity';
import { itemType } from './inventory/items';
import { createGuideHook } from './ui/playOverlay';
import { SEA_Y, createM6Settings, createM7Settings, createW2Settings, SEED_ITEM, VEG_ITEM, CROP_KINDS, cropKindOfBlock, type FarmPlacement, type AchievementId, type CombatEvent, type DefeatWith, type DigEvent, type ItemId, type SwingAnim, type YokaiKind } from './contracts';
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
import { ActionHint } from './ui/actionHint';
import { YokaiFocus } from './fx/yokaiFocus';
import { TitleAnnounce } from './ui/titleAnnounce';
import { YokaiNameplates } from './ui/yokaiNameplates';
import { actionHintLines } from './ui/actionHintModel';
import { createRng } from './world/gen/random';
import { FX_SETTINGS } from './fx/config';
import { SoundFx } from './fx/sound';
import { DigSystemImpl, createDigConfig, createDigHook } from './dig';
import { InventoryImpl, createInventoryHook } from './inventory';
import { ScreenController } from './screen/ScreenController';
import { createScreenSettings } from './screen/config';
import { EXPORT_FILE_NAME, PENDING_KEY, SAVE_ID, SaveManager, compressionAvailable, createSaveHook, exportSave, importSave, NO_SAVE, openIdb, parseSaveOptions, requestPersist, restoreStoredWorld, stripResetParam } from './save';
import { Hotbar } from './ui/hotbar';
import { InventoryScreen } from './ui/inventoryScreen';
import { Notice } from './ui/notice';
import { PerfOverlay } from './debug/perfOverlay';
import { installTestHook, withSpriteDoll, type TestHookGroups } from './debug/testHook';
import { Game } from './game/Game';
import { buildScenery } from './game/scenery';
import { createSettingsHook } from './game/settings';
import { bindKeyboardAndMouse } from './input/actions';
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
import { createFarmSystem, createFarmHook } from './farm';
import { setWaterCapacity } from './ui/waterGauge';
import { createSprinklers } from './farm/sprinkler';
import { Pet } from './farm/pet';
import { createWatering } from './farm/watering';
import { WaterDropFx } from './fx/waterFx';
import { SprinklerFx } from './fx/sprinklerFx';
import { setCanCapacitySource } from './tools/durability';
import { FarmSparkle, FarmSparkleView } from './fx/farmSparkle';
import { lookDirection, raycastBlocks } from './dig/raycast';
import { pickAimAssist } from './camera/aimAssist';
import { START_PITCH_DEG } from './player/config';
import { computeFarmPlacement, applyFarmPlacement } from './world/gen/farmPlacement';
import { createFarmVisual } from './world/render/farmVisual';
import { FarmFx } from './fx/farmFx';
import { FarmHint } from './ui/farmHint';
import { FarmAimHud } from './ui/farmAim';
import { itemIconPixels } from './ui/itemIcon';

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
world.resetSaveTracking(); // 島を作っただけ。保存するのは さわった列だけ
// 保存（VOX-F）: IndexedDB から さわった列を 世界に入れる。描画の前に（光が 最初から 正しくなるように）
const saveOptions = parseSaveOptions(location.search);
let store: Storage | null = null;
try {
  store = saveOptions.nosave ? null : window.localStorage;
} catch {
  store = null;
}
const saveId = seed === GEN_CONFIG.defaultSeed ? SAVE_ID : `seed-${seed}`;
// IndexedDB が 開かない・返事がないときも ゲームは始める（3 秒でやめて 保存なしで遊ぶ）
const SAVE_BOOT_TIMEOUT_MS = 3000;
const sleepNull = () => new Promise<null>((ok) => setTimeout(() => ok(null), SAVE_BOOT_TIMEOUT_MS));
let idb = store && compressionAvailable() ? await Promise.race([openIdb(), sleepNull()]) : null;
if (idb) requestPersist();
const bootSignal = { aborted: false };
let restored = await Promise.race([restoreStoredWorld({ world, db: idb, store, seed, saveId, reset: saveOptions.reset, signal: bootSignal }), sleepNull()]);
if (restored === null) {
  bootSignal.aborted = true;
  idb = null;
  restored = NO_SAVE;
}
const renderer = new WorldRenderer(world);
renderer.setViewer(island.spawn().x, island.spawn().z);
renderer.attach(game.scene);
const lighting = new Lighting();
const sceneBefore = new Set(game.scene.children);
buildScenery(game.scene, { x: world.loadedBounds().x1, z: world.loadedBounds().z1 });
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
// スタート・やり直し・セーブの読みこみでは pitch は START_PITCH_DEG（CHAR-1 第 5.2 版 §4.1）
const startPoint = () => ({ ...island.spawn(), pitchDeg: START_PITCH_DEG });
const controller = new PlayerController(world, game.input, look, lock, startPoint);
// CHAR-1 第 5 版: 一人称（V）はなくなった。CameraRig は受け取るだけの ActionState を使う
const rig = new CameraRig(game.camera, game.scene, world, () => controller.state, game.input);
lighting.registerTree(rig.doll.group, 'doll');
// キャラは 8 方向のドット絵の板。?char=block のときだけ 箱人形（描画回数を比べるため）
const blockDollOnly = useBlockDoll(location.search);
const sprite = blockDollOnly
  ? null
  : createCharSprite({
      parent: rig.doll.group,
      camera: game.camera,
      lighting,
      basePath: './models/char/',
      initTexture: (t) => game.renderer.initTexture(t),
    });
rig.doll.setBoxBody(blockDollOnly);
const crosshair = createCrosshair(hud);
const aimMarks = new AimMarks(hud);
crosshair.setVisible(rig.crosshairVisible());

// 持ち物・画面の状態・ほる／おく
// WEAPON-2 の設定（刀・弓・たいきゅう。settings から変えたら すぐ効く）
const w2 = createW2Settings();
setWearSettings(() => w2);
const inventory = new InventoryImpl({ settings: () => w2, tick: () => game.tick });
{
  // たいきゅうが 実際に へった量を 実績（wearTotal）へ
  const wh = inventory.wearHeld.bind(inventory);
  inventory.wearHeld = (n) => {
    const r = wh(n);
    if (r) achievementsRef.feedWorn(r.worn);
    return r;
  };
  const ws = inventory.wearSlot.bind(inventory);
  inventory.wearSlot = (slot, n) => {
    const r = ws(slot, n);
    if (r) achievementsRef.feedWorn(r.worn);
    return r;
  };
}
const screenSettings = createScreenSettings();
// CRAFT-2 の設定（ログ・半透明。settings から変えたら すぐ効く）
const craft2Settings = createCraft2Settings();
applyUiAlpha(craft2Settings);
// M6 の設定（実績・演出・すてる・たんす）。settings から変えたら すぐ効く
const m6 = createM6Settings();
// M7 の設定（農業。settings から変えたら すぐ効く）
const m7 = createM7Settings();
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
// ログは あとで作る（たんす の いっぱい が 先に呼ばれても よいように 関数の中で読む）
let skipSignalLog = false;
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
/** ふりがな付きの HTML を 読み（ひらがな）の文にする（できごと の履歴は 文字だけ） */
function plainReading(html: string): string {
  return html.replace(/<ruby>.*?<rt>(.*?)<\/rt><\/ruby>/g, '$1').replace(/<[^>]*>/g, '');
}
const YOKAI_NAME: Record<YokaiKind, string> = { karakasa: 'からかさ', chochin: 'ちょうちん', nurikabe: 'ぬりかべ', rokurokubi: 'ろくろくび' };
let onDropPicked: (item: ItemId, count: number, fromYokai: boolean) => void = () => {};
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
  onPickup: (item, count, fromYokai) => onDropPicked(item, count, fromYokai),
});
let yokaiManager: YokaiManager | null = null;
// 実績は あとで作る（たいきゅうの へった量を わたす先）
let achievementsRef: { feedWorn(n: number): void } = { feedWorn: () => {} };
let onDefeatAch: (kind: YokaiKind) => void = () => {};
// 経験値とレベル（妖怪をたおすと入る。レベルアップでハート全回復）
const level = new LevelSystem({
  tick: () => game.tick,
  requestSave: () => requestSave(),
  onLevelUp: () => combat.healFull(),
});
const armor = new ArmorSystemImpl(inventory, craftConfig, { settings: () => w2, tick: () => game.tick });
const tools = new ToolSystemImpl({
  inventory,
  world,
  player: () => controller.state,
  yokai: () => yokaiManager,
  base: { dig: digCfg, combat: combatCfg },
  config: toolConfig,
  settings: w2,
});
const blade = createBladeSystem({
  world,
  yokai: () => yokaiManager!,
  settings: w2,
  weaponDamage: (item) => toolConfig.weaponDamage[item] ?? 1,
  onHit: () => {
    inventory.wearHeld(w2.toolWear.blade.hit);
  },
  lunge: (dx, dz) => controller.lunge(dx, dz),
  tick: () => game.tick,
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
  spawn: startPoint,
  // 妖怪のねらい（CHAR-1 第 5.2 版 §4.5）: 届く距離は P から。S からの線で当たらないときは やさしい ねらい補助
  reachOrigin: (out) => aimPivot(world, controller.state.position, out),
  assist: (eye, dir, reach) => aimAssistPick(eye, dir, reach),
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
  openScreen: () => {
    screen.toggle();
    toItemsTab(); // たんす は もちもの タブで開く（できごと・じっせき の画面が のこっていても）
  },
  closeScreen: () => screen.toggle(),
  live: m6,
  tick: () => game.tick,
  requestSave: () => requestSave(),
  onSound: (name) => playStorage(fxSound, name),
  // たんす の いっぱい は 実績（いっぱいにした）に数えない（もちものだけ）
  onFull: (which) => {
    // たんす が いっぱい: 画面の合図は今のまま。履歴には「たんす が いっぱい！」を 1 件（もちもの の文は 入れない）
    if (which === 'tansu') {
      log.signal('tansuFull');
      skipSignalLog = true;
      showSignalRaw('full');
      skipSignalLog = false;
    } else showSignalRaw('full');
  },
});
// つくる・やく（CRAFT-2: たんす の素材も数える。たんす を先に作る）
const craft = new CraftSystemImpl({ world, inventory, drops, requestSave: () => requestSave(), config: craftConfig, tansu: storage, player: () => controller.state.position, tansuRange: () => craft2Settings.craftTansuRange });
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
// 農業（M7）。作物の段階を描画へ、出来事は 毎ステップ 1 回だけ drain して配る
// ふるい たんす の場所（置いたとき・保存を読んだあとに 1 回だけ決める）
let oldTansu: { x: number; y: number; z: number } | null = null;
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
    oldTansu = { x: pos.x, y: pos.y, z: pos.z };
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
    armor: { tryEquip: (item) => armor.tryEquip(item), canEquip: (item) => armor.slotFor(item) !== null },
    storage,
    onPickup: (item, count) => craft.notifyPickup(item, count),
    scatterItem: (pos, item, count) => {
      drops.scatter(pos, [{ item, count }]);
    },
    farm,
    water: createWatering({ farm, inventory, settings: m7, tick: () => game.tick }),
    pet,
    emitFarm: (e) => farm.emit(e),
    nowTick: () => game.tick,
    vitals: combat,
    blade,
    w2,
  },
);
// ねらいの線・矢・刀・パンチの出どころは 目でなく 回転の中心 P（CHAR-1 §4.5）
dig.aimOrigin = (_p, out) => rig.aimOrigin(out); // ねらいの線の出どころは 肩の点 S
dig.reachOrigin = (p, out) => aimPivot(world, p.position, out); // 届く距離は P から
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
    boxes: yokaiM.aimBoxes(),
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
  const y = yokaiM.raycast(S, D, b ? b.distance : AIM_FAR);
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
  // 場所の倍率 M の はじまりの場所・海面の高さは、世界の設定から読む（数を書きこまない）
  origin: () => island.spawn(),
  seaY: () => SEA_Y,
  onDefeat: (kind, info) => {
    level.onDefeat(kind, info.xp);
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
rig.setWeaponSource({ blade: () => blade.state(), bowPose: () => tools.bow().pose() });

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
const stuckVisuals = new ArrowVisuals();
stuckVisuals.addTo(game.scene);

// 画面の見た目と音
const notice = new Notice(hud);
// 「もちもの が いっぱい」の合図は 実績（いっぱいにした）にも数える
let onFullSignal: () => void = () => {};
const showSignalRaw = notice.showSignal.bind(notice);
let lastFullTick = -1;
notice.showSignal = (kind) => {
  // 「いっぱい」は 同じステップで 2 回（つくる画面と つくる口の両方から）呼ばれても 実績には 1 回だけ数える
  if (kind === 'full' && game.tick !== lastFullTick) {
    lastFullTick = game.tick;
    onFullSignal();
  }
  showSignalRaw(kind);
};
hudSignal.full = () => notice.showSignal('full');
// CRAFT-2: 合図が 出はじめたとき 1 件だけ 履歴へ（出たままの 同じ合図では 足さない）
notice.onSignalStart = (k) => {
  if (!skipSignalLog) log.signal(k);
};
// 時計の ひる の分け方（settings の clockPhases）
const bladeHud = new BladeHud(hud, () => w2);
const wearNotice = new WearNotice(hud);
wearNotice.onLow = (item) => log.wearLow(item);
wearNotice.onBroken = (item) => log.wearBroken(item);
const clockPhases: ClockPhases = { ...CLOCK_PHASES };
const combatUi = createCombatUi(hud, clockPhases);
const levelHud = new LevelHud(hud);
const hotbar = new Hotbar(hud, inventory, notice);
// ねらっている所の ヒント（設定 actionHint で消せる）
const hintSettings = { actionHint: true };
const actionHint = new ActionHint(hud);
const titleAnnounce = new TitleAnnounce(hud);
const yokaiNameplates = new YokaiNameplates(hud);
const NO_PLATES: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = [];
const plateBuf: { id: number; text: string; x: number; y: number; z: number; dist: number }[] = [];
const yokaiFocus = new YokaiFocus((id) => yokaiManager.modelOf(id), () => game.camera.position);
const hintVisible = (): boolean => hintSettings.actionHint && screen.mode() === 'play' && !screen.inventoryOpen() && rig.crosshairVisible();
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
  materials: {
    count: (item) => craft.total(item),
    inTansu: (item) => craft.inTansuCount(item),
    fuelInTansu: () => craft.fuelInTansu(),
    version: () => storage.version(),
    refresh: () => craft.refreshTansu(),
  },
});
// CRAFT-2: ログ（左のログ＋できごと の履歴）。拾ったログ（PickupLog）は これの liveModel を読む
const log: LogSystem = new LogSystem({ nameOf, settings: craft2Settings, live: craftUi });
// できごと ページ（もちもの画面の ページ置き場に入る）
const logPage = new LogPage(log, { pageSlot: inventoryScreen.pageSlot });
const pickupLog = new PickupLog(hud, { nameOf, rarityOf: itemRarity, log });
// つくる がいっぱいで できなかったとき: どこから呼んでも（画面・窓口）「もちもの が いっぱい！」の合図
{
  const makeRaw = craft.make.bind(craft);
  craft.make = (id) => {
    const r = makeRaw(id);
    if (!r.ok && r.reason === 'full') notice.showSignal('full');
    return r;
  };
}
// やく を押したとき: たんす から使った分と「やきはじめた」を 履歴へ（かまど の じゅんばんが 2 つ目以降でも 1 件ずつ）
{
  const bakeRaw = craft.bake.bind(craft);
  craft.bake = (id, x, y, z) => {
    const r = bakeRaw(id, x, y, z);
    if (r.ok) {
      log.fromTansu(r.used?.tansu);
      const out = craft.recipes().find((rc) => rc.id === id)?.output.item;
      if (out) log.bakeStart(out);
    }
    return r;
  };
}
const craftHud = new CraftUiHud({ hud, craft, inv: inventory, nameOf, rarityOf: itemRarity }, pickupLog);
const furnaceFx = new FurnaceFx(game.scene, fxSound, craftUi);
onDropPicked = (item, count, fromYokai) => {
  // からかさ・ろくろくび の おとしもの から たね を拾った
  if (fromYokai && CROP_KINDS.some((k) => SEED_ITEM[k] === item)) farm.noteSeedFound('yokai', item, controller.state.position);
  craft.notifyPickup(item, count);
  hotbar.pickup(item, count);
};
const fx = new DigFx({
  scene: game.scene,
  dig,
  hideBlockFocus: () => dig.aimedYokaiId() !== null,
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
const farmHint = new FarmHint(hud);
const farmAimHud = new FarmAimHud(hud);
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

const arrowRelay = new EventRelay<import('./contracts').BowEvent>();
const weaponFx = new WeaponFx({
  scene: game.scene,
  sound: fxSound,
  blade,
  bow: {
    drainEvents: () => arrowRelay.take() as import('./contracts').BowEvent[],
  },
  inventory,
  armor,
  bladeHud,
  notice: wearNotice,
  nameOf,
  handPos: () => ({ x: controller.state.position.x, y: controller.state.position.y + 1, z: controller.state.position.z }),
  settings: () => w2,
  shakeEl: game.renderer.domElement,
  onWear: (e) => achievements.feedWear(e),
  onArrowPickup: () => hotbar.pickup('ya', 1),
});

// ---- M6: 実績・演出・たんす画面・説明 ----
const RARITY_INDEX = { common: 0, uncommon: 1, rare: 2, superRare: 3 } as const;
const rarity4 = (item: ItemId) => RARITY_INDEX[itemRarity(item)];
const achievements = new AchievementSystem(() => m6);
achievementsRef = achievements;
// M7-2: キラキラ・ハート（C）・しずく（A）・しぶき（B）
const eyePos = { x: 0, y: 0, z: 0 };
const sparkle = new FarmSparkle({
  settings: m7,
  crops: () => sparkleCrops(),
  stageAt: (x, y, z) => farm.crop(x, y, z)?.stage ?? null,
  happy: (fn) => pet.forEach((x, y, z) => fn(x, y, z)),
});
const sparkleView = new FarmSparkleView(sparkle);
renderer.setSwaySource((cb) => sparkle.forEachSway(cb));
sparkleView.addTo(game.scene);
const waterFx = new WaterDropFx(game.scene);
const sprayFx = new SprinklerFx({ period: m7.farmSprinklerSprayTicks });
game.scene.add(sprayFx.group);
const sparkleList: Array<{ x: number; y: number; z: number; stage: number }> = [];
/** 作物（farm.crops）と、目の まわりの やせいの やさい（stage 3）。15 ステップに 1 回だけ 呼ばれる */
const wildScan = { x: -999, y: -999, z: -999, r: -1, n: 0, list: [] as Array<{ x: number; y: number; z: number; stage: number }> };
function sparkleCrops(): ReadonlyArray<{ x: number; y: number; z: number; stage: number }> {
  sparkleList.length = 0;
  for (const c of farm.crops()) sparkleList.push(c);
  // やせいの やさい は 近くを 数回に 1 回だけ さがし、毎回は まだ ある ものだけ たしかめる
  const r = Math.ceil(m7.farmSparkleRange);
  const ex = Math.floor(eyePos.x);
  const ey = Math.floor(eyePos.y);
  const ez = Math.floor(eyePos.z);
  const moved = Math.abs(ex - wildScan.x) + Math.abs(ey - wildScan.y) + Math.abs(ez - wildScan.z) >= 3;
  if (moved || wildScan.n++ % 4 === 0 || wildScan.r !== r) {
    wildScan.x = ex;
    wildScan.y = ey;
    wildScan.z = ez;
    wildScan.r = r;
    wildScan.list.length = 0;
    const y0 = Math.max(0, ey - r);
    const y1 = Math.min(world.size.y - 1, ey + r);
    const eb = world.loadedBounds();
    for (let z = Math.max(eb.z0, ez - r); z <= Math.min(eb.z1 - 1, ez + r); z++)
      for (let x = Math.max(eb.x0, ex - r); x <= Math.min(eb.x1 - 1, ex + r); x++)
        for (let y = y0; y <= y1; y++) {
          const k = cropKindOfBlock(world.getBlock(x, y, z));
          if (k && k.wild) wildScan.list.push({ x, y, z, stage: 3 });
        }
  }
  for (const w of wildScan.list) {
    const k = cropKindOfBlock(world.getBlock(w.x, w.y, w.z));
    if (k && k.wild) sparkleList.push(w);
  }
  return sparkleList;
}
const farmFx = new FarmFx({ sound: fxSound, particles: fx.particles, hint: farmHint, achievements, sparkle });
onFullSignal = () => achievements.feedFull();
const pageModel = new AchievementsPageModel(achievements);
const achievementsPage = new AchievementsPage(achievements, pageModel, inventoryScreen);
// ---- CRAFT-2: できごと タブ・L キー
/** もちもの画面を できごと タブにする（閉じていれば 開く）。開けない場面（おめでとう・案内・やられた）では 何もしない */
function openLogTab(): void {
  if (screen.modalOpen() || combat.dead()) return;
  if (!screen.inventoryOpen()) {
    if (screen.mode() !== 'play') return;
    screen.toggle();
    if (!screen.inventoryOpen()) return;
  }
  inventoryScreen.setTab('log');
  pageModel.setTab('log');
  pageModel.sync(true);
  log.resetScroll();
  syncPages();
}
/** タブを替えた その場で ページの出し入れを 合わせる（時間が止まっていても 見た目が すぐ替わるように） */
function toItemsTab(): void {
  if (inventoryScreen.tab() === 'items') return;
  inventoryScreen.setTab('items');
  pageModel.setTab('items');
  pageModel.sync(screen.inventoryOpen());
  syncPages();
}
function syncPages(): void {
  achievementsPage.update();
  logPage.update(screen.inventoryOpen() && inventoryScreen.tab() === 'log');
}
log.bindHost({ isOpen: () => screen.inventoryOpen(), tab: () => inventoryScreen.tab(), open: openLogTab });
game.input.onPress((action) => {
  if (action !== 'openLog') return;
  // おめでとう画面・案内画面・やられた画面・たんす画面のあいだは 何もしない
  if (screen.modalOpen() || screen.mode() === 'guide' || combat.dead() || storage.ui().open) return;
  if (screen.inventoryOpen() && inventoryScreen.tab() === 'log') screen.toggle();
  else openLogTab();
});
achievements.onUnlock((d, silent) => {
  if (!silent) log.achievement(d.name);
});
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
    syncPages();
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
// ゆみの出来事は main が 1 回だけ drain して、weaponFx にも配る
const NO_DIG: DigEvent[] = [];
let digBuf: DigEvent[] = NO_DIG;
time.onPhaseChange((p) => achievements.feedPhase(p));
const defeatWith = (): DefeatWith => {
  const h = inventory.held()?.item;
  if (h === 'bokuto' || h === 'katana' || h === 'naginata' || h === 'crystal_katana' || h === 'yumi') return h;
  if (h === 'wood_pickaxe' || h === 'stone_pickaxe' || h === 'iron_pickaxe' || h === 'wood_axe' || h === 'stone_axe' || h === 'iron_axe') return 'pickaxe';
  return 'hand';
};
onDefeatAch = (kind) => {
  log.defeat(YOKAI_NAME[kind]);
  achievements.feedDefeat({ kind, tick: game.tick, with: defeatWith(), hp: combat.hp() });
};

// 自動セーブ（?nosave=1 は保存しない、?reset=1 は消してから始める）
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
  spawn: startPoint,
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
  // 農業: 作物・印。前の保存（印なし）には 読んだあとに 置きものを置く
  farm,
});
requestSave = () => save.saveIfChanged();
if (saveOptions.reset) history.replaceState(null, '', stripResetParam(location.href));
const loadedSave = save.load();
// 新しい世界: 島の上に 置きもの（やせいの やさい・ふるい はたけ）を置く。保存があれば 保存の側（前の保存は placeLegacy）
if (!loadedSave) {
  const placement: FarmPlacement = computeFarmPlacement(seed, { world, info: island });
  applyFarmPlacement(world, placement);
  farm.noteNewWorldPlaced(placement);
  requestSave();
}
// 保存を読んだ世界では たんす の場所が わからないので、ここで 1 回だけ 計算する（あそびの途中では 計算しない）
if (loadedSave && oldTansu === null && farm.kakashi()) oldTansu = computeFarmPlacement(seed).oldFarm?.tansu ?? null;
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
    if (oldTansu && oldTansu.x === p.x && oldTansu.y === p.y && oldTansu.z === p.z) {
      for (const k of CROP_KINDS) farm.noteSeedFound('oldfarm', SEED_ITEM[k], p);
    }
  }
  seedsInInv = n;
}
achievements.syncSilently({ level: level.get().level, armor: [armor.equipped('head'), armor.equipped('body'), armor.equipped('arms'), armor.equipped('legs')] });
celebrate.setPending(achievements.pendingCount());
lock.onChange((locked) => {
  if (!locked) save.saveIfChanged();
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
  applyUiAlpha(craft2Settings);
  // おめでとう画面のあいだ: 世界・妖怪・時刻・プレイヤーは進まない（画面の時間だけ進む。§2.6 (3)）
  if (screen.mode() === 'celebrate') {
    crosshair.setVisible(false);
    celebrate.step();
    updateAchievements();
    inventoryScreen.update();
    storageScreen.update();
    achievementsPage.update();
    logPage.update(screen.inventoryOpen() && inventoryScreen.tab() === 'log');
    return;
  }
  time.update();
  // WEAPON-2: 刀・弓の 動きの 制限（歩く倍率・ジャンプ止め）を プレイヤーへ
  {
    const bm = blade.motion();
    const wm = tools.bow().motion();
    controller.motion.speedMul = bm.speedMul * wm.speedMul;
    controller.motion.jumpLocked = bm.jumpLocked || wm.jumpLocked;
  }
  // 空の光の弱まりを先に今の時刻にそろえる（妖怪の出現の「暗い所」がこれを読む。Sky は あとで画面ぶんを更新）
  skyDarkness.value = darkenFromBrightness(time.brightness(), timeSettings.nightBrightness);
  controller.update(dt);
  // カメラ（肩の点 S）を先に決める。ねらい（dig.update）は S を使う（CHAR-1 第 5.2 版）
  rig.update(dt);
  if (screen.mode() === 'play') {
    const st = controller.state;
    sprite?.step({
      position: st.position,
      velocity: st.velocity,
      onGround: st.onGround,
      inWater: st.inWater,
      running: st.running,
      facingDeg: st.facingDeg,
    });
  }
  yokaiM.update();
  dig.update();
  combat.update();
  craft.update();
  storage.update();
  dropController.update();
  // 農業: あそんでいるあいだは 毎ステップ、もちもの画面は 4 ステップに 1 回、止まっているあいだは進めない
  {
    const m = screen.mode();
    if (m === 'play' || (m === 'inventory' && screen.timeScale() > 0 && game.tick % 4 === 0)) farm.update({ playerPos: controller.state.position });
    renderer.setRipeMinBrightness(m7.farmRipeMinBrightness);
    trackOldFarmSeeds();
  }
  // 出来事を 1 回だけ取り出して配る（実績へは、記録する前に「はじめて」を決めてから）
  const modeNow = screen.mode();
  if (modeNow === 'play') madeTracker.advance(1);
  else if (modeNow === 'inventory' && screen.timeScale() > 0) madeTracker.advance(1 / screen.timeScale());
  const craftEvents = craft.drainEvents();
  if (craftEvents.length > 0) {
    handleCraftEvents(craftEvents, { sound: fxSound, pickupLog, celebrate: true });
    for (const e of craftEvents) {
      if (e.type === 'craft') {
        log.fromTansu(e.fromTansu);
        log.craftMade(e.item, e.count);
      }
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
  {
    const fe = farm.drainEvents();
    if (fe.length > 0) {
      for (const e of fe) if (e.type === 'pour') waterFx.pour(farm.lastPourCells());
      farmFx.feed(fe);
    }
    // 目の 位置（キラキラ・しぶきの 遠さ）と つぶ の 1 ステップ
    eyePos.x = controller.state.position.x;
    eyePos.y = controller.state.position.y + controller.settings.eyeHeight;
    eyePos.z = controller.state.position.z;
    sparkle.step(game.tick, eyePos);
    sparkleView.update();
    waterFx.step();
    sprayFx.setPeriod(m7.farmSprinklerSprayTicks);
    sprayFx.update(game.tick, sprinklers.peek(), eyePos);
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
  const arrowEvents = tools.drainArrowEvents();
  arrowRelay.give(arrowEvents);
  for (const e of arrowEvents) {
    if (e.type === 'noArrow') notice.showSignal('noArrow');
    else if (e.type === 'arrowHit') {
      playCombat(fxSound, 'hit');
      achievements.feedArrow('hit');
    } else if (e.type === 'arrowShot') achievements.feedArrow('shot');
  }
  const combatEvents = combat.drainEvents();
  if (combatEvents.length > 0) {
    for (const e of combatEvents) {
      rig.onCombatEvent(e);
      if ((e.type === 'playerHit' && e.amount > 0 && (e as { blocked?: boolean }).blocked !== true) || e.type === 'fallHurt') sprite?.hurt();
      if (e.type === 'respawn') log.home();
    }
    handleGuardEvents(combatEvents, fxSound);
    combatBuf = combatEvents;
    achievements.feedCombat(combatEvents);
  }
  arrowVisuals.syncFlying(tools.bow().arrows());
  stuckVisuals.syncStuck(tools.bow().stuck());
  wearNotice.step();
  weaponFx.step();
  combatUi.hearts.setArmor(armor.snapshot().hudIcons);
  craftHud.update(dt);
  fx.update(dt);
  combatFx.update(dt);
  weaponFx.update(dt);
  for (const e of level.drainEvents()) {
    if (e.type === 'levelUp') {
      levelHud.celebrate();
      log.level(e.level);
      fxSound.play('levelUp');
    }
  }
  levelHud.update(level.get());
  levelHud.tick(dt);
  updateFurnaceFx(dt);
  // 箱人形は 白い弧・星のために残す。板の絵が出せない（たつ の絵も読めない）ときだけ からだも見せる
  rig.doll.setBoxBody(blockDollOnly || (sprite?.needsBoxDoll() ?? false));
  sprite?.render();
  {
    const playing = screen.mode() === 'play' && !rig.isOverview();
    const bs = blade.state();
    aimMarks.update({ stance: playing && bs.item !== null ? bs.stance : null, bowStage: playing ? tools.bow().pose().stage : 0 });
  }
  sky.update(game.camera);
  combatUi.clock.setTime(time.dayTick(), timeSettings, time.day() + 1);
  crosshair.setVisible(rig.crosshairVisible() && screen.mode() === 'play');
  yokaiFocus.update(hintVisible() ? dig.aimedYokaiId() : null);
  titleAnnounce.sync(yokaiM.announce());
  // 持ち物・メニューを開いている間は 名前を出さない
  yokaiNameplates.update(screen.mode() === 'play' ? yokaiM.nameplates(plateBuf) : NO_PLATES, game.camera);
  actionHint.update(hintVisible() ? actionHintLines(dig.previewRightClick(), dig.previewLeftClick(), { held: tools.current().item, heldIsPickaxe: tools.current().kind === 'pickaxe', heldIsBlade: tools.current().kind === 'blade' }) : {});
  farmHint.step();
  {
    // 農業の合図: 出ていない状態から 出たとき 1 件（見た目の文は ふりがなを 読みに直す）
    const k = farmHint.model.current();
    for (const kind of Object.keys(FARM_HINT_VIEW) as (keyof typeof FARM_HINT_VIEW)[]) {
      log.edge(`farm:${kind}`, k === kind, () => {
        const v = FARM_HINT_VIEW[kind];
        const art = v.art.find((a) => a !== 'heart');
        log.farmHint(plainReading(v.html), (art ?? null) as ItemId | null);
      });
    }
  }
  {
    const tb = hintVisible() ? dig.target() : null;
    const a = tb ? farm.aim(tb.block.x, tb.block.y, tb.block.z) : null;
    const ck = tb ? cropKindOfBlock(tb.id) : null;
    farmAimHud.update(a, ck ? nameOf(VEG_ITEM[ck.kind]) : a ? 'はたけ' : '');
  }
  hotbar.update(dig.toolHint()?.slot ?? null);
  inventoryScreen.update();
  storageScreen.update();
  achievementsPage.update();
  logPage.update(screen.inventoryOpen() && inventoryScreen.tab() === 'log');
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
  close: () => celebrate.close(),
  sounds: () => celebrate.drainAchievementSounds(),
  /** テスト用: true のあいだ 実績の画面（おめでとう画面）を出さない（古いテストが世界を止められないように） */
  mute: (on: boolean) => {
    achMuted = on;
  },
};
const facingTmp = { x: 0, y: 0, z: 0 };
const hudHook = { toolHint: () => { const h = dig.toolHint(); return h ? { slot: h.slot, ticksLeft: h.ticksLeft } : null; }, actionHint: () => actionHint.current(), yokaiFocus: () => yokaiFocus.current(), yokaiFocusHulls: () => yokaiFocus.hullCount(), hpBar: (id: number) => yokaiManager?.hpBarInfo(id) ?? null, announce: () => yokaiManager?.announce() ?? null, nameplate: (id: number) => yokaiManager?.nameplateInfo(id) ?? null };
const guideHook = createGuideHook(playOverlay);
const lockHook = createLockHook(lock);
const combatHook = createCombatHook(combat);
installTestHook(game, overlay, {
  world: createWorldHook(world, renderer, island),
  render: { chunks: () => renderer.chunkStats() },
  player: { ...createPlayerHook(controller), doll: withSpriteDoll(cameraHook.doll, sprite, rig.doll.group) } as unknown as TestHookGroups['player'],
  ...createDigHook(dig),
  hud: hudHook,
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
  ...logHook,
  ui: { alpha: () => uiAlpha() },
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
  ...createBladeHook(blade),
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
    tab: guideHook.tab,
    get: () => ({ ...lockHook.get(), ...guideHook.state() }),
  },
  input: createInputHook(game.input, look, wheel),
  settings: createSettingsHook(controller.settings, rig.config, [
      digSettingsView(dig.config),
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
