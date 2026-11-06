import { describe, expect, it } from 'vitest';
import { liveViewSize, viewRects } from './viewRects';

/**
 * COOP-1 作業 3e（#422。docs/design/COOP-1.md 1.8 §2.3・§2.4）の 先行テスト（赤）。ようす（1 人の 全面・左右分割）ごとの 描く 範囲。
 *
 * ---- 実装への 約束（src/duo/viewRects.ts）----
 *   viewRects(from: DuoView, to: DuoView, progress: number, w: number, h: number, scratch?: ViewRectsScratch): ViewRects
 *     ルーペの 引数（loupe: Rect | null。6 番目だった）を なくす。scratch は 6 番目に つめる。
 *     ViewRects = { main: Rect; second: Rect | null }   `circle` を なくす。
 *     one → split: まん中の 線から 右半分が ひらく（main は 左半分へ ちぢむ）。split → one は 逆。
 *   liveViewSize は そのまま。
 */

describe('viewRects（切りかえの 範囲）', () => {
  it('落ちついた: 1 人の 全面は 全面だけ、分割は 左右の 半分。円（circle）の 印は ない', () => {
    const one = viewRects('one', 'one', 1, 1280, 800);
    expect(one).toEqual({ main: { x: 0, y: 0, w: 1280, h: 800 }, second: null });
    expect(one).not.toHaveProperty('circle');
    const s = viewRects('split', 'split', 1, 1280, 800);
    expect(s.main).toEqual({ x: 0, y: 0, w: 640, h: 800 });
    expect(s.second).toEqual({ x: 640, y: 0, w: 640, h: 800 });
    expect(s).not.toHaveProperty('circle');
  });
  it('1024×700・1440×900・はばが 奇数でも 左右で 画面を ちょうど 分ける', () => {
    for (const [w, h] of [[1024, 700], [1440, 900], [1281, 800]] as const) {
      const s = viewRects('split', 'split', 1, w, h);
      expect(s.main.x).toBe(0);
      expect(s.main.w + s.second!.w).toBe(w);
      expect(s.second!.x).toBe(s.main.w);
      expect(s.main.h).toBe(h);
      expect(s.second!.h).toBe(h);
      expect(Math.abs(s.main.w - s.second!.w)).toBeLessThanOrEqual(1);
    }
  });
  it('1 画面 → 分割: まん中の 線から 右半分が ひらく（はじめは 2P の 区画なし）', () => {
    const start = viewRects('one', 'split', 0, 1280, 800);
    expect(start.second).toBeNull();
    const mid = viewRects('one', 'split', 0.5, 1280, 800);
    expect(mid.second!.x).toBeCloseTo(640, 0);
    expect(mid.second!.w).toBeGreaterThan(0);
    expect(mid.second!.w).toBeLessThan(640);
    expect(mid.main.w).toBeGreaterThan(640);
    expect(mid.main.w).toBeLessThan(1280);
  });
  it('分割 → 1 画面: 逆（右半分が まん中の 線へ ちぢんで 消える）', () => {
    const mid = viewRects('split', 'one', 0.5, 1280, 800);
    expect(mid.second === null || mid.second.w < 640).toBe(true);
    expect(mid.main.w).toBeGreaterThan(640);
    const end = viewRects('split', 'one', 1, 1280, 800);
    expect(end).toEqual({ main: { x: 0, y: 0, w: 1280, h: 800 }, second: null });
  });
});

describe('liveViewSize（resize を 待たない 画面の 大きさ）', () => {
  it('古い キャンバスの 大きさ(1280×800)に ひきずられず、入れ物の 今の 大きさ(1440×900)を 返す', () => {
    const staleCanvas = { clientWidth: 1280, clientHeight: 800 };
    const container = { clientWidth: 1440, clientHeight: 900 };
    const win = { innerWidth: 1440, innerHeight: 900 };
    expect(staleCanvas.clientWidth).not.toBe(win.innerWidth);
    expect(liveViewSize(container, win)).toEqual({ w: 1440, h: 900 });
  });
  it('入れ物が 0 か ないときは 窓の 大きさ', () => {
    const win = { innerWidth: 1440, innerHeight: 900 };
    expect(liveViewSize({ clientWidth: 0, clientHeight: 0 }, win)).toEqual({ w: 1440, h: 900 });
    expect(liveViewSize(null, win)).toEqual({ w: 1440, h: 900 });
  });
});
