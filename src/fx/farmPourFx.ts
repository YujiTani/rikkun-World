import type { FarmEvent, Vec3 } from '../contracts';

/**
 * COOP-1 5a: 農業の 出来事の 列に ある `pour` 1 つ 1 つに つき、その 人の まいた マスで しぶきを 1 回ずつ 出す
 * （`by: 2` なら 2P の マス、`by` が なければ 1P の マス。同じ ステップに 2 人が まいたら 2 人分）。
 */
export function feedPourFx(
  events: readonly FarmEvent[],
  farm: { lastPourCells(by?: 2): readonly Vec3[] },
  waterFx: { pour(cells: readonly Vec3[]): void },
): void {
  for (const e of events) if (e.type === 'pour') waterFx.pour(e.by === 2 ? farm.lastPourCells(2) : farm.lastPourCells());
}
