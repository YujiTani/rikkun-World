import type { ColOps } from './mineShaftOps';
import type { ShaftPlan } from './mineShaftPlan';

/** 区画の 計画 ＋ 列ごとの 置く 物〔まだ 作って いなければ null〕 */
export interface Planned {
  plan: ShaftPlan;
  ops: Map<number, ColOps> | null;
}
