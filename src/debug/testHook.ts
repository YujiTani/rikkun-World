import type { Game, RenderStats } from '../game/Game';
import type { createCameraHook } from '../camera/hook';
import type { createSettingsHook } from '../game/settings';
import type { createInputHook, createLockHook } from '../input';
import type { createDigHook } from '../dig';
import type { createInventoryHook } from '../inventory';
import type { createSaveHook } from '../save';
import type { createTimeHook } from '../time';
import type { createCombatHook } from '../combat';
import type { createArmorHook, createCraftHook, createFurnaceHook } from '../craft';
import type { createCraftUiHook } from '../ui/craftUi';
import type { createToolHook } from '../tools';
import type { createYokaiHook } from '../yokai';
import type { WorldHook } from '../world/hook';
import type { PerfOverlay } from './perfOverlay';

type CameraHook = ReturnType<typeof createCameraHook>;
type PlayerHook = {
  get(): unknown;
  set(v: { position?: object; velocity?: object; yaw?: number; pitch?: number }): void;
  doll: CameraHook['doll'];
};

/**
 * 自動テスト（テストチーム・性能チーム）からゲームを操作するための窓口。
 * window.__rikkun でアクセスする。遊ぶ人には見えない。
 * 名前の一覧と決まりは docs/design/M1-02-movement.md §6.1。
 */
export interface TestHook {
  ready: boolean;
  tick(): number;
  pause(): void;
  resume(): void;
  step(count?: number): void;
  renderStats(): RenderStats;
  perfOverlayVisible(): boolean;
  world: WorldHook;
  player: PlayerHook;
  camera: CameraHook['camera'];
  input: ReturnType<typeof createInputHook>;
  lock: ReturnType<typeof createLockHook> & { tab(name: string): void };
  settings: ReturnType<typeof createSettingsHook>;
  target: ReturnType<typeof createDigHook>['target'];
  dig: ReturnType<typeof createDigHook>['dig'];
  inventory: ReturnType<typeof createInventoryHook>;
  save: ReturnType<typeof createSaveHook>;
  time: ReturnType<typeof createTimeHook>;
  combat: ReturnType<typeof createCombatHook> & { arrows(): unknown[] };
  /** M4 §6.1 */
  craft: Omit<ReturnType<typeof createCraftHook>, 'click'> & ReturnType<typeof createCraftUiHook>['craft'];
  furnace: ReturnType<typeof createFurnaceHook>;
  armor: ReturnType<typeof createArmorHook>;
  tool: ReturnType<typeof createToolHook>['tool'];
  yokai: ReturnType<typeof createYokaiHook>['yokai'];
}

declare global {
  interface Window {
    __rikkun?: TestHook;
  }
}

export type TestHookGroups = Pick<TestHook, 'world' | 'player' | 'camera' | 'input' | 'lock' | 'settings' | 'target' | 'dig' | 'inventory' | 'save' | 'time' | 'combat' | 'yokai' | 'craft' | 'furnace' | 'armor' | 'tool'>;

export function installTestHook(game: Game, overlay: PerfOverlay, groups: TestHookGroups): void {
  window.__rikkun = {
    ready: true,
    tick: () => game.tick,
    pause: () => {
      game.paused = true;
    },
    resume: () => {
      game.paused = false;
    },
    step: (count = 1) => game.step(count),
    renderStats: () => game.getRenderStats(),
    perfOverlayVisible: () => overlay.visible,
    ...groups,
  };
}
