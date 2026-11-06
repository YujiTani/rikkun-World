import { describe, expect, it } from 'vitest';
import { distanceMeter, nextTier } from './meter';
import type { DuoTier } from './types';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC13（ユニットの 半分）。AC20（色の 段の 上り下り）も 同じ 関数なので ここで 見る。
 * つなぎ目の 約束: src/duo/meter.ts の `distanceMeter(distance)` と `nextTier(prev, distance)`（宣言は meter.ts）。
 * 数（48・24・16・20・17・13）は 仕様 §9.2・§9.4 の 値を そのまま 書く（仕様が 変わったら ここも 直す）。
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

/** 距離を 順に 渡して 段の 並びを 返す */
const walk = (start: DuoTier, ds: number[]): DuoTier[] => {
  const out: DuoTier[] = [];
  let t = start;
  for (const d of ds) {
    t = nextTier(t, d);
    out.push(t);
  }
  return out;
};

describe('AC13・AC20: 色の 段（上がる 16・20 以上 / 下がる 17・13 以下）', () => {
  it('離れていく: 15 → 16 で 1 段目、19 → 20 で 2 段目', () => {
    expect(nextTier(0, 15)).toBe(0);
    expect(nextTier(0, 16)).toBe(1);
    expect(nextTier(1, 19)).toBe(1);
    expect(nextTier(1, 20)).toBe(2);
  });
  it('一気に 遠く へ: 0 から 25 で 2 段目', () => {
    expect(nextTier(0, 25)).toBe(2);
  });
  it('近づく: 2 段目は 17 以下で 1 段目、1 段目は 13 以下で ふつう', () => {
    expect(nextTier(2, 18)).toBe(2);
    expect(nextTier(2, 17)).toBe(1);
    expect(nextTier(1, 14)).toBe(1);
    expect(nextTier(1, 13)).toBe(0);
  });
  it('幅（ゆれ止め）: 16 と 17 を 行き来しても 1 段目のまま 変わらない', () => {
    expect(walk(1, [16.5, 15.5, 16.5, 14, 16.2])).toEqual([1, 1, 1, 1, 1]);
  });
  it('ふつう → 1 段目 → 2 段目 → 1 段目 → ふつう（じゅんばんに ひとつずつ）', () => {
    expect(walk(0, [10, 16, 20, 19, 17, 15, 13])).toEqual([0, 1, 2, 2, 1, 1, 0]);
  });
});
