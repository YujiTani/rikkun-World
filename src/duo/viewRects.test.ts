import { describe, expect, it } from 'vitest';
import { liveViewSize, viewRects } from './viewRects';

const LOUPE = { x: 1000, y: 300, w: 160, h: 160 };

describe('viewRects（切りかえの 範囲）', () => {
  it('落ちついた: 1 画面は 全面だけ、ルーペは 全面＋丸、分割は 左右の 半分', () => {
    expect(viewRects('one', 'one', 1, 1280, 800, null)).toEqual({ main: { x: 0, y: 0, w: 1280, h: 800 }, second: null, circle: false });
    const l = viewRects('loupe', 'loupe', 1, 1280, 800, LOUPE);
    expect(l.second).toEqual(LOUPE);
    expect(l.circle).toBe(true);
    const s = viewRects('split', 'split', 1, 1280, 800, null);
    expect(s.main).toEqual({ x: 0, y: 0, w: 640, h: 800 });
    expect(s.second).toEqual({ x: 640, y: 0, w: 640, h: 800 });
    expect(s.circle).toBe(false);
  });
  it('ルーペ → 分割: ふくらんで 右半分に なる（とちゅうは 四角）', () => {
    const mid = viewRects('loupe', 'split', 0.5, 1280, 800, LOUPE);
    expect(mid.circle).toBe(false);
    expect(mid.second!.w).toBeGreaterThan(160);
    expect(mid.second!.w).toBeLessThan(640);
    expect(mid.main.w).toBeGreaterThan(640);
    expect(mid.main.w).toBeLessThan(1280);
  });
  it('1 画面 → 分割: まん中の 線から 右半分が ひらく', () => {
    const start = viewRects('one', 'split', 0, 1280, 800, null);
    expect(start.second).toBeNull();
    const mid = viewRects('one', 'split', 0.5, 1280, 800, null);
    expect(mid.second!.x).toBeCloseTo(640, 0);
    expect(mid.second!.w).toBeGreaterThan(0);
  });
  it('1 画面 → ルーペ: 丸が 小さい ところから ふくらむ', () => {
    const early = viewRects('one', 'loupe', 0.3, 1280, 800, LOUPE);
    const late = viewRects('one', 'loupe', 0.9, 1280, 800, LOUPE);
    expect(early.circle).toBe(true);
    expect(early.second === null || early.second.w < late.second!.w).toBe(true);
    expect(late.second!.w).toBeLessThanOrEqual(160);
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
