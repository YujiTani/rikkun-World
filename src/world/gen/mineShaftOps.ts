import { BLOCK_INDEX } from '../blocks/blockTypes';
import { colKey } from '../stream/ring';
import { keyX, keyY, keyZ } from './mineShaftBuild';
import { SHAFT_CONFIG as S } from './mineShaftConfig';
import type { ShaftPlan } from './mineShaftPlan';

/** 古い 列の 一覧（colKey の 集まり。仕様 §4.8） */
export interface OldCols {
  kodo: ReadonlySet<number>;
  heya: ReadonlySet<number>;
  /** 1E〔坑道の 冒険〕の 一覧。ない ときは 1E の 前の 世界ではない〔新しい 世界〕 */
  boken?: ReadonlySet<number>;
  /** 1F〔ようかいの やかた〕の 一覧。やかたの 版より 前に 保存した 列。ない ときは やかたの 前の 世界ではない〔新しい 世界〕 */
  yakata?: ReadonlySet<number>;
}

/** 列に 置く 物。ring → air → put の 順に 1 マスずつ 置く */
export interface ColOps {
  /** かならず 固く する マス（もとが 固く なければ 石） */
  ring: Int32Array;
  air: Int32Array;
  put: Int32Array;
}

/** パック: block | y << 8 | lz << 17 | lx << 21 */
const pack = (block: number, y: number, lz: number, lx: number): number => block | (y << 8) | (lz << 17) | (lx << 21);

const AIR_BLOCK = BLOCK_INDEX.air;
const STONE_BLOCK = BLOCK_INDEX.stone;

/**
 * 計画の 置く 物を 列ごとに 分ける〔`S.plan.opsChunk` マス ごとに yield する。先読みが 時間で 止まれる ように。
 * 結果は 一度に 分けた ときと 同じ〕
 */
export function* buildOpsSteps(plan: ShaftPlan): Generator<void, Map<number, ColOps>> {
  const lists = new Map<number, { ring: number[]; air: number[]; put: number[] }>();
  const slot = (k: number): { ring: number[]; air: number[]; put: number[] } => {
    const ck = colKey(keyX(k) >> 4, keyZ(k) >> 4);
    let l = lists.get(ck);
    if (!l) lists.set(ck, (l = { ring: [], air: [], put: [] }));
    return l;
  };
  const p = (k: number, block: number): number => pack(block, keyY(k), keyZ(k) & 15, keyX(k) & 15);
  const chunk = S.plan.opsChunk;
  let n = 0;
  for (const k of plan.b.ring) {
    slot(k).ring.push(p(k, STONE_BLOCK));
    if (++n >= chunk) {
      n = 0;
      yield;
    }
  }
  for (const k of plan.b.air) {
    slot(k).air.push(p(k, AIR_BLOCK));
    if (++n >= chunk) {
      n = 0;
      yield;
    }
  }
  for (const [k, block] of plan.b.put) {
    slot(k).put.push(p(k, block));
    if (++n >= chunk) {
      n = 0;
      yield;
    }
  }
  const out = new Map<number, ColOps>();
  for (const [ck, l] of lists) {
    out.set(ck, { ring: Int32Array.from(l.ring), air: Int32Array.from(l.air), put: Int32Array.from(l.put) });
    n += l.ring.length + l.air.length + l.put.length;
    if (n >= chunk) {
      n = 0;
      yield;
    }
  }
  return out;
}

/** 計画の 置く 物を 列ごとに 分ける〔いっきに〕 */
export function buildOps(plan: ShaftPlan): Map<number, ColOps> {
  const g = buildOpsSteps(plan);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
