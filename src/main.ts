import { CameraRig } from './camera/CameraRig';
import { useBlockDoll } from './debug/glbDoll';
import { aimPivot } from './camera/pivot';
import { createCharSprite } from './char';
import { createCharController } from './char/charPref';
import { AimMarks } from './ui/aimMarks';
import { createCrosshair } from './camera/crosshair';
import { createCameraHook } from './camera/hook';
import { DigFx } from './fx/DigFx';
import { CombatFx } from './fx/combatFx';
import { createCombatUi } from './fx/combatUi';
import { PlayerCombatImpl, createCombatConfig, createCombatHook } from './combat';
import { ArmorSystemImpl, CraftSystemImpl, createArmorHook, createCraftConfig, createCraftHook, createFurnaceHook, createPickupHook } from './craft';
import { ToolSystemImpl, createToolConfig, createToolHook } from './tools';
import { createBladeSystem, isBladeItem } from './tools/blade/BladeSystem';
import { createBladeHook } from './tools/blade/hook';
import { WeaponFx } from './fx/weaponFx';
import { createParry, parryGlowLevel } from './combat/parry';
import { ParryFx, StaggerIcons, bladeMidInto } from './fx/parryFx';
import { isParrySound, playParry } from './fx/parrySounds';
import { parryCellOf } from './char/parryCells';
import { bladeColorsOf } from './fx/bladeTrailModel';
import { EventRelay } from './fx/eventRelay';
import { BladeHud } from './ui/bladeHud';
import { WearNotice } from './ui/wearNotice';
import { setWearSettings } from './ui/wearGauge';
import { ArrowVisuals } from './fx/arrowVisuals';
import { FurnaceFx } from './fx/furnaceFx';
import type { FurnaceFxEntry } from './fx/furnaceFxModel';
import { playCombat } from './fx/combatSounds';
import { playLegend, preloadLegendSounds, startLegendLoop, startLegendOneShot } from './fx/legendSounds';
import { createLegendSystem } from './legend/LegendSystem';
import { createWaveSystem } from './legend/WaveSystem';
import { createSpiralDebris } from './legend/spiralDebris';
import { createChargeLight } from './legend/chargeLight';
import { computeHand, newHandInfo } from './legend/handPos';
import { WindWaveFx } from './fx/windWaveFx';
import { SpiralFx } from './fx/spiralFx';
import { createWaveView3D } from './legend/waveView';
import { ChargeLightFx } from './fx/chargeLightFx';
import { BuffIcons } from './ui/buffIcons';
import { buffsOfHeld, createBuffModel } from './ui/buffIconsModel';
import { ThunderFx } from './fx/thunderFx';
import { LegendBook } from './legend/LegendBook';
import { chargeOf, legendMoveMulOf, legendPowerOf, trailStyleOf } from './legend/defs';
import { lightningPoseFrame } from './legend/pose';
import { CRAFT_UI_SETTINGS, type CraftUiSettings, type ToolNumbers } from './fx/craftConfig';
import { playCraft } from './fx/craftSounds';
import { CraftUiHud, createCraftUiHook, handleCraftEvents, handleGuardEvents, playSwing } from './ui/craftUi';
import { PickupLog } from './ui/pickupLog';
import { LogSystem, LogPage, createLogHook } from './ui/log';
import { applyUiAlpha, uiAlpha } from './ui/theme';
import { createCraft2Settings, createLiveSettings } from './contracts';
import { FARM_HINT_VIEW } from './ui/farmHintModel';
import { ITEM_RARITY_SETTINGS, itemRarity, rarityIndex } from './drops/rarity';
import { createRarityHook } from './drops/rarityHook';
import { itemType } from './inventory/items';
import { Book } from './ui/book/Book';
import { playBook } from './fx/bookSounds';
import { SEA_Y, WORLD_HEIGHT, WORLD_LIMIT, createM6Settings, createM7Settings, createW2Settings, SEED_ITEM, VEG_ITEM, CROP_KINDS, cropKindOfBlock, type FarmPlacement, type AchievementId, type CombatEvent, type DefeatWith, type DigEvent, type ItemId, type SwingAnim, type YokaiKind } from './contracts';
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
import { createAnimalManager } from './animals';
import { AnimalFx } from './fx/animalFx';
import { AnimalRenderer, ViewBuffer } from './animals/models/AnimalRenderer';
import { AnimalHint } from './ui/animalHint';
import { countryAt } from './world/gen/biome';
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
import { drainSounds } from './fx/soundLog';
import { createBrowserTitleSound } from './fx/titleSound';
import { SoundFx } from './fx/sound';
import { createAudioSettings } from './fx/audioConfig';
import { AudioMixer } from './fx/audioMixer';
import { BgmPlayer } from './fx/bgm/BgmPlayer';
import { parseChord } from './fx/bgm/compile';
import { createAudioHook } from './fx/bgm/hook';
import { BgmSceneTracker, screenLevel, type BgmSceneInput } from './fx/bgm/scene';
import { createSoundSettings } from './ui/soundSettings';
import { createAudioPersistence } from './ui/soundSettingsModel';
import { DigSystemImpl, createDigConfig, createDigHook } from './dig';
import { InventoryImpl, createInventoryHook } from './inventory';
import { ScreenController } from './screen/ScreenController';
import { createScreenSettings } from './screen/config';
import { EXPORT_FILE_NAME, PENDING_KEY, SAVE_ID, SaveManager, isBodyPlaceable, compressionAvailable, createSaveHook, exportSave, importSave, openIdb, parseSaveOptions, requestPersist, shouldReset, stripResetParam } from './save';
import { ColumnIO } from './save/columnIO';
import { emptyStreamRestore, openStoredKeys } from './save/streamRestore';
import { StreamHost } from './world/stream/StreamHost';
import { colKey } from './world/stream/ring';
import { PrepCard } from './ui/prep';
import { showPrepCard } from './ui/prepModel';
import { generateChunk } from './world/gen/chunk';
import { createWorldInfo } from './world/gen/worldInfo';
import { Hotbar } from './ui/hotbar';
import { InventoryScreen } from './ui/inventoryScreen';
import { Notice } from './ui/notice';
import { PerfOverlay } from './debug/perfOverlay';
import { installTestHook, withSpriteDoll, type TestHookGroups } from './debug/testHook';
import { Game } from './game/Game';
import { buildScenery, followScenery } from './game/scenery';
import { createSettingsHook } from './game/settings';
import { bindKeyboardAndMouse } from './input/actions';
import { LockController, MouseLook, WheelAccumulator, bindPointerLock, createInputHook, createLockHook } from './input';
import { createPlayerHook } from './player/hook';
import { PlayerController } from './player/PlayerController';
import { mountHud } from './ui/hud';
import { PlayOverlay } from './ui/playOverlay';
import { ArrayVoxelWorld } from './world/VoxelWorld';
import { GEN_CONFIG } from './world/gen/config';
import { createBiomeHook } from './world/gen/biomeHook';
import { installMicroCountries } from './world/gen/microCountry';
import { createWorldHook } from './world/hook';
import { WorldRenderer } from './world/render/WorldRenderer';
import { decideFrameClock } from './world/frameClock';
import { MICRO_RADII } from './world/render/voxel/tier';
import { setKataTable } from './proto/voxel/looks';
import { decideKata } from './proto/voxel/looks/kata';
import { createRenderHook } from './world/render/renderHook';
import { BlobShadow, BLOB, groundBelow } from './fx/blobShadow';
import { WATER, isSolidIndex } from './world/blocks/blockTypes';
import { ShadowSystem } from './world/render/shadow/ShadowSystem';
import { createShadowHook } from './world/render/shadow/shadowHook';
import { saveShadowPref } from './world/render/shadow/shadowPref';
import { createShadowSetting } from './ui/shadowSetting';
import { darkenFromBrightness, skyDarkness } from './world/light';
import { createFarmSystem, createFarmHook } from './farm';
import { setWaterCapacity } from './ui/waterGauge';
import { createSprinklers } from './farm/sprinkler';
import { Pet } from './farm/pet';
import { createWatering } from './farm/watering';
import { createBucket } from './farm/bucket';
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
import { setRing } from './world/stream/ring';
import { FarmHint } from './ui/farmHint';
import { FarmAimHud } from './ui/farmAim';
import { itemIconPixels } from './ui/itemIcon';
import { createStartBoot } from './start/startBoot';
import { decideWeightedStart } from './start/weightPref';
import { decideStrength, strengthToSave } from './yokai/strengthPref';
import { playWeapon } from './fx/weaponSounds';

const container = document.getElementById('game')!;
const hud = document.getElementById('hud')!;

/** URL の ?seed=数 で世界を変えられる（なければふだんのシード） */
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

// SOUND-1: 音（ミキサー → BGM → 効果音の順に作る。AudioContext は ミキサーだけが作る）
const audioSettings = createAudioSettings();
const audioPersist = createAudioPersistence(window.localStorage, audioSettings, FX_SETTINGS); // ?nosave=1 でも音の設定は保存する
audioPersist.load();
const mixer = new AudioMixer(audioSettings);
const bgm = new BgmPlayer(mixer);
const bgmScene = new BgmSceneTracker(audioSettings);
const fxSound = new SoundFx({ output: () => mixer.output(), chord: () => bgm.chord(), onBig: () => mixer.duck() });
// 二つ名の出現音（音ファイル）。効果音と同じミキサーの sfx バスに流す。プレイヤーの 最初の 操作のあとで 読みこむ（それまで AudioContext を 作らない）
const titleSound = createBrowserTitleSound(
  () => FX_SETTINGS.fxVolume,
  () => mixer.output()?.ctx ?? null,
  () => mixer.output()?.destination ?? null,
);
{
  const warm = (): void => {
    window.removeEventListener('pointerdown', warm, true);
    window.removeEventListener('keydown', warm, true);
    mixer.unlock(); // 先に AudioContext を作ってから読む（下の unlock と同じ。何度呼んでもよい）
    void titleSound.preload();
    void preloadLegendSounds(fxSound); // 風神剣・雷神剣の ため音・攻撃音（最初の 操作の あとに 1 回）
  };
  window.addEventListener('pointerdown', warm, true);
  window.addEventListener('keydown', warm, true);
}
// START-1: 世界を 作る 前に スタートメニュー（URL に 指定が あるときは 出さない。仕様 §4.1）
const saveOptions = parseSaveOptions(location.search);
let store: Storage | null = null;
try {
  store = saveOptions.nosave ? null : window.localStorage;
} catch {
  store = null;
}
// IndexedDB が 開かない・返事がないときも ゲームは始める（3 秒でやめて 保存なしで遊ぶ）
const SAVE_BOOT_TIMEOUT_MS = 3000;
const sleepNull = () => new Promise<null>((ok) => setTimeout(() => ok(null), SAVE_BOOT_TIMEOUT_MS));
const idbOpening = store && compressionAvailable() ? Promise.race([openIdb(), sleepNull()]) : Promise.resolve(null);
const startBoot = createStartBoot();
window.__rikkun = { start: startBoot.hook } as unknown as NonNullable<typeof window.__rikkun>; // メニューの あいだは 窓口 start だけ
const startPlan = await startBoot.run({
  search: location.search,
  store: saveOptions.nosave ? null : (() => { try { return window.localStorage; } catch { return null; } })(),
  db: idbOpening,
  envStartMenu: import.meta.env.VITE_START_MENU as string | undefined,
  nSections: Math.ceil(WORLD_HEIGHT / 16),
  sound: (name) => (name === 'dry' ? playWeapon(fxSound, 'dry') : playCraft(fxSound, name)), // tab・sparkle = 作る音、dry = ゆみの ぽよん
  readSeed,
});

// 世界: 入れ物（空）→ 列は ChunkStream が プレイヤーのまわりから 近い順に 読みこむ・捨てる（VOX-D）
const world = new ArrayVoxelWorld({ x: 0, z: 0 });
world.edgeClosedBelow = SEA_Y - 8; // 読みこんでいない列の横は、海ゆかより下は ふさがっているとみなす（地下の「見えない」印）
const seed = startPlan.seed;
installMicroCountries(world, seed);
const island = createWorldInfo(seed, world);
// 保存（VOX-F）: IndexedDB から さわった列を 世界に入れる。描画の前に（光が 最初から 正しくなるように）
// 前の世界（'main'・'seed-N'）とは別の名前。前の世界は読まず、消さない（VOX-B）
const saveId = seed === GEN_CONFIG.defaultSeed ? SAVE_ID : `vox-seed-${seed}`;
let idb = await idbOpening;
if (idb) requestPersist();
const bootSignal = { aborted: false };
// 公開したゲームの ?reset=1 は 何もしない（いたずらのリンクで 世界が消えないように。#169）
const doReset = shouldReset(saveOptions.reset, import.meta.env.DEV);
// 起動で読むのは meta と 列のキーの一覧だけ（列の中身は いるときに 1 列ずつ。VOX-D D1）
let restored = await Promise.race([openStoredKeys({ db: idb, store, seed, saveId, reset: doReset, signal: bootSignal }), sleepNull()]);
if (restored === null) {
  bootSignal.aborted = true;
  idb = null;
  restored = emptyStreamRestore();
}
// 小ブロックの半径（?microR=0|16|24|28。F3 を出して F4 でも切りかえる。VOX-E）。
// E2E のサーバー（VITE_MICRO_DEFAULT=off）は 0 = 小ブロックなし。最初の列の段から効くよう 作るときに渡す（#180）
// 1 コマの仕事を 時間で決めるか 数で決めるか（E2E のサーバー VITE_FRAME_CLOCK=count は数。#179）
// 輪の大きさ（?ring=full|small。E2E のサーバーは VITE_RING_DEFAULT=small。#203）。WorldRenderer を作る前に 1 回だけ決める
// ブロックの型（?kata=off|4|8|16 と &kataUnder=K。#202）。メッシュを作る前に決める
setKataTable(decideKata(location.search));
// START-1 §4.4: おもさ（かるい・ふつう・きれい）→ 小ブロックの半径・輪・かげ。URL ＞ E2E の 環境変数 ＞ おもさ ＞ 今の きまり
const weighted = decideWeightedStart({
  search: location.search,
  weight: startPlan.weight,
  env: {
    shadow: import.meta.env.VITE_SHADOW_DEFAULT as string | undefined,
    micro: import.meta.env.VITE_MICRO_DEFAULT as string | undefined,
    ring: import.meta.env.VITE_RING_DEFAULT as string | undefined,
  },
  shadowStore: store,
});
setRing(weighted.ring);
// START-1 §4.3: つよさ（URL ＞ 保存 ＞ メニューで えらんだ 物 ＞ ふつう）。保存に 書く 値は 保存の 値（URL では 書きかえない）
const strengthLevel = decideStrength(location.search, restored.meta, startPlan.strength);
const strengthToWrite = strengthToSave(location.search, restored.meta, startPlan.strength);
const frameClock = decideFrameClock(location.search, import.meta.env.VITE_FRAME_CLOCK as string | undefined);
const renderer = new WorldRenderer(world, weighted.microR, frameClock);
if (new URLSearchParams(location.search).get('meshSlice') === 'off') renderer.config.meshSlice = false; // 小ブロックを 分けずに 1 回で作る（見くらべ・perf 用）
renderer.enableStreaming();
renderer.setViewer(island.spawn().x, island.spawn().z);
renderer.attach(game.scene);
const lighting = new Lighting();
const sceneBefore = new Set(game.scene.children);
buildScenery(game.scene);
for (const child of game.scene.children) if (!sceneBefore.has(child)) lighting.registerTree(child, 'block');
for (const m of renderer.materials()) lighting.register(m, 'block');
const time = new TimeOfDayImpl();
const timeSettings = time.settings;
const sky = new Sky({ scene: game.scene, time, timeSettings, lighting, light: renderer.light, focus: () => controller.state.position });

// 入力・スタート画面
mountHud(hud);
const lock = new LockController();
const wheel = new WheelAccumulator(game.input, () => lock.playInputEnabled());
// 本（BOOK-1）が 出ている間だけ Backspace を 止める（ブラウザの「前のページへ」にならないように）
let bookRef: Book | null = null;
bindKeyboardAndMouse(window, game.input, wheel, { preventExtra: () => bookRef?.active() === true });
const look = new MouseLook(lock);
const pointerLock = bindPointerLock(document, window, game.renderer.domElement, lock, look, game.input);
// BOOK-1: あそびかたの 3D の 本。出ている間は 世界が 止まり、景色は 描きなおさない
const book = new Book({
  parent: document.body,
  sound: (name) => playBook(fxSound, name),
  beforeOpen: () => game.flushRender(),
});
bookRef = book;
game.setModal(book);
game.input.onPress((action) => book.onAction(action));
const playOverlay = new PlayOverlay(hud, lock, () => pointerLock.request(), () => book.open());
startPlan.close(); // スタートメニューを 消す（今の「じゅんびちゅう」→「あそぼう」の 案内画面へ）
const soundSettingsUi = createSoundSettings({ audio: audioSettings, fx: FX_SETTINGS, onChange: () => audioSync() }, playOverlay.el);
// 最初のクリック・キーで音が使えるようになる（ブラウザのきまり）
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => mixer.unlock(), true);
document.addEventListener('visibilitychange', () => mixer.setHidden(document.hidden));
mixer.setHidden(document.hidden);
let audioKey = '';
let audioYokai: BgmSceneInput['yokai'] = [];
/** 設定が変わっていたら ミキサーに反映・保存・画面を合わせる */
function audioSync(): void {
  const k = `${audioSettings.masterVolume}|${audioSettings.bgmVolume}|${audioSettings.audioMuted}|${FX_SETTINGS.fxVolume}`;
  if (k === audioKey) return;
  audioKey = k;
  mixer.apply();
  audioPersist.sync();
  soundSettingsUi.refresh();
}
/** 毎ステップ: 場面 → BGM、画面の倍率、おめでとう画面のあいだ BGM を下げたまま */
function audioStep(): void {
  audioSync();
  if (game.tick % 10 === 0) audioYokai = yokaiM.list().map((y) => ({ state: y.state, position: y.position }));
  const dead = combat.dead();
  bgm.play(bgmScene.update({ tick: game.tick, phase: time.phase(), player: controller.state.position, yokai: audioYokai, dead }));
  const mode = screen.mode();
  mixer.setScreenLevel(screenLevel(mode, dead));
  // 実績の おしらせ（上の 帯）が 出ている 間は BGM を さげる（ファンファーレを 聞かせる）
  mixer.holdDuck(celebrate.bandModel.toast.isOpen());
  if (mode !== 'guide' && soundSettingsUi.isOpen()) soundSettingsUi.close();
}

// プレイヤーとカメラ
// スタート・やり直し・セーブの読みこみでは pitch は START_PITCH_DEG（CHAR-1 第 5.2 版 §4.1）
// スタートへ もどす。スタートのまわりが 読みこまれていなければ、そろうまで その場で まつ（VOX-D「遠くへ もどる」）
let streamHost: StreamHost | null = null;
const spawnPlain = () => ({ ...island.spawn(), pitchDeg: START_PITCH_DEG });
/** 地形だけで決まる立ち位置の y を、置いたブロックの上まで 上げる（石を置いた上に立つ）。列が読みこまれていなければ そのまま */
const raiseAboveBlocks = (x: number, y: number, z: number): number => {
  let yy = y;
  for (let i = 0; i < 64 && world.isLoaded(Math.floor(x), Math.floor(z)) && !isBodyPlaceable(world, { x, y: yy, z }); i++) yy++;
  return yy;
};
const startPoint = () => {
  const sp = island.spawn();
  const y = raiseAboveBlocks(sp.x, sp.y, sp.z);
  streamHost?.goTo({ x: sp.x, y, z: sp.z });
  return { ...sp, y, pitchDeg: START_PITCH_DEG };
};
const controller = new PlayerController(world, game.input, look, lock, startPoint);
// CHAR-1 第 5 版: 一人称（V）はなくなった。CameraRig は受け取るだけの ActionState を使う
const rig = new CameraRig(game.camera, game.scene, world, () => controller.state, game.input);
lighting.registerTree(rig.doll.group, 'doll');
// キャラは 8 方向のドット絵の板。?char=block のときだけ 箱人形（描画回数を比べるため）
const blockDollOnly = useBlockDoll(location.search);
// CHAR-5: キャラの 決め方（?char=・おぼえた値）と 窓口 char.get / char.set
// ?charsheets=orig（開発サーバーだけ）: 切りつめる前の 格子の絵を 読む（AC34 の くらべ用）
const charBase = (kind: 'girl' | 'boy'): string =>
  `${import.meta.env.DEV && new URLSearchParams(location.search).get('charsheets') === 'orig' ? './__char-orig/' : './models/char/'}${kind}/`;
let sprite: ReturnType<typeof createCharSprite> | null = null;
const charCtl = createCharController({
  search: location.search,
  store: window.localStorage,
  initial: startPlan.char ?? undefined, // メニューで えらんだ キャラ（START-1。URL で 始めたときは CHAR-5 の 決め方）
  onSwitch: (kind) => sprite?.setChar(kind, charBase(kind)),
});
const startKind = charCtl.get().kind;
sprite =
  blockDollOnly || startKind === 'block'
    ? null
    : createCharSprite({
        parent: rig.doll.group,
        camera: game.camera,
        lighting,
        kind: startKind,
        basePath: charBase(startKind),
        initTexture: (t) => game.renderer.initTexture(t),
      });
rig.doll.setBoxBody(blockDollOnly);
// TEX-A: キャラの足もとの丸い影。影（renderOrder 1）の あとに キャラの板（renderOrder 2）を描く
const blobShadow = new BlobShadow();
game.scene.add(blobShadow.mesh);
window.addEventListener("pagehide", () => { game.scene.remove(blobShadow.mesh); blobShadow.dispose(); });
rig.doll.group.traverse((o) => {
  if (o.name === 'charSprite') o.renderOrder = BLOB.spriteRenderOrder;
});
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
modalIsOpen = () => screen.inventoryOpen();
// 保存の要求は、あとで作る SaveManager へ（循環をさけるため関数でつなぐ）
let requestSave: () => void = () => {};
const hudSignal: { full: () => void } = { full: () => {} };
// 設定は 1 つずつ作って、settings から変えたら すぐ効くようにみんなで共有する
const combatCfg = createCombatConfig();
const digCfg = createDigConfig();
const craftConfig = createCraftConfig();
const toolConfig = createToolConfig();
/** 画面（ツールチップ・図鑑）用の 道具の数: 刀の 強さに レジェンダリーの P を 足す（WEAPON-7 §2.1。設定を 変えると 追従） */
const uiWeaponDamage = (): Record<string, number> => {
  const out: Record<string, number> = { ...toolConfig.weaponDamage };
  for (const d of w2.legendary) out[d.item] = legendPowerOf(w2, d.item) ?? out[d.item] ?? 1;
  return out;
};
const uiTools: ToolNumbers = {
  ...toolConfig,
  get weaponDamage() {
    return uiWeaponDamage();
  },
};
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
// LIVE-1（にわとり）: 設定 18 こ（settings から変えたら すぐ効く）としくみ。たまごは 落ちた アイテム にする
const live = createLiveSettings();
const animals = createAnimalManager({
  world,
  getPlayer: () => controller.state,
  deps: {
    seed,
    settings: live,
    // たまごは 小さい 速さで ポンと 出す（遠くへ とばさない）
    dropEgg: (at) => {
      drops.scatter(at, [{ item: 'egg', count: 1 }], { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 });
    },
    // 版 3.2: あみで とれた むし。持ち物 が いっぱい なら 足もと に 落として false
    addItem: (item) => {
      if (inventory.add(item, 1) === 0) return true;
      const p = controller.state.position;
      drops.scatter({ x: p.x, y: p.y + 0.5, z: p.z }, [{ item, count: 1 }], { speedMin: 0.3, speedMax: 0.8, upMin: 3, upMax: 3.5 });
      return false;
    },
    carriedBefore: () => (achievements.stats()['carry:*'] ?? 0) > 0,
    day: () => time.day(),
    phase: () => time.phase(),
    countryAt,
  },
});
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
  // WEAPON-7: レジェンダリーの 強さは 設定 `legendary` の power（ふつうの 刀は 今の 表）
  weaponDamage: (item) => legendPowerOf(w2, item) ?? toolConfig.weaponDamage[item] ?? 1,
  onHit: () => {
    inventory.wearHeld(w2.toolWear.blade.hit);
  },
  lunge: (dx, dz) => controller.lunge(dx, dz),
  tick: () => game.tick,
});
// WEAPON-7: レジェンダリー武器の ため・ためわざ（落雷）。たいきゅうは 1 体 以上に 当たった ときだけ 1
const legend = createLegendSystem({
  world,
  yokai: () => yokaiManager!,
  settings: w2,
  tick: () => game.tick,
  onWear: () => {
    inventory.wearHeld(1);
  },
  sound: (n) => playLegend(fxSound, n),
  // WEAPON-8 §3.6: ため音は 続く 音。剣ごとの 味（風神 / 雷神）は ためわざの しゅるいで えらぶ
  loop: (name) => startLegendLoop(fxSound, name, chargeOf(w2, inventory.held()?.item ?? null)?.kind === 'spiral' ? 'fujin' : 'raijin'),
  // WEAPON-8: らせんの かぜは F6 に 体の 点 B（足もと + 1.4）から
  launchSpiral: (a) => {
    const p = controller.state.position;
    waveSys.launchSpiral({ item: a.item, dirDeg: a.dirDeg, body: { x: p.x, y: p.y + 1.4, z: p.z } });
  },
  seed,
});
const waveView3d = createWaveView3D(game.camera);
// WEAPON-7 PR2: 風神剣の 真空波（ふつうの わざの 当たりの はじめの F に 1 つ。たいきゅうは へらさない）
const waveSys = createWaveSystem({
  world,
  yokai: () => yokaiManager!,
  settings: w2,
  tick: () => game.tick,
  emit: (e) => legend.emit(e),
  sound: (v) => playLegend(fxSound, 'windWave', v),
  spiralSound: () => startLegendOneShot(fxSound, 'spiralWind'),
  onSpiralHit: () => inventory.wearHeld(1),
  reducedMotion: () => reducedMotionMq?.matches ?? false,
  view: () => waveView3d.view(),
  seed,
});
// WEAPON-5: 刀のパリィ（Shift＋クリック）。「動きを へらす」のときは スローにしない
const reducedMotionMq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const parry = createParry(w2, { reducedMotion: () => reducedMotionMq?.matches ?? false });
const parryFx = new ParryFx({ scene: game.scene, camera: game.camera, basePath: './models/fx/' });
const sparkAt = { x: 0, y: 0, z: 0 };
// WEAPON-7: 雷の 見た目（十字の ドット絵・着地の 光・光の つぶ）
const IDLE_THUNDER_LOOK = { charging: false, ready: false, aimS: null };
const thunderFx = new ThunderFx({ scene: game.scene, camera: game.camera, seed });
// ART-PIPE-1: 落雷の 間だけ 世界を 絵に 描く 道（深さを 読む 雷・まわりを 明るく）
game.setWorldPass(thunderFx);
thunderFx.warmUp(game.renderer, game.camera); // 読みこみ中に 雷 B の プログラムを 作る
const windWaveFx = new WindWaveFx({ scene: game.scene, camera: game.camera });
// WEAPON-8: らせんの かぜ（S2）・土と 草の つぶ・手もとの 光・速さバフの アイコン
const spiralFx = new SpiralFx({ scene: game.scene, camera: game.camera });
const spiralDebris = createSpiralDebris({ world, seed });
const chargeLight = createChargeLight();
const chargeLightFx = new ChargeLightFx({ scene: game.scene, camera: game.camera });
const handInfo = newHandInfo();
/** 今の 剣を 持つ 手の 位置（三人称は 体から、一人称〈カメラが 体に 近く 人形が 見えない〉は 画面の 右下の にぎり） */
const handNow = (): typeof handInfo => {
  game.camera.updateMatrixWorld();
  return computeHand({ first: rig.getInfo().hideChar, pos: controller.state.position, yawDeg: controller.state.yawDeg, camera: game.camera }, handInfo);
};
const buffModel = createBuffModel();
controller.lungeYokai = () => (yokaiManager ? yokaiManager.list() : []);
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
    bucket: createBucket({ inventory, emit: (e) => farm.emit(e), tick: () => game.tick }),
    pet,
    animals,
    eggHeal: () => live.animalEggHeal,
    live: () => ({ netSwingTicks: live.netSwingTicks, carryHoldTicks: live.carryHoldTicks }),
    emitFarm: (e) => farm.emit(e),
    nowTick: () => game.tick,
    vitals: combat,
    blade,
    legend,
    parry,
    w2,
    yokai: () => yokaiManager!,
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
  strength: strengthLevel,
  light: renderer.light,
  // 出る場所は 描く輪の メッシュずみの列だけ（VOX-D）
  canSpawnAt: (x, z) => streamHost?.stream.isDrawn(Math.floor(x) >> 4, Math.floor(z) >> 4) ?? true,
  // 場所の倍率 M の はじまりの場所・海面の高さは、世界の設定から読む（数を書きこまない）
  origin: () => island.spawn(),
  seaY: () => SEA_Y,
  settings: w2,
  // WEAPON-7: ヌシが レジェンダリーを おとした → 上の 帯の テロップ
  onLegendDrop: (info) => celebrate.enqueueTelop(info.item),
  // WEAPON-5: 妖怪の 攻撃が 当たる所で パリィに 聞く
  parry: {
    hit: (h) => {
      const r = parry.hit({ dirDeg: h.dirDeg, yawDeg: controller.state.yawDeg, by: h.by, yokaiId: h.yokaiId, amount: h.amount });
      if (r.first) parryFx.spark(bladeMidInto(sparkAt, controller.state.position, controller.state.facingDeg), reducedMotionMq?.matches ?? false);
      return { result: r.result, amount: r.amount };
    },
  },
  onParryEvent: (e) => {
    parry.note({ type: e.type, yokaiId: e.yokaiId, ...(e.by ? { by: e.by } : {}), ...(e.damage !== undefined ? { damage: e.damage } : {}) });
    if (e.type === 'staggerDouble') {
      staggerIcons.burstAt(e.yokaiId);
      playParry(fxSound, 'staggerBreak');
    }
  },
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
// LIVE-1: にわとり の 見た目・音（動きの強さの 設定は まだ ない。できたら ここで つなぐ）
const animalMotion = (): number => 1;
const animalFx = new AnimalFx({ sound: fxSound, motion: animalMotion, lookDist: () => live.animalLookDist, fullTicks: () => live.animalFullTicks, seed });
const animalRenderer = new AnimalRenderer({ fx: animalFx, motion: animalMotion, player: () => controller.state.position });
const animalViews = new ViewBuffer();
const animalEvents: import('./contracts').AnimalEvent[] = [];
game.scene.add(animalRenderer.group);
lighting.register(animalRenderer.bodyMaterial, 'doll');
/** A の出来事を 1 回だけ 取り出して、B（音・つぶ）と C（実績・合図）に 同じ物を流す。窓口 events() 用にも ためる */
function deliverAnimalEvents(): void {
  const ev = animals.events();
  if (ev.length === 0) return;
  // はじめての お祝いの あと: A の carryHint 出来事を、ほかの 合図と 同じ hint 出来事に する
  for (let i = 0; i < ev.length; i++) {
    if (ev[i].type === 'carryHint') ev[i] = { type: 'hint', hint: 'carryHint' };
  }
  animalFx.onEvents(ev);
  animalHint.feed(ev);
  achievements.feedAnimals(ev);
  for (const e of ev) animalEvents.push(e);
  if (animalEvents.length > 512) animalEvents.splice(0, animalEvents.length - 512);
}
game.onBeforeRender(() => animalRenderer.update(animalViews.fill(animals), game.camera));
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
const buffIcons = new BuffIcons(hud);
const hotbar = new Hotbar(hud, inventory, notice);
// ねらっている所の ヒント（設定 actionHint で消せる）
const hintSettings = { actionHint: true };
const actionHint = new ActionHint(hud);
const titleAnnounce = new TitleAnnounce(hud);
const yokaiNameplates = new YokaiNameplates(hud);
const staggerIcons = new StaggerIcons(hud, './models/fx/');
const stagIconBuf: { id: number; x: number; y: number; z: number; titled: boolean }[] = [];
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
  tools: uiTools,
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
const animalHint = new AnimalHint(hud);
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
  titleSound,
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
  // CHAR-4: 刃の軌跡は 体（当たり判定の 足もと）の そのステップの おわりの 位置と カメラから 作る
  body: () => controller.state.position,
  camera: game.camera,
  shakeEl: game.renderer.domElement,
  onWear: (e) => achievements.feedWear(e),
  onBlade: (e) => achievements.feedBlade(e),
  // WEAPON-7: ふつうの わざに 雷の「ビシューン」を 重ねる（ダメージは かえない）
  onTechItem: (item) => {
    if (trailStyleOf(w2, item) === 'thunder') playLegend(fxSound, 'thunderSlash');
  },
  onArrowPickup: () => hotbar.pickup('ya', 1),
});

// ---- M6: 実績・演出・たんす画面・説明 ----
const achievements = new AchievementSystem(() => m6);
achievementsRef = achievements;
// WEAPON-7: 手に 入れた ことの ある レジェンダリー（もちものに 入った とき。袋を ひろう・テストの add も）。実績 get.* と legend.kinds へ
const legendBook = new LegendBook((item) => w2.legendary.some((d) => d.item === item));
inventory.onAdded = (item) => {
  const r = legendBook.add(item);
  if (r) achievements.feedLegend(item, r.kinds);
};
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
    for (let z = ez - r; z <= ez + r; z++)
      for (let x = ex - r; x <= ex + r; x++) {
        if (!world.isLoaded(x, z)) continue;
        for (let y = y0; y <= y1; y++) {
          const k = cropKindOfBlock(world.getBlock(x, y, z));
          if (k && k.wild) wildScan.list.push({ x, y, z, stage: 3 });
        }
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
  if (combat.dead()) return;
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
  if (screen.mode() === 'guide' || combat.dead() || storage.ui().open) return;
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
  itemRarity: (item: ItemId) => rarityIndex(itemRarity(item)),
  itemIconUrl,
  achievement: (id: AchievementId) => {
    const d = defById.get(id)!;
    return { name: d.name, tier: d.medal, artUrl: achievementArtUrl(d) ?? markUrl('medal') };
  },
  levelUpShowing: () => levelHud.celebrating(),
  // WEAPON-7: ヌシの「あらわれた！」が 出ている 間は 上の 帯の ほかの ものを 待たせる
  appear: () => {
    const a = yokaiM.announce();
    return a ? { ticksLeft: a.ticksLeft } : null;
  },
  onTelopStart: () => playLegend(fxSound, 'legendDrop'),
  reducedMotion: () => reducedMotionMq?.matches ?? false,
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
  weaponDamage: uiWeaponDamage(),
  weaponReach: toolConfig.weaponReach,
  bladeReach: w2.bladeReach,
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
  if (h === 'raijin_ken' || h === 'fujin_ken') return 'katana'; // WEAPON-7: 雷神剣で たおした ときは「かたな」と 同じ あつかい（実績の 表に 武器別の 行は 足さない）
  if (h === 'wood_pickaxe' || h === 'stone_pickaxe' || h === 'iron_pickaxe' || h === 'wood_axe' || h === 'stone_axe' || h === 'iron_axe') return 'pickaxe';
  return 'hand';
};
onDefeatAch = (kind) => {
  log.defeat(YOKAI_NAME[kind]);
  achievements.feedDefeat({ kind, tick: game.tick, with: defeatWith(), hp: combat.hp() });
};

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
  achievements: { serialize: () => achievements.serialize(), deserialize: (d) => achievements.deserialize(d) },
  animals: { serialize: () => animals.serialize(), deserialize: (d) => animals.deserialize(d) },
  legend: { serialize: () => legendBook.serialize(), deserialize: (d) => legendBook.deserialize(d) },
  // 農業: 作物・印。前の保存（印なし）には 読んだあとに 置きものを置く
  farm,
  // VOX-D: 列は stream が読みこむ。保険から戻したときの最初の保存は ready のあと
  streaming: true,
  onWritten: (cols) => columnIO.noteWritten(cols),
  storedChunks: () => restored.keys.size,
});
requestSave = () => save.saveIfChanged();
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
  requestSave();
};
// 保存を読んだ世界では たんす の場所が わからないので、ここで 1 回だけ 計算する（あそびの途中では 計算しない）
if (loadedSave && oldTansu === null && farm.kakashi()) oldTansu = computeFarmPlacement(seed).oldFarm?.tansu ?? null;
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
streamHost = host;
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

// #144 SHADOW-1: 光の位置から計算する影（?shadow=0 は作らない。くわしくは docs/design/SHADOW.md）
let shadowSystem: ShadowSystem | null = null;
const overlay = new PerfOverlay(hud, game, {
  lines: () => {
    const m = renderer.meshStats();
    return [
      `micro r=${renderer.microRadiusNow} (F4)  mesh ${m.meshCount}  wait ${m.pending}  geo ${(m.geometryBytes / 1048576).toFixed(1)}MB`,
      ...(shadowSystem ? [shadowSystem.line()] : []),
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
  streamFrame();
  audioStep();
  applyUiAlpha(craft2Settings);
  time.update();
  // WEAPON-5: パリィの 入力は 妖怪の 更新の 前（このステップの 当たりが F1 になる）
  const parryIn = dig.parryInput(game.tick + 1);
  // Shift を 押した 時点で パリィの 絵を 先読みする（刀を 持っただけでは 読まない。初回から 受けの 絵が 出るように）
  if (parryIn.run && parryIn.active && isBladeItem(parryIn.item)) sprite?.preloadParry();
  parry.update(parryIn);
  // WEAPON-2: 刀・弓の 動きの 制限（歩く倍率・ジャンプ止め）を プレイヤーへ
  {
    const bm = blade.motion();
    const wm = tools.bow().motion();
    const pm = parry.motion();
    // 始めた ステップは まだ 走れる（刀のわざと 同じ）。そのあと 速さを 0 に して すべらせない
    const pmOn = !parry.startedNow();
    const lm = legend.motion();
    controller.motion.speedMul = bm.speedMul * wm.speedMul * (pmOn ? pm.speedMul : 1) * lm.speedMul * legendMoveMulOf(w2, inventory.held()?.item ?? null);
    controller.motion.jumpLocked = bm.jumpLocked || wm.jumpLocked || pm.jumpLocked || lm.jumpLocked;
    controller.motion.noRun = lm.noRun;
    // CHAR-2: わざのあいだは 向きを わざの向きに 固定（わざを始めたステップは あとで その場で）
    // WEAPON-3: 刀の わざ・パンチの あいだは 攻撃の向き u。攻撃・空ぶりは ＋マークへ 回らない（leftAims）
    // WEAPON-5: パリィの あいだは 今 向いている 方（カメラの 向き）を向く。始めた ステップは すべらず 止まる
    controller.motion.faceDeg = pm.jumpLocked ? controller.state.yawDeg : (lm.faceDeg ?? dig.attackFaceDeg());
    controller.motion.leftAims = !['attack', 'whiff'].includes(dig.attackPreview().use);
    controller.motion.stopNow = false;
  }
  // 空の光の弱まりを先に今の時刻にそろえる（妖怪の出現の「暗い所」がこれを読む。Sky は あとで画面ぶんを更新）
  skyDarkness.value = darkenFromBrightness(time.brightness(), timeSettings.nightBrightness);
  if (worldReady()) controller.update(dt); // 読みこみを まつ間は 動かない・落ちない（VOX-D）
  // カメラ（肩の点 S）を先に決める。ねらい（dig.update）は S を使う（CHAR-1 第 5.2 版）
  rig.update(dt);
  if (worldReady()) yokaiM.update();
  if (worldReady()) animals.update();
  dig.update();
  // WEAPON-7 PR2: 真空波（刀が きまった あと。体は ふみこんだ あとの 位置）
  {
    const bs = blade.state();
    const cp0 = controller.state.position;
    waveSys.step({
      item: bs.item,
      tech: bs.tech,
      phase: bs.phase,
      frame: bs.frame,
      startup: bs.lengths?.startup ?? 0,
      dirDeg: bs.move?.dirDeg ?? controller.state.yawDeg,
      body: { x: cp0.x, y: cp0.y + 1.4, z: cp0.z },
    });
  }
  // LIVE-1: ねらっている にわとり（しるし）。出来事は ここで 1 回だけ 取り出して 音・つぶ・実績・合図に 同じ物を流す
  animals.setTargeted(dig.animalTarget());
  {
    deliverAnimalEvents();
    animalFx.step(animalViews.fill(animals), controller.state.position);
    animalHint.step();
  }
  // CHAR-2 §4.6: 刀・弓が 決まったあとで 板のコマを決める。矢の出来事は ここで 取り出して 配る
  const arrowEvents = tools.drainArrowEvents();
  arrowRelay.give(arrowEvents);
  if (screen.mode() === 'play') {
    const st = controller.state;
    const bs = blade.state();
    // わざを始めた ステップ: その場で わざの向きを向き、水平の速さを 0 に
    const lstrike = legend.strike();
    const faceU = legend.faceDeg() ?? dig.attackFaceDeg();
    if (faceU !== null) st.facingDeg = ((faceU % 360) + 360) % 360;
    rig.doll.setArcDir(st.facingDeg);
    // WEAPON-5: パリィの 絵と 青白い 光（からだの 色）
    const ps = parry.state();
    sprite?.setParry(parryCellOf(ps.phase, ps.frame));
    sprite?.setGlow(parryGlowLevel(ps.glowLeft, w2));
    if ((bs.move !== null && bs.frame === 1) || parry.startedNow() || lstrike?.F === 1) st.velocity.x = st.velocity.z = 0;
    const bowPose = tools.bow().state();
    const held = inventory.held()?.item ?? null;
    const weapon = bs.item !== null ? 'katana' : held === 'yumi' ? 'bow' : 'none';
    sprite?.step({
      position: st.position,
      velocity: st.velocity,
      onGround: st.onGround,
      inWater: st.inWater,
      running: st.running,
      facingDeg: st.facingDeg,
      weapon,
      // CHAR-4: 持っている 刀の 色（20・21 番を この 色に）。表に ない 刀は かたなの 行
      bladeColors: weapon === 'katana' ? bladeColorsOf(w2, bs.item) : null,
      legendCharge: weapon === 'katana' && legend.view().charging,
      blade:
        weapon === 'katana'
          ? lstrike
            ? { stance: bs.stance, tech: 'kesa' as const, ...lightningPoseFrame(lstrike.F, lstrike.total), lengths: null }
            : { stance: bs.stance, tech: bs.tech, phase: bs.phase, frame: bs.frame, lengths: bs.tech ? (bs.lengths ?? w2.bladeTech[bs.tech]) : null }
          : null,
      bow:
        weapon === 'bow'
          ? { drawing: bowPose.drawing, drawTicks: bowPose.drawTicks, shot: arrowEvents.some((e) => e.type === 'arrowShot') }
          : null,
    });
  }
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
      for (const e of fe) {
        if (e.type === 'pour') waterFx.pour(farm.lastPourCells());
        else if (e.type === 'bucketPlace') waterFx.pour([{ x: e.x, y: e.y - 1, z: e.z }]); // 置いた マスの 上から しずく
      }
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
      // やられた: だっこ中の にわとりは その場に おろす（A の putDown が 足もとに 置く）
      if (e.type === 'death' && animals.carrying() !== null) animals.dropCarried({ x: controller.state.position.x, y: controller.state.position.y, z: controller.state.position.z });
    }
    handleGuardEvents(combatEvents, fxSound);
    combatBuf = combatEvents;
    achievements.feedCombat(combatEvents);
  }
  arrowVisuals.syncFlying(tools.bow().arrows());
  stuckVisuals.syncStuck(tools.bow().stuck());
  wearNotice.step();
  weaponFx.step();
  // WEAPON-7: 雷・ための 光（出来事は ここで 1 回 取り出す）
  {
    const evs = legend.drainEvents();
    const holdingLegend = legend.chargeable(inventory.held()?.item ?? null);
    for (const e of evs) {
      thunderFx.onEvent(e);
      windWaveFx.onEvent(e);
      if (e.type === 'lightningStrike') {
        for (const id of e.hits) {
          const y = yokaiM.list().find((q) => q.id === id);
          if (y) weaponFx.hitStarsAt({ x: y.position.x, y: y.position.y + 0.7, z: y.position.z });
        }
      }
    }
    const reducedNow = reducedMotionMq?.matches ?? false;
    windWaveFx.step(waveSys.list(), reducedNow);
    // WEAPON-8: らせんの かぜ（見た目は 当たりの P(a)）と 土と 草の つぶ
    const sp = waveSys.list().find((w) => w.kind === 'spiral');
    for (const e of evs) spiralFx.onEvent(e);
    spiralDebris.step(sp ? { id: sp.id, age: sp.age, position: sp.position, dir: sp.dir } : null, reducedNow);
    spiralFx.step(sp, spiralDebris);
    const lv = holdingLegend ? legend.view() : null;
    const st = lv && lv.ready ? legend.state() : null;
    thunderFx.step(lv ? { charging: lv.charging, ready: lv.ready, aimS: st && st.aim && st.aim.skyVisible ? st.aim.S : null } : IDLE_THUNDER_LOOK, reducedNow);
    // WEAPON-8 §3.5: ため中の 手もとの 光（雷神剣も 風神剣も）。手は 三人称は 体から、一人称は 画面の 右下の にぎり
    const cp = controller.state.position;
    const cl = chargeLight.step({ ticks: lv ? lv.chargeTicks : null, kind: lv ? lv.kind : null, reduced: reducedNow });
    if (cl.phase !== 'off') {
      handNow();
      chargeLightFx.step(cl, handInfo, handInfo.first ? null : { x: cp.x, y: cp.y + 1.1, z: cp.z });
    } else chargeLightFx.step(cl, handInfo, null);
    // WEAPON-8 §2.4: 速さバフの アイコン（手に 持つ 物の 速さの 倍率が 1 より 大きい 間）
    const heldNow = inventory.held()?.item ?? null;
    buffIcons.sync(buffModel.step(buffsOfHeld(heldNow, (i) => legendMoveMulOf(w2, i)), reducedNow));
  }
  for (const n of parry.sounds()) if (isParrySound(n)) playParry(fxSound, n);
  {
    const ps = parry.state();
    parryFx.step({ visible: ps.glowLeft > 0, level: parryGlowLevel(ps.glowLeft, w2), position: controller.state.position, reduced: reducedMotionMq?.matches ?? false });
  }
  combatUi.hearts.setArmor(armor.snapshot().hudIcons);
  craftHud.update(dt);
  fx.update(dt);
  combatFx.update(dt);
  weaponFx.update(dt);
  parryFx.update();
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
  staggerIcons.update(yokaiM.staggerIcons(stagIconBuf), game.camera, screen.mode() === 'play');
  actionHint.update(hintVisible() ? actionHintLines(dig.previewRightClick(), dig.previewLeftClick(), { carryProgress: dig.carryProgress(), carrying: animals.carrying() !== null, held: tools.current().item, heldIsPickaxe: tools.current().kind === 'pickaxe', heldIsBlade: tools.current().kind === 'blade' }) : {});
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
  const pp = controller.state.position;
  renderer.update({ x: pp.x, z: pp.z });
  save.update(game.tick + 1);
});
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
  blobShadow.update(p, ground, rig.doll.group.visible);
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
    achMuted = on;
  },
};
const facingTmp = { x: 0, y: 0, z: 0 };
const hudHook = { toolHint: () => { const h = dig.toolHint(); return h ? { slot: h.slot, ticksLeft: h.ticksLeft } : null; }, actionHint: () => actionHint.current(), yokaiFocus: () => yokaiFocus.current(), yokaiFocusHulls: () => yokaiFocus.hullCount(), hpBar: (id: number) => yokaiManager?.hpBarInfo(id) ?? null, announce: () => yokaiManager?.announce() ?? null, nameplate: (id: number) => yokaiManager?.nameplateInfo(id) ?? null, staggerIcon: (id: number) => yokaiManager?.staggerIconInfo(id) ?? null };
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
    yokaiGroup: yokaiManager.group,
    player: () => controller.state.position,
    facing: () => controller.state.facingDeg,
  });
  sys.enabled = shadowStart.on;
  const sprite = rig.doll.group.getObjectByName('charSprite');
  if (sprite) sys.attachSprite(sprite as import('three').Mesh);
  game.onBeforeRender(() => sys.preRender());
  shadowSystem = sys;
  window.addEventListener('pagehide', () => sys.dispose());
}
const setShadow = (on: boolean): void => {
  if (!shadowSystem) return;
  shadowSystem.enabled = on;
  saveShadowPref(shadowStore, on);
  shadowSettingUi.refresh(on);
  game.step(0); // 次のコマで画面を合わせる
};
shadowSettingUi.bind(shadowSystem !== null, shadowStart.on, setShadow);
installTestHook(game, overlay, () => host.everReady, {
  start: startBoot.hook,
  char: charCtl,
  shadow: createShadowHook({
    system: shadowSystem,
    renderer: game.renderer,
    scene: game.scene,
    camera: game.camera,
    world,
    player: () => controller.state.position,
    step: (n) => game.step(n),
    renderNow: () => game.renderNow(),
    setEnabled: setShadow,
  }),
  biome: createBiomeHook({ seed, player: () => controller.state.position }),
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
        core: v.core,
        alpha: v.alpha,
        particles: v.particles,
        ring: v.ring,
        sweep: v.sweep,
        sparkles: v.sparkles,
        orbit: v.orbit,
        orbitAngle: v.orbitAngle,
        center: h ? { ...h.world } : null,
        screen: h && h.screen ? { ...h.screen } : null,
      };
    },
    chargeSound: () => ({ ...legend.chargeSound() }),
    spiralSound: () => legend.spiralSound(),
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
  combat: {
    ...combatHook,
    arrows: toolHook.arrows,
    /** 鳴らす頼み・鳴らした音の名前の列（呼ぶと空） */
    sounds: () => drainSounds(),
    events: () => [...combatHook.events(), ...toolHook.arrowEvents()],
  } as unknown as TestHookGroups['combat'],
  ...logHook,
  ui: { alpha: () => uiAlpha(), topBand: () => celebrate.topBand(), buffs: () => buffModel.list().map((b) => ({ ...b })) },
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
    clear: () => animals.clear(),
    trySpawn: () => animals.trySpawn(),
    target: () => dig.animalTarget(),
    events: () => {
      deliverAnimalEvents();
      return animalEvents.splice(0, animalEvents.length);
    },
    fx: () => animalFx.fx(),
    fxReset: () => animalFx.fxReset(),
    // 今 チップに出ている合図（120 ステップで消える。消えたら null）
    lastHint: () => animalHint.model.current(),
    carrying: () => animals.carrying(),
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
game.start();
