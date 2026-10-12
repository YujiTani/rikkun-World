import { CameraRig } from './camera/CameraRig';
import { createCrosshair } from './camera/crosshair';
import { createCameraHook } from './camera/hook';
import { PerfOverlay } from './debug/perfOverlay';
import { installTestHook, type TestHookGroups } from './debug/testHook';
import { Game } from './game/Game';
import { buildScenery } from './game/scenery';
import { createSettingsHook } from './game/settings';
import { ActionState, bindKeyboardAndMouse } from './input/actions';
import { LockController, MouseLook, bindPointerLock, createInputHook, createLockHook } from './input';
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

const game = new Game(container);

// 世界: 入れ物 → 島 → 絵
const world = new ArrayVoxelWorld();
const island = generateIsland(readSeed(), world);
const renderer = new WorldRenderer(world);
renderer.attach(game.scene);
buildScenery(game.scene, world.size);

// 入力・スタート画面
mountHud(hud);
bindKeyboardAndMouse(window, game.input);
const lock = new LockController();
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

const overlay = new PerfOverlay(hud, game);

// 毎ステップの順: プレイヤー → カメラ → 世界の作り直し →（Game が）入力の「押した」を消す
game.onUpdate((dt) => {
  controller.update(dt);
  if (lock.playInputEnabled() && game.input.wasPressed('toggleView')) {
    viewActions.press('toggleView');
    viewActions.release('toggleView');
  }
  rig.update(dt);
  viewActions.endFrame();
  crosshair.setVisible(rig.crosshairVisible());
  renderer.update();
});
game.onUpdate((dt) => overlay.update(dt));
// ロックがないあいだは時間を止める。F3 だけは効く（M1-02 §2.4）
game.setRealtimeGate(() => lock.realtimeAllowed());
game.onIdle((dt) => overlay.update(dt));

const cameraHook = createCameraHook(rig);
installTestHook(game, overlay, {
  world: createWorldHook(world, renderer, island),
  player: { ...createPlayerHook(controller), doll: cameraHook.doll } as unknown as TestHookGroups['player'],
  camera: cameraHook.camera,
  lock: createLockHook(lock),
  input: createInputHook(game.input, look),
  settings: createSettingsHook(controller.settings, rig.config),
});
game.start();
