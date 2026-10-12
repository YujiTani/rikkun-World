import { CameraRig } from './camera/CameraRig';
import { createCrosshair } from './camera/crosshair';
import { createCameraHook } from './camera/hook';
import { DigFx } from './fx/DigFx';
import { FX_SETTINGS } from './fx/config';
import { SoundFx } from './fx/sound';
import { DigSystemImpl, createDigHook } from './dig';
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

const container = document.getElementById('game')!;
const hud = document.getElementById('hud')!;

/** URL の ?seed=数 で島を変えられる（なければふだんのシード） */
function readSeed(): number {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) ? n : GEN_CONFIG.defaultSeed;
}

/** dig.config のうち settings に出す名前だけを、そのまま読み書きできる見え方にする（digResumeTicks は出さない） */
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
renderer.attach(game.scene);
buildScenery(game.scene, world.size);

// 入力・スタート画面
mountHud(hud);
const lock = new LockController();
const wheel = new WheelAccumulator(game.input, () => lock.playInputEnabled());
bindKeyboardAndMouse(window, game.input, wheel);
const look = new MouseLook(lock);
const pointerLock = bindPointerLock(document, window, game.renderer.domElement, lock, look, game.input);
new PlayOverlay(hud, lock, () => pointerLock.request());

// プレイヤーとカメラ
const controller = new PlayerController(world, game.input, look, lock, () => island.spawn());
// V（視点の切り替え）はロックがないあいだは無視する（T5 の指摘）。
// CameraRig には専用の ActionState を渡し、ロックがあるときだけ押しを写して読ませる。
const viewActions = new ActionState();
const rig = new CameraRig(game.camera, game.scene, world, () => controller.state, viewActions);
const crosshair = createCrosshair(hud);
crosshair.setVisible(rig.crosshairVisible());

// 持ち物・画面の状態・ほる／おく
const inventory = new InventoryImpl();
const screenSettings = createScreenSettings();
const screen = new ScreenController(lock, inventory, game.input, screenSettings, pointerLock);
const dig = new DigSystemImpl(world, () => controller.state, game.input, lock, inventory, () => controller.settings.eyeHeight);
rig.setHeldProvider(() => inventory.held()?.item ?? null);

// 画面の見た目と音
const notice = new Notice(hud);
const hotbar = new Hotbar(hud, inventory, notice);
const inventoryScreen = new InventoryScreen(hud, inventory, screen, () => screen.toggle());
const fx = new DigFx({
  scene: game.scene,
  dig,
  sound: new SoundFx(),
  doll: rig.doll,
  view: rig,
  notice,
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
});
if (saveOptions.reset) {
  save.clear();
  history.replaceState(null, '', stripResetParam(location.href));
} else {
  save.load();
}
lock.onChange((locked) => {
  if (!locked) save.saveIfChanged();
});
screen.onClose(() => save.saveIfChanged());
save.bindPageEvents(window, document);

const overlay = new PerfOverlay(hud, game);

// 毎ステップの順: プレイヤー → カメラ → 世界の作り直し →（Game が）入力の「押した」を消す
game.onUpdate((dt) => {
  controller.update(dt);
  if (lock.playInputEnabled() && game.input.wasPressed('toggleView')) {
    viewActions.press('toggleView');
    viewActions.release('toggleView');
  }
  dig.update();
  fx.update(dt);
  rig.update(dt);
  viewActions.endFrame();
  crosshair.setVisible(rig.crosshairVisible() && screen.mode() === 'play');
  hotbar.update();
  inventoryScreen.update();
  notice.update(dt);
  renderer.update();
  save.update(game.tick + 1);
});
game.onUpdate((dt) => overlay.update(dt));
// ロックがないあいだは時間を止める。F3 だけは効く（M1-02 §2.4）
game.setRealtimeGate(() => lock.realtimeAllowed());
game.setTimeScale(() => screen.timeScale());
game.onIdle((dt) => overlay.update(dt));

const cameraHook = createCameraHook(rig);
installTestHook(game, overlay, {
  world: createWorldHook(world, renderer, island),
  player: { ...createPlayerHook(controller), doll: cameraHook.doll } as unknown as TestHookGroups['player'],
  ...createDigHook(dig),
  inventory: createInventoryHook(inventory, screen),
  save: createSaveHook(save),
  camera: cameraHook.camera,
  lock: createLockHook(lock),
  input: createInputHook(game.input, look, wheel),
  settings: createSettingsHook(controller.settings, rig.config, [digSettingsView(dig.config), screenSettings, FX_SETTINGS]),
});
game.start();
