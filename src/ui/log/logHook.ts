import type { LogCategory } from '../../contracts';
import type { LogSystem } from './LogSystem';

/**
 * テストの窓口 `log.*`（CRAFT-2 §6.1）。つなぎ込みが `window.__rikkun.log` に入れる。
 * `achievements.tab('log')` と `input.press('openLog')` は つなぎ込みの担当。
 */
export function createLogHook(log: LogSystem) {
  return {
    log: {
      live: () => log.live(),
      history: () => log.history(),
      clear: () => log.clear(),
      ui: () => log.ui(),
      open: () => log.open(),
      scroll: (dir: number) => log.scroll(dir < 0 ? -1 : 1),
      icon: (category: string) => log.icon(category as LogCategory),
    },
  };
}
