import type { BladeStance, BladeSystem } from '../../contracts';
import type { TrailSnapshot } from '../../fx/bladeTrail';

/** 軌跡が まだ ない（体・カメラを もらっていない）ときの 窓口の 答え */
const NO_TRAIL: TrailSnapshot = {
  visible: false,
  item: null,
  tech: null,
  points: [],
  tail: null,
  head: null,
  columns: [],
  strips: [],
  segments: 0,
  triangles: 0,
  objects: 0,
  color: 0,
  glow: 0,
  stars: [],
};

/** `window.__rikkun.blade`（WEAPON-2 §6.1、CHAR-4 §8）の 中身。つなぎ込みが testHook に 足す。`trail` = 刃の軌跡の ようす */
export function createBladeHook(blade: BladeSystem, trail?: () => TrailSnapshot | null) {
  return {
    blade: {
      state: () => blade.state(),
      setStance: (s: BladeStance) => blade.setStance(s),
      shape: () => blade.shape(),
      /** まだ 読まれていない 出来事（読んでも 空に ならない） */
      events: () => blade.peekEvents(),
      /** CHAR-4: 刃の軌跡（見える 部分・点・区切り・星。毎回 新しい 入れ物） */
      trail: (): TrailSnapshot => trail?.() ?? NO_TRAIL,
    },
  };
}
