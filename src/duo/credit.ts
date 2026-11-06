import type { YokaiKind, YokaiWorld } from '../contracts';
import type { LevelSystem } from '../level/LevelSystem';

export interface CreditDeps {
  level1: LevelSystem;
  level2: LevelSystem;
  /** 実績は 世界で 1 つ。どちらの 人の たおしでも 1 回 呼ぶ */
  feedDefeat(who: 1 | 2, kind: YokaiKind): void;
}

/** さいごの 1 発を 当てた人の けいけんちに だけ 入れる。実績は 2 人で 1 つ */
export function creditDefeat(d: CreditDeps, who: 1 | 2, kind: YokaiKind, xp: number): void {
  (who === 2 ? d.level2 : d.level1).onDefeat(kind, xp);
  d.feedDefeat(who, kind);
}

/** 実績の「レベル」に 渡す 数: 2 人の 大きい方（2P が いなければ 1P） */
export function sharedLevel(level1: number, level2: number | null): number {
  return level2 === null ? level1 : Math.max(level1, level2);
}

/** damage に だれが 当てたかを つける（ほかの 口は そのまま とおす） */
export function bindWho(y: YokaiWorld, who: 1 | 2): YokaiWorld {
  return {
    list: () => y.list(),
    raycast: (o, d, max) => y.raycast(o, d, max),
    damage: (id, amount, from, knock, by) => y.damage(id, amount, from, knock, by, who),
    occupies: (x, yy, z) => y.occupies(x, yy, z),
    pull: y.pull ? (id, x, z, dist) => y.pull?.(id, x, z, dist) : undefined,
    drainEvents: () => y.drainEvents(),
  };
}
