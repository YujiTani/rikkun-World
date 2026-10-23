import { describe, expect, it } from 'vitest';
import { createLiveSettings } from '../contracts';
import { createHarapanRoll } from './harapan';

/** GOLD-1 §4.7（AC14）: はらぱん の くじ */
describe('はらぱんみみず の くじ', () => {
  it('地下 の 妖怪（y 143）は harapanYokai・地上（y 144）は 0', () => {
    const s = createLiveSettings();
    s.harapanYokai = 1;
    const r = createHarapanRoll(1, () => s);
    for (let i = 0; i < 20; i++) expect(r.yokai(143)).toBe(true);
    for (let i = 0; i < 20; i++) expect(r.yokai(144)).toBe(false);
  });
  it('harapanBlock 1: 地下 の いし → true・地上 → false', () => {
    const s = createLiveSettings();
    s.harapanBlock = 1;
    s.harapanLog = 0;
    const r = createHarapanRoll(1, () => s);
    expect(r.block('stone', 100)).toBe(true);
    expect(r.block('stone', 144)).toBe(false);
  });
  it('き は 高さ を とわず harapanLog だけ（かさならない）', () => {
    const s = createLiveSettings();
    s.harapanLog = 1;
    s.harapanBlock = 0;
    const r = createHarapanRoll(1, () => s);
    expect(r.block('log', 100)).toBe(true);
    expect(r.block('log', 200)).toBe(true);
    const t = createLiveSettings();
    t.harapanLog = 0;
    t.harapanBlock = 1;
    const q = createHarapanRoll(1, () => t);
    expect(q.block('log', 100)).toBe(false);
  });
  it('既定 の 確率 は 7% / 3% / 0.5% / 0.2%・同じ シード で 同じ 流れ', () => {
    const s = createLiveSettings();
    expect([s.harapanYokai, s.harapanChest, s.harapanBlock, s.harapanLog]).toEqual([0.07, 0.03, 0.005, 0.002]);
    const run = (seed: number) => {
      const r = createHarapanRoll(seed, () => s);
      return Array.from({ length: 300 }, () => r.yokai(10));
    };
    expect(run(3)).toEqual(run(3));
    const hits = run(3).filter(Boolean).length;
    expect(hits).toBeGreaterThan(2);
    expect(hits).toBeLessThan(60);
  });
  it('地上 の くじ は 乱数 を つかわない（流れ が ずれない）', () => {
    const s = createLiveSettings();
    s.harapanYokai = 0.5;
    const a = createHarapanRoll(9, () => s);
    const b = createHarapanRoll(9, () => s);
    for (let i = 0; i < 10; i++) a.yokai(200);
    for (let i = 0; i < 10; i++) expect(a.yokai(10)).toBe(b.yokai(10));
  });
  it('宝箱 は harapanChest', () => {
    const s = createLiveSettings();
    s.harapanChest = 1;
    expect(createHarapanRoll(1, () => s).chest()).toBe(true);
    s.harapanChest = 0;
    expect(createHarapanRoll(1, () => s).chest()).toBe(false);
  });
});
