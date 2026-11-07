import { BLOCK_INDEX } from '../blocks/blockTypes';
import { colKey } from '../stream/ring';
import { keyX, keyY, keyZ } from './mineShaftBuild';
import type { ShaftPlan } from './mineShaftPlan';

/** 古い 列の 一覧（colKey の 集まり。仕様 §4.8） */
export interface OldCols {
  kodo: ReadonlySet<number>;
  heya: ReadonlySet<number>;
  /** 1E〔坑道の 冒険〕の 一覧。ない ときは 1E の 前の 世界ではない〔新しい 世界〕 */
  boken?: ReadonlySet<number>;
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

/** 計画の 置く 物を 列ごとに 分ける */
export function buildOps(plan: ShaftPlan): Map<number, ColOps> {
  const lists = new Map<number, { ring: number[]; air: number[]; put: number[] }>();
  const slot = (k: number): { ring: number[]; air: number[]; put: number[] } => {
    const ck = colKey(keyX(k) >> 4, keyZ(k) >> 4);
    let l = lists.get(ck);
    if (!l) lists.set(ck, (l = { ring: [], air: [], put: [] }));
    return l;
  };
  const p = (k: number, block: number): number => pack(block, keyY(k), keyZ(k) & 15, keyX(k) & 15);
  for (const k of plan.b.ring) slot(k).ring.push(p(k, STONE_BLOCK));
  for (const k of plan.b.air) slot(k).air.push(p(k, AIR_BLOCK));
  for (const [k, block] of plan.b.put) slot(k).put.push(p(k, block));
  const out = new Map<number, ColOps>();
  for (const [ck, l] of lists) out.set(ck, { ring: Int32Array.from(l.ring), air: Int32Array.from(l.air), put: Int32Array.from(l.put) });
  return out;
}
