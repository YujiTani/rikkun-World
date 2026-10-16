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
import type { createBladeHook } from '../tools/blade/hook';
import type { createLevelHook } from '../level';
import type { createAchievementsHook } from '../achievements';
import type { createLogHook } from '../ui/log';
import type { UiAlpha } from '../contracts';
import type { createStorageHook } from '../storage/hook';
import type { createYokaiHook } from '../yokai';
import type { createFarmHook } from '../farm';
import type { WorldHook } from '../world/hook';
import type { ChunkStats } from '../world/render/WorldRenderer';
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
  /** M5: 距離で描くチャンクの数 */
  render: { chunks(): ChunkStats };
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
  /** WEAPON-2 §6.1: 刀・弓 */
  blade: ReturnType<typeof createBladeHook>['blade'];
  bow: ReturnType<typeof createToolHook>['bow'];
  /** M4 追加: 経験値とレベル */
  level: ReturnType<typeof createLevelHook>;
  yokai: ReturnType<typeof createYokaiHook>['yokai'];
  /** M6 §6.1: 実績・おめでとう画面 */
  achievements: ReturnType<typeof createAchievementsHook> & { modal(): unknown; close(): unknown; sounds(): string[]; mute(on: boolean): void };
  /** FIX-action-hint: 照準の下に出している 絵（アイテム名）と 1 語 */
  hud: { /** ふちどりを付けている妖怪の id（なければ null） */ yokaiFocus(): number | null; /** ふちどりの複製の数 */ yokaiFocusHulls(): number; /** 妖怪の体力のバー（BALANCE.md §4.7）。いない id は null */ hpBar(yokaiId: number): { visible: boolean; bars: number; left: number; color: 'white' | 'yellow' | 'red'; icon: 'oyabun' | 'taisho' | 'nushi' | null } | null; actionHint(): { right?: { icon: string; word: string }; left?: { icon: string; word: string } } };
  /** M6 §6.1: たんす */
  storage: ReturnType<typeof createStorageHook>;
  /** M7 §6.1: 農業 */
  farm: ReturnType<typeof createFarmHook>;
  /** CRAFT-2 §6.1: ログとできごと */
  log: ReturnType<typeof createLogHook>['log'];
  /** CRAFT-2 §6.1: 画面の不透明度 */
  ui: { alpha(): UiAlpha };
}

declare global {
  interface Window {
    __rikkun?: TestHook;
  }
}

export type TestHookGroups = Pick<TestHook, 'world' | 'render' | 'player' | 'camera' | 'input' | 'lock' | 'settings' | 'target' | 'dig' | 'inventory' | 'save' | 'time' | 'combat' | 'yokai' | 'craft' | 'furnace' | 'armor' | 'tool' | 'blade' | 'bow' | 'level' | 'achievements' | 'storage' | 'hud' | 'farm' | 'log' | 'ui'>;

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
