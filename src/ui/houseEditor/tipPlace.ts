// HOUSE-2A（#364）名前の ヘルプの 置き場所。仕様 §2.3・§3.2（カーソルの 近く・マウスに ついて うごく・画面の ふちで 止める）。DOM なし。
// ゲームの 共通の ツールチップ（ui/tooltip.ts の placeNear）と 同じ 考え（右下に ずらす → 入らなければ 左・上）。
// ちがい ＝ 画面の ふちで 止める あきが 4 では なく エディターの ふち（16・24・32）。

/** ずらし 幅（px）。dx・dy ＝ カーソルから 右下へ（カーソルの 先を かくさない。dy 32 ＝ ばしょの ボタン〔高さ 72・80〕の 字の すぐ 下に ふきだしの 字が 来て、となりの ボタンの 字に 重ならない 高さ）、flip ＝ 左・上へ 出す ときの カーソルとの すきま */
export const TIP_PLACE = { dx: 18, dy: 32, flip: 12 } as const;

/** カーソル (mx, my) の 近くに 大きさ w×h の ふきだしを 置く 左上（画面 vw×vh。edge ＝ 画面の ふちの あき） */
export function tipPlace(mx: number, my: number, w: number, h: number, vw: number, vh: number, edge: number): { x: number; y: number } {
  let x = mx + TIP_PLACE.dx;
  let y = my + TIP_PLACE.dy;
  if (x + w > vw - edge) x = mx - w - TIP_PLACE.flip;
  if (y + h > vh - edge) y = my - h - TIP_PLACE.flip;
  x = Math.min(Math.max(edge, x), Math.max(edge, vw - w - edge));
  y = Math.min(Math.max(edge, y), Math.max(edge, vh - h - edge));
  return { x, y };
}
