import { describe, expect, it } from 'vitest';
import { aimBox, bodySize } from './size';
import { meatEligible } from './meat';

describe('AC18 体の 大きさ', () => {
  it('ひよこ 0.35×0.3×0.3・大人 0.8×0.6×0.6', () => {
    expect(bodySize('chick', 'normal')).toEqual({ h: 0.35, w: 0.3, l: 0.3 });
    expect(bodySize('adult', 'normal')).toEqual({ h: 0.8, w: 0.6, l: 0.6 });
  });
  it('マッチョは 1.15 倍（大人も ひよこも）', () => {
    const n = bodySize('adult', 'normal');
    const m = bodySize('adult', 'macho');
    expect(Math.abs(m.h - n.h * 1.15)).toBeLessThan(0.03);
    const cn = bodySize('chick', 'normal');
    const cm = bodySize('chick', 'macho');
    expect(Math.abs(cm.h - cn.h * 1.15)).toBeLessThan(0.03);
    expect(cm.w).toBeCloseTo(0.345, 3);
  });
  it('ひよこの ねらう 箱は 0.7×0.7×0.6（体より かなり 大きい）', () => {
    const b = aimBox('chick', 'normal');
    expect(b.hw * 2).toBeCloseTo(0.7, 6);
    expect(b.h).toBe(0.6);
    expect(aimBox('chick', 'macho')).toEqual(b);
    expect(b.hw * 2).toBeGreaterThan(bodySize('chick', 'macho').w * 1.5);
  });
});

describe('AC22 お肉に えらべる子（LIVE-3 へ）', () => {
  it('home あり・adult・raised だけ', () => {
    expect(meatEligible({ stage: 'adult', home: 1, raised: true })).toBe(true);
    // (b) 野原の なかまを 小屋に 入れた 大人
    expect(meatEligible({ stage: 'adult', home: 1, raised: false })).toBe(false);
    // (c) ひよこ
    expect(meatEligible({ stage: 'chick', home: 1, raised: false })).toBe(false);
    // (a) を 外に 出した
    expect(meatEligible({ stage: 'adult', home: null, raised: true })).toBe(false);
  });
});
