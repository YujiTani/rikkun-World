import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { halfOf, viewRects, type Rect } from '../../duo/viewRects';
import { confettiAt } from './confettiModel';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #19・§9.13、AC177・AC178 ⑤）のユニットテスト。実装の前に書いた赤のテスト。
 * 紙ふぶき（`.cel-confetti`）は `position: fixed; left: 0` の 紙が、JS（`BannerView.paint`）で window.innerWidth の 20〜80% に 動かされる。
 * だから 層（`.cel-layer`）の 大きさを css で 半分に しても 紙は 2P の 半分にも ふる（fixed の 子は 親で 切れない）。css の 規則では 守れない ので、
 * **紙の x を 「ふらせる 区画の 矩形」から 決める 純関数**に して、2 人の とき 1P の 半分を わたす。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   新しい `src/ui/celebrate/confettiModel.ts`（DOM なし）:
 *     confettiAt(seed: { x: number; sway: number; speed: number }, t: number, view: Rect): { x: number; y: number }
 *        … 今の 式を 矩形に 一般化: x = view.x + view.w × (0.2 + 0.6 × seed.x) + sin(t × 12 × seed.speed + seed.sway) × 24
 *                                   y = view.y + (−20 + t × seed.speed × view.h × 0.8)。view = 画面ぜんたい {0, 0, 幅, 高さ} なら 今の 式と 同じ（1 人の とき かわらない）
 *   `BannerView.paint(look, info, view: Rect | null = null)`（ui/celebrate/views.ts）… view が null なら 画面ぜんたい。紙の 位置は confettiAt だけで 決める（paint の 中に 式を 書かない）
 *   `CelebrateUi.setHalf(rect: Rect | null)`（ui/celebrate/index.ts）… 2 人の とき 1P の 半分の 矩形（`halfOf(viewRects(...), 1)`）、1 人の とき null。paint に 渡す。
 *       `ui/duoHalves.ts`（参加・画面の 大きさが かわった とき）が 呼ぶ。上の 帯の 層（`.cel-layer--band`）は 切らない（かえない）。
 */

const SIZES: [number, number][] = [
  [1024, 700],
  [1280, 800],
  [1440, 900],
];
const SEEDS = Array.from({ length: 24 }, (_, i) => ({ x: i / 23, sway: (i * 0.97) % 6.28, speed: 0.7 + ((i * 7) % 13) / 13 / 1.0 * 0.6 }));
const TS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
/** 紙の はば（css の --rk-sp-2 は 16〜36px ほど）。右はしは 紙の はばぶん 見る */
const PAPER_W = 36;

describe('紙ふぶきの 位置: 区画の 矩形から 決める', () => {
  it('画面ぜんたい（1 人の とき）なら 今の 式と 同じ', () => {
    for (const [w, h] of SIZES) {
      for (const s of SEEDS) {
        for (const t of TS) {
          const p = confettiAt(s, t, { x: 0, y: 0, w, h });
          expect(p.x).toBeCloseTo(w * (0.2 + 0.6 * s.x) + Math.sin(t * 12 * s.speed + s.sway) * 24, 6);
          expect(p.y).toBeCloseTo(-20 + t * s.speed * h * 0.8, 6);
        }
      }
    }
  });

  for (const [w, h] of SIZES) {
    it(`${w}×${h}: 2 人の とき どの 紙も 1P の 半分の 中（まん中の 線を こえない）`, () => {
      const half = halfOf(viewRects('split', 'split', 1, w, h), 1)!;
      for (const s of SEEDS) {
        for (const t of TS) {
          const p = confettiAt(s, t, half);
          expect(p.x, `x ${s.x} t ${t}`).toBeGreaterThanOrEqual(half.x);
          expect(p.x + PAPER_W, `右 x ${s.x} t ${t}`).toBeLessThanOrEqual(half.x + half.w);
          expect(p.x + PAPER_W).toBeLessThan(w / 2 + 0.001);
        }
      }
    });
  }

  it('高さは 半分でも 画面と 同じ（半分は 縦ぜんぶ）。縦の 動きは かわらない', () => {
    const [w, h] = [1280, 800];
    const half = halfOf(viewRects('split', 'split', 1, w, h), 1)!;
    const s = SEEDS[5]!;
    expect(confettiAt(s, 0.5, half).y).toBeCloseTo(confettiAt(s, 0.5, { x: 0, y: 0, w, h }).y, 6);
  });

  it('2P の 半分に わたせば 2P の 半分の 中（いまの ところ 使わない。矩形に 一般化した 確かめ）', () => {
    const [w, h] = [1280, 800];
    const half: Rect = halfOf(viewRects('split', 'split', 1, w, h), 2)!;
    for (const s of SEEDS) {
      const p = confettiAt(s, 0.5, half);
      expect(p.x).toBeGreaterThanOrEqual(half.x);
      expect(p.x + PAPER_W).toBeLessThanOrEqual(half.x + half.w);
    }
  });
});

describe('配線の 見はり（ソース）', () => {
  const read = (p: string): string => readFileSync(p, 'utf8');
  it('BannerView.paint は 画面の はばで 紙を 動かさず confettiAt を 使い、view を うけとる', () => {
    const s = read('src/ui/celebrate/views.ts');
    expect(s).toMatch(/\bconfettiAt\(/);
    expect(s).toMatch(/paint\([^)]*view:\s*Rect\s*\|\s*null/);
    expect(s).not.toMatch(/w \* \(0\.2 \+ 0\.6/);
  });
  it('CelebrateUi.setHalf が 紙の 区画を 受け、duoHalves.ts が 1P の 半分を わたす', () => {
    expect(read('src/ui/celebrate/index.ts')).toMatch(/setHalf\(\s*\w+:\s*Rect\s*\|\s*null\s*\)/);
    expect(read('src/ui/duoHalves.ts')).toMatch(/\.setHalf\(/);
  });
});
