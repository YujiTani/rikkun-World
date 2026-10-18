import type { W2Settings } from '../contracts';

/**
 * 妖怪の よろけ（WEAPON-5 §4.5）。何ステップ のこっているかと、「次の 1 回の ダメージが 2 倍」が まだ のこっているか。
 * 動かない・攻撃しない などは YokaiManager が この記録を見て 決める。
 */
export interface StaggerInfo {
  ticksLeft: number;
  /** 2 倍が まだ のこっている */
  double: boolean;
}

export type StaggerBy = 'parry' | 'reflect';

export interface StaggerBook {
  /** よろける（のこりを 90 に もどす。2 倍は 1 回分だけ。使っていたら また 1 回分） */
  stagger(id: number, by: StaggerBy): void;
  get(id: number): StaggerInfo | null;
  /** 1 ステップ（のこりを へらす。0 で おわり） */
  step(): void;
  /** 次の 1 回の ダメージを 2 倍にして（0.01 の位に まるめる）返す。よろけていない・もう使った ときは そのまま */
  damage(id: number, amount: number): number;
  /** その 妖怪は 2 倍に して 当たる か（見るだけ） */
  hasDouble(id: number): boolean;
  remove(id: number): void;
  clear(): void;
  ids(): number[];
}

export function createStaggerBook(S: Pick<W2Settings, 'staggerTicks' | 'staggerDamageMul'>): StaggerBook {
  const map = new Map<number, { ticksLeft: number; double: boolean }>();
  return {
    stagger(id) {
      map.set(id, { ticksLeft: S.staggerTicks, double: true });
    },
    get(id) {
      const e = map.get(id);
      return e ? { ticksLeft: e.ticksLeft, double: e.double } : null;
    },
    step() {
      for (const [id, e] of map) {
        e.ticksLeft--;
        if (e.ticksLeft <= 0) map.delete(id);
      }
    },
    damage(id, amount) {
      const e = map.get(id);
      if (!e || !e.double) return amount;
      e.double = false;
      return Math.round(amount * S.staggerDamageMul * 100 + 1e-7) / 100;
    },
    hasDouble(id) {
      return map.get(id)?.double === true;
    },
    remove(id) {
      map.delete(id);
    },
    clear() {
      map.clear();
    },
    ids() {
      return [...map.keys()];
    },
  };
}
