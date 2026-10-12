import type { Game, RenderStats } from '../game/Game';
import type { PerfOverlay } from './perfOverlay';

/**
 * 自動テスト（テストチーム・性能チーム）からゲームを操作するための窓口。
 * window.__rikkun でアクセスする。遊ぶ人には見えない。
 */
export interface TestHook {
  ready: boolean;
  tick(): number;
  pause(): void;
  resume(): void;
  step(count?: number): void;
  renderStats(): RenderStats;
  perfOverlayVisible(): boolean;
}

declare global {
  interface Window {
    __rikkun?: TestHook;
  }
}

export function installTestHook(game: Game, overlay: PerfOverlay): void {
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
  };
}
