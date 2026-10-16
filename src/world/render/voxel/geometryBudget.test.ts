import { describe, expect, it } from 'vitest';
import { BUDGET_RELEASE, pickEvictions, type BudgetEntry } from './geometryBudget';

const E = (key: number, bytes: number, dist: number): BudgetEntry => ({ key, bytes, dist });

describe('ジオメトリの上限（遠い順に捨てる。VOX-E）', () => {
  it('上限いかなら 何も捨てない', () => {
    expect(pickEvictions([E(1, 50, 10), E(2, 50, 20)], 100, 100)).toEqual([]);
  });

  it('こえたら 遠い順に、上限の 90% になるまで捨てる', () => {
    const es = [E(1, 40, 10), E(2, 40, 30), E(3, 40, 20), E(4, 40, 50)];
    // 合計 160、上限 100 → 90 になるまで: 距離 50 (key 4) → 120、距離 30 (key 2) → 80
    expect(pickEvictions(es, 160, 100)).toEqual([4, 2]);
    expect(BUDGET_RELEASE).toBe(0.9);
  });

  it('同じ距離なら key の小さい順。バイト 0 のものは 捨てない', () => {
    const es = [E(9, 10, 5), E(3, 10, 5), E(7, 0, 99)];
    expect(pickEvictions(es, 120, 100)).toEqual([3, 9]);
  });

  it('全部捨てても足りなくても 持っているものだけ', () => {
    expect(pickEvictions([E(1, 10, 1)], 1000, 100)).toEqual([1]);
  });
});
