import type { DuoView } from './types';

/**
 * COOP-1 作業 2（#399）: 画面の ようす（1 画面・ルーペ・分割）ごとの 描く 範囲(CSS px。左上が 0,0)。DOM・Three.js なし。
 * 大きい 画面 main(1P) と 2 つ目 second(2P)。切りかえの とちゅうは from → to を progress(0〜1)で 行き来する（§2.4）。
 *   one → loupe     丸が 小さく 出て ふくらむ（second が 0 から 大きくなる）
 *   one → split     まん中の 線から 右半分が ひらく（main は 左半分へ ちぢむ）
 *   loupe → split   ルーペが ふくらんで 右半分に なる
 *   戻る ときは 逆
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
  /** ルーペ（丸）の ままか。分割が からむ 切りかえの とちゅうは 四角のまま ふくらむ */
  circle: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const ease = (t: number): number => t * t * (3 - 2 * t);

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

/** ようす view の 落ちついた 範囲。loupe = ルーペの 外接の 四角 */
function settled(view: DuoView, w: number, h: number, loupe: Rect | null, forSplit: boolean): { main: Rect; second: Rect } {
  const half = Math.floor(w / 2);
  switch (view) {
    case 'one':
      // 2P の 区画は ない: 切りかえの 相手に あわせて 出どころを 決める（線の 上 / ルーペの まん中）
      if (forSplit || loupe === null) return { main: { x: 0, y: 0, w, h }, second: { x: half, y: 0, w: 0, h } };
      return { main: { x: 0, y: 0, w, h }, second: { x: loupe.x + loupe.w / 2, y: loupe.y + loupe.h / 2, w: 0, h: 0 } };
    case 'loupe':
      return { main: { x: 0, y: 0, w, h }, second: loupe ?? { x: w - 16, y: h / 2, w: 0, h: 0 } };
    case 'split':
      return { main: { x: 0, y: 0, w: half, h }, second: { x: half, y: 0, w: w - half, h } };
  }
}

/** from → to を progress(0〜1。1 = おわり)で 行き来した 範囲 */
export function viewRects(from: DuoView, to: DuoView, progress: number, w: number, h: number, loupe: Rect | null): ViewRects {
  const forSplit = from === 'split' || to === 'split';
  const b = settled(to, w, h, loupe, forSplit);
  if (from === to || progress >= 1) return { main: b.main, second: b.second.w > 0 && b.second.h > 0 ? b.second : null, circle: to === 'loupe' };
  const a = settled(from, w, h, loupe, forSplit);
  const t = ease(Math.max(0, progress));
  const main = lerpRect(a.main, b.main, t);
  const second = lerpRect(a.second, b.second, t);
  const circle = !forSplit;
  return { main, second: second.w >= 2 && second.h >= 2 ? second : null, circle };
}
