import type { AchievementSystem } from './AchievementSystem';
import type { AchievementsPageModel } from './pageModel';

/**
 * `window.__rikkun.achievements` のうち C の分（M6 §6.1）。
 * `modal`・`close`・`sounds` は B が足す。`tab` は `onTab` で もちもの画面のタブも切りかえる。
 */
export function createAchievementsHook(
  sys: AchievementSystem,
  page: AchievementsPageModel,
  host: { inventoryOpen(): boolean; onTab(tab: 'items' | 'achievements' | 'log'): void },
) {
  return {
    list: () => sys.list(),
    stats: () => sys.stats(),
    record: (key: string, n = 1) => sys.record(key, n),
    events: () => sys.events(),
    pending: () => sys.pendingIds(),
    flush: () => {
      sys.flush();
    },
    reset: () => sys.reset(),
    markViewed: (ids: string[]) => sys.markViewed(ids as never),
    ui: () => page.ui(host.inventoryOpen()),
    tab: (name: 'items' | 'achievements' | 'log') => {
      page.setTab(name);
      host.onTab(name);
      page.sync(host.inventoryOpen());
    },
    category: (name: string) => {
      page.setCategory(name);
      page.sync(host.inventoryOpen());
    },
  };
}
