import { describe, expect, it } from 'vitest';
import { halfOf, viewRects } from './viewRects';

/**
 * COOP-1 5f-1（docs/design/COOP-1.md 1.16 §8 5f の つなぎ目の 約束・§3.7 (g)）: 半分の 矩形を 引く 口。実装の 前に 書いた 赤の テスト。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `src/duo/viewRects.ts` に `halfOf(rects: ViewRects, who: 1 | 2): Rect | null` を 足す（純関数。新しい 物を 作らず rects の 中の 矩形を そのまま 返す）。
 *     who 1 → rects.main（1 人の 全面でも 左右の 左半分でも）、who 2 → rects.second（2P が いなければ null）。
 *   5f の 部品（ui/duoAimHud.ts の 置き場所）は これで その 人の 半分を 引く。
 */
describe('halfOf', () => {
  const SIZES: [number, number][] = [
    [1024, 700],
    [1280, 800],
    [1440, 900],
  ];
  for (const [w, h] of SIZES) {
    it(`${w}×${h}: 左右の とき 1P＝ 左半分・2P＝ 右半分（まん中の 線で ぴったり わかれる）`, () => {
      const r = viewRects('split', 'split', 1, w, h);
      const a = halfOf(r, 1)!;
      const b = halfOf(r, 2)!;
      expect(a).toBe(r.main);
      expect(b).toBe(r.second);
      expect(a.x).toBe(0);
      expect(a.x + a.w).toBe(b.x);
      expect(b.x + b.w).toBe(w);
      expect(a.h).toBe(h);
      expect(b.h).toBe(h);
    });
    it(`${w}×${h}: 1 人の ときは 1P＝ 全面・2P＝ null`, () => {
      const r = viewRects('one', 'one', 1, w, h);
      expect(halfOf(r, 1)).toEqual({ x: 0, y: 0, w, h });
      expect(halfOf(r, 2)).toBeNull();
    });
  }
});
