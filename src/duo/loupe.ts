import { DUO_TUNING } from './tuning';
import type { DuoTier } from './types';

/**
 * COOP-1 作業 2（#399）: ルーペの 置き場所と 太さ（§3.1・§9.3）。テストは loupe.test.ts。
 *
 * ---- つなぎ目の 約束 ----
 *   loupeLayout({ width, height, dirX, dirY, tier })
 *     dirX・dirY = 画面の まん中から 見た 2P の 方向（px の 向き: 右が +x・下が +y。長さは 問わない。(0,0) のときは 右）。
 *     返す x・y = ルーペの 中心（画面の 左上から の px）・d = 直径（height の 20%）・borderPx = わくの 太さ（tier 0/1/2 で 4/6/8）。
 *     ルーペ全体（わくも ふくむ）は 画面の ふちから 16px 内側、下は height の 78% まで（下の 22% = ホットバー）、上は height の 12% から（上の 12% = メーター）。
 *     方向は 守る: dirX > 0 なら 中心は 画面の 右半分、dirY < 0（上）なら 上半分 など。
 *   `duo.state().loupe` は この x・y・d と 同じ 値（出ていない ときは null）。DOM は data-testid="duo-loupe"。
 */
export interface LoupeLayoutInput {
  width: number;
  height: number;
  dirX: number;
  dirY: number;
  tier: DuoTier;
}

export interface LoupeBox {
  x: number;
  y: number;
  d: number;
  borderPx: number;
}

export function loupeLayout(input: LoupeLayoutInput): LoupeBox {
  const { width, height, tier } = input;
  let { dirX, dirY } = input;
  if (dirX === 0 && dirY === 0) dirX = 1;
  const d = height * DUO_TUNING.loupeDiameterRatio;
  const r = d / 2;
  // 置いて よい 中心の 長方形（ふちから 16px・上 12%・下 22% を あける）
  const left = DUO_TUNING.loupeEdgePx + r;
  const right = width - DUO_TUNING.loupeEdgePx - r;
  const top = height * DUO_TUNING.loupeTopRatio + r;
  const bottom = height * DUO_TUNING.loupeBottomRatio - r;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const halfW = Math.max(0, (right - left) / 2);
  const halfH = Math.max(0, (bottom - top) / 2);
  // 長方形の まん中から 2P の 方向へ 伸ばし、長方形の ふちで 止める
  const tx = dirX === 0 ? Infinity : halfW / Math.abs(dirX);
  const ty = dirY === 0 ? Infinity : halfH / Math.abs(dirY);
  const t = Math.min(tx, ty);
  return { x: midX + dirX * t, y: midY + dirY * t, d, borderPx: DUO_TUNING.loupeBorderPx[tier] };
}
