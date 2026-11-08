import { describe, expect, it } from 'vitest';
import type { FarmEvent, Vec3 } from '../contracts';
import { feedPourFx } from './farmPourFx';

/**
 * COOP-1 5a（docs/design/COOP-1.md 1.14 §10「同じ ステップに 2 人が じょうろで 水を まいた」・AC120）の 先行テスト（赤）。
 * 2 人分の しぶき: 農業の 出来事の 列に ある `pour` 1 つ 1 つに つき、その 人の まいた マスで `waterFx.pour` を 1 回ずつ 呼ぶ。
 *
 * ---- 実装への 約束（名前・形）----
 *   src/fx/farmPourFx.ts   `feedPourFx(events: readonly FarmEvent[], farm: { lastPourCells(by?: 2): readonly Vec3[] }, waterFx: { pour(cells: readonly Vec3[]): void }): void`
 *     … `pour` の 出来事ごとに、`by: 2` なら `farm.lastPourCells(2)`、`by` が なければ `farm.lastPourCells()` を `waterFx.pour` へ（列の じゅんで 1 回ずつ）。ほかの 出来事は 何も しない。
 *     game/step.ts の 今の `if (e.type === 'pour') waterFx.pour(farm.lastPourCells())` を これに 替える（bucketPlace の しずく・音は step.ts に のこす）。
 */

const A: Vec3 = { x: 1, y: 7, z: 2 };
const B: Vec3 = { x: 1, y: 7, z: 4 };
const pour = (by?: 2): FarmEvent => ({ type: 'pour', tick: 1, x: 0, y: 0, z: 0, item: 'watering_can', tiles: 1, ...(by ? { by } : {}) });

function rig() {
  const calls: Array<readonly Vec3[]> = [];
  const farm = { lastPourCells: (by?: 2): readonly Vec3[] => (by === 2 ? [B] : [A]) };
  return { calls, farm, fx: { pour: (cells: readonly Vec3[]) => void calls.push(cells) } };
}

describe('AC120: 2P の しぶきは 2P の まいた マスに 出る', () => {
  it('1P の pour は 1P の マス・2P の pour は 2P の マス（同じ ステップに 2 人 → 2 人分 1 回ずつ）', () => {
    const r = rig();
    feedPourFx([pour(), pour(2)], r.farm, r.fx);
    expect(r.calls).toEqual([[A], [B]]);
  });

  it('2P だけ・1P だけ', () => {
    const r = rig();
    feedPourFx([pour(2)], r.farm, r.fx);
    expect(r.calls).toEqual([[B]]);
    const q = rig();
    feedPourFx([pour()], q.farm, q.fx);
    expect(q.calls).toEqual([[A]]);
  });

  it('pour 以外の 出来事では しぶきを 出さない', () => {
    const r = rig();
    feedPourFx([{ type: 'till', tick: 1, x: 0, y: 0, z: 0 }, { type: 'bucketPlace', tick: 1, x: 0, y: 0, z: 0, liquid: 'water' }], r.farm, r.fx);
    expect(r.calls).toEqual([]);
  });
});
