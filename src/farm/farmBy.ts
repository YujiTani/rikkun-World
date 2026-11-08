import type { FarmEvent, Vec3 } from '../contracts';

/** かかし から 横に これだけ（マス）以内、たてに 8 以内に 入ると「ふるい はたけに 来た」（実績 `visit:oldfarm`）。横は +0.5 の ゆとりを 見る */
const VISIT_RANGE = 4;
const VISIT_Y = 8;

/** (x, z) が かかし（マスの 左かど）の 近くか。1P も 2P も 同じ 式 */
export function nearKakashi(k: Vec3, p: Vec3): boolean {
  return Math.abs(p.x - (k.x + 0.5)) <= VISIT_RANGE + 0.5 && Math.abs(p.z - (k.z + 0.5)) <= VISIT_RANGE + 0.5 && Math.abs(p.y - k.y) <= VISIT_Y;
}

/**
 * 畑の 中の「だれが 起こしたか」（COOP-1 5a）。畑は 世界に 1 つで、2P の 呼び出しは `run(2, fn)` で 包む。
 * 包んでいる あいだ: 出来事に `by: 2`・合図は 畑の `lastHint` を 書かない・まいた マスは 2P の 分を 別に もつ。
 * 1 人の ときは `run` を 呼ばない ので 何も かわらない（`by` は 1P の 出来事に つかない）。
 */
export interface FarmBy {
  /** 出来事に 今の 人を つける（包んで いない とき・もう `by` が ある ときは そのまま） */
  tag(e: FarmEvent): FarmEvent;
  /** 包んで いる か（合図が `lastHint` を 書かない） */
  active(): boolean;
  run<T>(by: 2, fn: () => T): T;
  /** さいごに まいた マスを 今の 人の 分に 書く */
  setPour(cells: Vec3[]): void;
  pourCells(by?: 2): readonly Vec3[];
}

export function createFarmBy(): FarmBy {
  let cur: 2 | undefined;
  let pour1: Vec3[] = [];
  let pour2: Vec3[] = [];
  return {
    tag: (e) => (cur === undefined || e.by !== undefined ? e : { ...e, by: cur }),
    active: () => cur !== undefined,
    run(by, fn) {
      const prev = cur;
      cur = by;
      try {
        return fn();
      } finally {
        cur = prev;
      }
    },
    setPour(cells) {
      if (cur === 2) pour2 = cells;
      else pour1 = cells;
    },
    pourCells: (by) => (by === 2 ? pour2 : pour1),
  };
}
