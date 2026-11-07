import { describe, expect, it } from 'vitest';
import { SHIVER, ShiverAnim, shiverFrame } from './dollShiver';

/** MINE-1E 仕様 §3.8: かびた パンを たべて ぶるっ。A「ぶるっ」24 コマ・B「いやいや」26 コマ（60 コマ = 1 秒）。 */
describe('ぶるっ（かびた パン）の 動き', () => {
  it('区間は A 6/12/6・B 8/12/6 コマ', () => {
    expect(SHIVER.A.squash + SHIVER.A.shake + SHIVER.A.back).toBe(24);
    expect(SHIVER.B.squash + SHIVER.B.shake + SHIVER.B.back).toBe(26);
    expect([SHIVER.A.squash, SHIVER.A.shake, SHIVER.A.back]).toEqual([6, 12, 6]);
    expect([SHIVER.B.squash, SHIVER.B.shake, SHIVER.B.back]).toEqual([8, 12, 6]);
  });

  it('つぶしは たて −5%・よこ +3%、回る はばは ±3 度', () => {
    expect(SHIVER.squashY).toBeCloseTo(0.95, 5);
    expect(SHIVER.squashX).toBeCloseTo(1.03, 5);
    expect(SHIVER.rollDeg).toBe(3);
  });

  for (const v of ['A', 'B'] as const) {
    const total = SHIVER[v].squash + SHIVER[v].shake + SHIVER[v].back;
    it(`${v}: 0 コマと おわりは もとの 大きさ・2 コマ目で つぶしの 半分`, () => {
      expect(shiverFrame(v, 0)).toEqual({ sx: 1, sy: 1, rollDeg: 0 });
      const end = shiverFrame(v, total);
      expect(end.sx).toBeCloseTo(1, 5);
      expect(end.sy).toBeCloseTo(1, 5);
      expect(end.rollDeg).toBeCloseTo(0, 5);
      const two = shiverFrame(v, 2);
      expect(1 - two.sy).toBeCloseTo((1 - SHIVER.squashY) * 0.5, 5);
      expect(two.sx - 1).toBeCloseTo((SHIVER.squashX - 1) * 0.5, 5);
    });
    it(`${v}: ふるえの 間は つぶれたまま 左右 ±3 度、体積は ほぼ そのまま`, () => {
      const s = SHIVER[v].squash;
      let max = 0;
      for (let f = s; f <= s + SHIVER[v].shake; f++) {
        const p = shiverFrame(v, f);
        expect(p.sy).toBeCloseTo(SHIVER.squashY, 5);
        max = Math.max(max, Math.abs(p.rollDeg));
        expect(Math.abs(p.rollDeg)).toBeLessThanOrEqual(3 + 1e-9);
      }
      expect(max).toBeGreaterThan(2.5);
      // 体積: sx * sx * sy ≒ 1（よこ 2 方向 × たて）
      expect(SHIVER.squashX * SHIVER.squashX * SHIVER.squashY).toBeCloseTo(1, 1);
    });
    it(`${v}: 左右に ふれる 回数は ${v === 'A' ? 3 : 2} 回`, () => {
      const s = SHIVER[v].squash;
      let peaks = 0;
      for (let f = s + 1; f < s + SHIVER[v].shake; f++) {
        const a = shiverFrame(v, f - 1).rollDeg;
        const b = shiverFrame(v, f).rollDeg;
        const c = shiverFrame(v, f + 1).rollDeg;
        if (b > a && b >= c && b > 1) peaks++;
      }
      expect(peaks).toBe(v === 'A' ? 3 : 2);
    });
  }
});

describe('ShiverAnim', () => {
  it('start で A → B → A と こうごに。時間（秒）で すすみ、おわると とまる', () => {
    const a = new ShiverAnim();
    expect(a.active()).toBe(false);
    a.start();
    expect(a.variant()).toBe('A');
    expect(a.active()).toBe(true);
    a.advance(24 / 60 + 0.001);
    expect(a.active()).toBe(false);
    a.start();
    expect(a.variant()).toBe('B');
    a.advance(25 / 60);
    expect(a.active()).toBe(true);
    a.advance(2 / 60);
    expect(a.active()).toBe(false);
    a.start();
    expect(a.variant()).toBe('A');
  });

  it('歩きだしたら やめて よい（cancel で すぐ もとの 形）', () => {
    const a = new ShiverAnim();
    a.start();
    a.advance(10 / 60);
    a.cancel();
    expect(a.active()).toBe(false);
    expect(a.pose()).toEqual({ sx: 1, sy: 1, rollDeg: 0 });
  });
});
