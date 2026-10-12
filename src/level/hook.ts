import type { LevelSystem } from './LevelSystem';

/** `window.__rikkun.level`（M4 追加） */
export function createLevelHook(level: LevelSystem) {
  return {
    /** { level, xp, next } */
    get: () => level.get(),
    /** 経験値を足す（レベルアップならハート全回復・演出も出る） */
    add: (n: number) => level.addXp(n),
    /** レベルと経験値を決める（演出なし） */
    set: (lv: number, xp = 0) => level.set(lv, xp),
    events: () => level.takeHookEvents(),
  };
}
