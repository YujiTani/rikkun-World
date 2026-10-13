import type { BladeStance, BladeSystem } from '../../contracts';

/** `window.__rikkun.blade`（WEAPON-2 §6.1）の 中身。つなぎ込みが testHook に 足す */
export function createBladeHook(blade: BladeSystem) {
  return {
    blade: {
      state: () => blade.state(),
      setStance: (s: BladeStance) => blade.setStance(s),
      shape: () => blade.shape(),
      /** まだ 読まれていない 出来事（読んでも 空に ならない） */
      events: () => blade.peekEvents(),
    },
  };
}
