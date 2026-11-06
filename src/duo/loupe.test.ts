import { describe, expect, it } from 'vitest';
import { loupeLayout } from './loupe';
import { DUO_TUNING as T } from './tuning';
import type { DuoTier } from './types';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。AC24（ユニットの 半分: 置き場所・直径・わくの 太さ）。
 * つなぎ目の 約束: src/duo/loupe.ts の `loupeLayout`（宣言と 約束は loupe.ts の 先頭）。数（20%・16px・22%・12%・4/6/8）は §3.1・§9.3。
 */

const SIZES = [
  { width: 1024, height: 700 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
];
const DIRS: Array<[number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [3, 1], [-2, -5],
];
const TIERS: DuoTier[] = [0, 1, 2];

describe('AC24: ルーペの 置き場所', () => {
  for (const { width, height } of SIZES) {
    for (const tier of TIERS) {
      it(`${width}×${height} tier ${tier}: 直径 20%・ふちから 16px 内側・下 22%/上 12% に かからない（8 方向 +）`, () => {
        for (const [dirX, dirY] of DIRS) {
          const b = loupeLayout({ width, height, dirX, dirY, tier });
          expect(b.d).toBeCloseTo(height * T.loupeDiameterRatio, 3);
          const r = b.d / 2;
          expect(b.x - r, `${dirX},${dirY} 左`).toBeGreaterThanOrEqual(16 - 0.01);
          expect(b.x + r, `${dirX},${dirY} 右`).toBeLessThanOrEqual(width - T.loupeEdgePx + 0.01);
          expect(b.y - r, `${dirX},${dirY} 上`).toBeGreaterThanOrEqual(height * T.loupeTopRatio - 0.01);
          expect(b.y + r, `${dirX},${dirY} 下`).toBeLessThanOrEqual(height * T.loupeBottomRatio + 0.01);
        }
      });
    }
  }

  it('方向を 守る: 右なら 右半分・左なら 左半分・上なら 上半分・下なら 下半分', () => {
    const w = 1280;
    const h = 800;
    const right = loupeLayout({ width: w, height: h, dirX: 1, dirY: 0, tier: 0 });
    const left = loupeLayout({ width: w, height: h, dirX: -1, dirY: 0, tier: 0 });
    const up = loupeLayout({ width: w, height: h, dirX: 0, dirY: -1, tier: 0 });
    const down = loupeLayout({ width: w, height: h, dirX: 0, dirY: 1, tier: 0 });
    expect(right.x).toBeGreaterThan(w / 2);
    expect(left.x).toBeLessThan(w / 2);
    expect(up.y).toBeLessThan(h / 2);
    expect(down.y).toBeGreaterThan(h / 2);
    // まっすぐ 横は まん中の 高さ(上下の 禁止帯の まん中)
    expect(Math.abs(right.y - h * 0.45)).toBeLessThan(h * 0.2);
    // はしに 寄る(右は 右のはし、16px 内側)
    expect(right.x + right.d / 2).toBeCloseTo(w - T.loupeEdgePx, 0);
    expect(left.x - left.d / 2).toBeCloseTo(T.loupeEdgePx, 0);
  });

  it('わくの 太さは 段で 4・6・8px', () => {
    const at = (tier: DuoTier) => loupeLayout({ width: 1280, height: 800, dirX: 1, dirY: 0, tier }).borderPx;
    expect([at(0), at(1), at(2)]).toEqual([...T.loupeBorderPx]);
  });

  it('向きが すこし かわると 位置も すこし かわる(とびはねない)', () => {
    const a = loupeLayout({ width: 1280, height: 800, dirX: 10, dirY: 1, tier: 0 });
    const b = loupeLayout({ width: 1280, height: 800, dirX: 10, dirY: 1.5, tier: 0 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(40);
  });
});
