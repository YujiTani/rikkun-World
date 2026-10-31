// HOUSE-1E ② なかの 家具の そばに 出る ボタン（［とる］［↻］［↺］）の 場所の 計算。DOM なし（ユニットテスト: clusterPlace.test.ts）。
// 仕様 docs/design/HOUSE-1.md §3.2: 家具の すぐ 上（入らなければ 下）、よこは 家具の まん中、方眼の はこ（かべの 帯 こみ）の はしで 止める＝はこの 外へ 出さない。

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export interface ClusterPlace {
  left: number;
  top: number;
  side: 'above' | 'below';
  /** しっぽの よこ位置（ボタンの わくの 左から） */
  tail: number;
}

/**
 * 方眼の はこ（W×H。左上が 0, 0）の 中の 家具の 四角（l, t, r, b。はこで 切る）から、ボタンの わく（cw×ch）の 左上を 決める。
 * gap ＝ 家具との すきま。はこより わくが 大きい ときは はこの まん中。
 */
export function clusterPlace(
  box: { w: number; h: number },
  furn: { l: number; t: number; r: number; b: number },
  size: { w: number; h: number; gap: number },
): ClusterPlace {
  const { w: W, h: H } = box;
  const { w: cw, h: ch, gap } = size;
  const l = clamp(furn.l, 0, W);
  const r = clamp(furn.r, 0, W);
  const t = clamp(furn.t, 0, H);
  const b = clamp(furn.b, 0, H);
  const aboveTop = t - gap - ch;
  const side = aboveTop >= 0 ? 'above' : 'below';
  const rawTop = side === 'above' ? aboveTop : b + gap;
  const top = H >= ch ? clamp(rawTop, 0, H - ch) : (H - ch) / 2;
  const mid = (l + r) / 2;
  const left = W >= cw ? clamp(mid - cw / 2, 0, W - cw) : (W - cw) / 2;
  return { left, top, side, tail: clamp(mid - left, 24, cw - 24) };
}
