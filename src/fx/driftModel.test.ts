import { describe, expect, it } from 'vitest';
import { SEA_Y } from '../contracts';
import { DRIFT, driftCount, driftDensity, driftNearScale, driftTint } from './driftModel';

const FAR = 100; // 国の境目から 遠い（e が 大きい）
const HIGH = SEA_Y + 60;

describe('driftDensity（国・高さ・頭の上 → 出す 割合）', () => {
  it('ゆきやまは 雪だけ・もみじやまは 葉だけ・ほかの 国は 何も 出ない', () => {
    expect(driftDensity('yuki', FAR, HIGH, false)).toMatchObject({ leaf: 0 });
    expect(driftDensity('yuki', FAR, HIGH, false).snow).toBeGreaterThan(0);
    expect(driftDensity('momiji', FAR, HIGH, false)).toMatchObject({ snow: 0 });
    expect(driftDensity('momiji', FAR, HIGH, false).leaf).toBeGreaterThan(0);
    expect(driftDensity('harappa', FAR, HIGH, false)).toEqual({ snow: 0, leaf: 0 });
  });
  it('雪は 雪の線より 上ほど 多い。葉は 雪より 少ない（上限の 数が 少ない）', () => {
    const low = driftDensity('yuki', FAR, SEA_Y + 5, false).snow;
    const high = driftDensity('yuki', FAR, HIGH, false).snow;
    expect(high).toBeGreaterThan(low);
    expect(high).toBe(1);
    expect(DRIFT.maxLeaf).toBeLessThan(DRIFT.maxSnow);
  });
  it('境目では なめらかに 減る（e が 0 で 0、へんかは 単調）', () => {
    let prev = -1;
    for (let e = 0; e <= DRIFT.edgeBlend; e += 1) {
      const d = driftDensity('yuki', e, HIGH, false).snow;
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(driftDensity('yuki', 0, HIGH, false).snow).toBe(0);
  });
  it('頭の上が ふさがって いると 大きく 減る', () => {
    const open = driftDensity('momiji', FAR, HIGH, false).leaf;
    const roof = driftDensity('momiji', FAR, HIGH, true).leaf;
    expect(roof).toBeLessThanOrEqual(open * 0.2);
  });
  it('driftCount は 上限を こえない', () => {
    expect(driftCount(1, DRIFT.maxSnow)).toBe(DRIFT.maxSnow);
    expect(driftCount(0.5, 300)).toBe(150);
    expect(driftCount(2, 120)).toBe(120);
  });
  it('夜は 色が 暗く（約 0.4 倍）、昼は そのまま', () => {
    expect(driftTint(1)).toBe(1);
    expect(driftTint(0.25)).toBeCloseTo(0.4);
    expect(driftTint(0.6)).toBeGreaterThan(0.4);
  });
  it('カメラの すぐ前の つぶは 見えない・遠くは そのまま', () => {
    expect(driftNearScale(1)).toBe(0);
    expect(driftNearScale(DRIFT.nearFull)).toBe(1);
    expect(driftNearScale(2)).toBeGreaterThan(0);
    expect(driftNearScale(2)).toBeLessThan(1);
  });
});
