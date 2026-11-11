/**
 * 小ブロックの面のつぎ目（T 字）に空の色が 1 画素で透けるのをふさぐ（#147）。
 *
 * 面の位置は小ブロックの整数で、となりの面とぴったり重なる。透けるのは、長い面の辺の途中に
 * 短い面の角が乗るとき、画面の塗りが 1 画素ずれるため。ずらす量は距離で変わるので、
 * 世界の長さを固定すると、近い所はふさがり、洞くつの壁や水のふち（数ブロック〜十数ブロック）では残る。
 * 片面を、その場所の画面で SEAM_PX 画素だけ面の中の外へ出す（両側で 1 画素重なる）。
 * ななめ・遠い所で隣のマスまではみ出さないよう、小ブロック数に上限を付ける。
 */

/** 片面を外へ出す量（画面の画素）。両側で 1 画素重なる。1 にすると近くの内かどの暗がりがずれる */
export const SEAM_PX = 0.5;
/** ひろげの上限（小ブロック）。1 小ブロックの 3/4 まで */
export const SEAM_CLAMP = 0.75;

/**
 * ある向きへ 1 小ブロック動かすと画面で `pixelsPerMicro` 画素になるとき、
 * その向きに足す小ブロック数。0 に近い（真横から見ている）ときは上限で止める。
 */
export function seamGrowLocal(pixelsPerMicro: number): number {
  if (!(pixelsPerMicro > 0.001)) return SEAM_CLAMP;
  return Math.min(SEAM_CLAMP, SEAM_PX / pixelsPerMicro);
}

/** 両側が同じだけ出たときの重なり（画素）。1 以上なら、1 画素の透けをふさぐ */
export function seamOverlapPx(pixelsPerMicro: number): number {
  return 2 * seamGrowLocal(pixelsPerMicro) * Math.max(0, pixelsPerMicro);
}

/**
 * 頂点シェーダーに埋める関数。seamGrowLocal と同じ式（画面の画素 → 小ブロック）。
 * `position`・`projectionMatrix`・`modelViewMatrix`・`uViewport` を読む。
 */
export function seamAxisGlsl(): string {
  const px = SEAM_PX.toFixed(1);
  const clamp = SEAM_CLAMP.toFixed(2);
  return `float seamAxis(vec3 stepDir, vec2 ndc0) {
  vec4 c1 = projectionMatrix * modelViewMatrix * vec4(position + stepDir, 1.0);
  vec2 d = c1.xy / c1.w - ndc0;
  vec2 pxN = vec2(2.0 / max(uViewport.x, 1.0), 2.0 / max(uViewport.y, 1.0));
  float pix = length(d / pxN);
  return pix > 0.001 ? min(${clamp}, ${px} / pix) : ${clamp};
}`;
}
