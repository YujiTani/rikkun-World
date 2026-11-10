import type { DuoView } from './types';

/**
 * COOP-1 作業 3e（#422。1.8）: 画面の ようす（1 人の 全面・左右分割）ごとの 描く 範囲(CSS px。左上が 0,0)。DOM・Three.js なし。
 * 大きい 画面 main(1P) と 2 つ目 second(2P)。切りかえの とちゅうは from → to を progress(0〜1)で 行き来する（§2.4）。
 *   one → split   まん中の 線から 右半分が ひらく（main は 左半分へ ちぢむ）。split → one は 逆。
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ViewRects {
  main: Rect;
  /** 2P の 区画。無い（まだ 大きさが 0）ときは null */
  second: Rect | null;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);

function setRect(o: Rect, x: number, y: number, w: number, h: number): Rect {
  o.x = x;
  o.y = y;
  o.w = w;
  o.h = h;
  return o;
}

function lerpInto(o: Rect, a: Rect, b: Rect, t: number): Rect {
  return setRect(o, lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.w, b.w, t), lerp(a.h, b.h, t));
}

/** 毎ステップ 呼んでも 新しい 物を 作らない ための 入れもの（viewRects の out） */
export interface ViewRectsScratch {
  out: ViewRects;
  main: Rect;
  second: Rect;
  a: { main: Rect; second: Rect };
  b: { main: Rect; second: Rect };
}

export function newViewRectsScratch(): ViewRectsScratch {
  const r = (): Rect => ({ x: 0, y: 0, w: 0, h: 0 });
  const main = r();
  const second = r();
  return { out: { main, second: null }, main, second, a: { main: r(), second: r() }, b: { main: r(), second: r() } };
}

/**
 * COOP-1 5f-1: その人の 半分（1P＝ main、2P＝ second）。1 人の 全面なら 1P＝ 全面・2P＝ null。新しい 物は 作らず rects の 中の 矩形を そのまま 返す。
 * 5f の 部品（ui/duoAimHud.ts）は これで その 人の 半分を 引く。
 */
export function halfOf(rects: ViewRects, who: 1 | 2): Rect | null {
  return who === 1 ? rects.main : rects.second;
}

/** ようす view の 落ちついた 範囲。1 人の 全面の 2P の 区画は まん中の 線の 上の 大きさ 0 */
function settled(into: { main: Rect; second: Rect }, view: DuoView, w: number, h: number): void {
  const half = Math.floor(w / 2);
  if (view === 'one') {
    setRect(into.main, 0, 0, w, h);
    setRect(into.second, half, 0, 0, h);
  } else {
    setRect(into.main, 0, 0, half, h);
    setRect(into.second, half, 0, w - half, h);
  }
}

/**
 * from → to を progress(0〜1。1 = おわり)で 行き来した 範囲。
 * scratch を 渡すと 新しい 物を 作らない（返す 値は scratch.out。次の 呼び出しまで 有効）。無いときは そのつど 作る。
 */
export function viewRects(from: DuoView, to: DuoView, progress: number, w: number, h: number, scratch: ViewRectsScratch = newViewRectsScratch()): ViewRects {
  const o = scratch.out;
  settled(scratch.b, to, w, h);
  if (from === to || progress >= 1) {
    setRect(scratch.main, scratch.b.main.x, scratch.b.main.y, scratch.b.main.w, scratch.b.main.h);
    setRect(scratch.second, scratch.b.second.x, scratch.b.second.y, scratch.b.second.w, scratch.b.second.h);
    o.main = scratch.main;
    o.second = scratch.second.w > 0 && scratch.second.h > 0 ? scratch.second : null;
    return o;
  }
  settled(scratch.a, from, w, h);
  const t = ease(Math.max(0, progress));
  o.main = lerpInto(scratch.main, scratch.a.main, scratch.b.main, t);
  lerpInto(scratch.second, scratch.a.second, scratch.b.second, t);
  o.second = scratch.second.w >= 2 && scratch.second.h >= 2 ? scratch.second : null;
  return o;
}

/**
 * 分割・HUD・矢印を 決める 画面の 大きさ（CSS px）。
 * キャンバスの style は resize の ハンドラ(renderer.setSize)で あとから かわるので、そこは 読まない。
 * 入れ物(container)の 今の 大きさ → 0 なら 窓の 大きさ。
 */
export function liveViewSize(
  box: { clientWidth: number; clientHeight: number } | null,
  win: { innerWidth: number; innerHeight: number },
  out: { w: number; h: number } = { w: 0, h: 0 },
): { w: number; h: number } {
  const ok = box !== null && box.clientWidth > 0 && box.clientHeight > 0;
  out.w = ok ? box.clientWidth : win.innerWidth;
  out.h = ok ? box.clientHeight : win.innerHeight;
  return out;
}
