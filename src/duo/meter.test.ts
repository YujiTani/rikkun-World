import { describe, expect, it } from 'vitest';
import * as meter from './meter';
import { distanceMeter } from './meter';

/**
 * COOP-1 作業 1（#395）の 先行テスト。AC13（ユニットの 半分）。
 * 作業 3e（#422。1.8）: 色の 段（`nextTier`。旧 AC20）を 消した。メーターの 色は 白 1 色（--rk-text）で 距離で かわらない（色は UI 検査 = e2e/helpers/duoUi.ts）。
 * つなぎ目の 約束: src/duo/meter.ts は `distanceMeter(distance)` だけを 出す（`nextTier` を なくす）。
 * 数（48）は 仕様 §9.4 の 値（DUO_TUNING.meterFullTiles）。
 */

describe('AC13: 距離メーターの 長さ', () => {
  it('距離 0 で 0、48 で 1、それより 遠くても 1', () => {
    expect(distanceMeter(0)).toBe(0);
    expect(distanceMeter(48)).toBe(1);
    expect(distanceMeter(60)).toBe(1);
    expect(distanceMeter(1000)).toBe(1);
  });
  it('距離に 比例（24 マスで 真ん中 0.5）', () => {
    expect(distanceMeter(24)).toBeCloseTo(0.5, 6);
    expect(distanceMeter(12)).toBeCloseTo(0.25, 6);
    expect(distanceMeter(36)).toBeCloseTo(0.75, 6);
  });
  it('負の 距離は 0', () => {
    expect(distanceMeter(-3)).toBe(0);
  });
});

describe('1.8: 色の 段は ない', () => {
  it('meter.ts に nextTier は ない（メーターの 色は 距離で かわらない）', () => {
    expect(Object.keys(meter)).not.toContain('nextTier');
  });
});
