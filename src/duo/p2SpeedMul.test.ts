import { describe, expect, it } from 'vitest';
import { legendMoveMulOf } from '../legend/defs';
import { itemByCharge, S } from './p2LegendKit';
import { p2SpeedMul } from './p2Legend';

/** COOP-1 4d-2: 2P も 風神剣を 持つと 走る 速さが 上がる（1P の step.ts と 同じ legendMoveMulOf）。ほかの 武器・素手は 1 倍 */
describe('p2SpeedMul', () => {
  const fujin = itemByCharge('spiral');
  const raijin = itemByCharge('lightning');
  it('風神剣を 持つと 表の 倍率（1 より 大きい）が かかる', () => {
    const mul = legendMoveMulOf(S, fujin);
    expect(mul).toBeGreaterThan(1);
    expect(p2SpeedMul(1, 1, S, fujin)).toBeCloseTo(mul);
  });
  it('パリィ・わざの 倍率と かけ合わさる', () => {
    expect(p2SpeedMul(0.5, 0.8, S, fujin)).toBeCloseTo(0.4 * legendMoveMulOf(S, fujin));
  });
  it('雷神剣・素手は 倍率 1 のまま', () => {
    expect(p2SpeedMul(1, 1, S, raijin)).toBe(legendMoveMulOf(S, raijin));
    expect(p2SpeedMul(1, 1, S, null)).toBe(1);
  });
});
