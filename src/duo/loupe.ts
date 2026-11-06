import type { DuoTier } from './types';

/**
 * COOP-1 作業 2（#399）: ルーペの 置き場所と 太さ（§3.1・§9.3）。宣言だけ（実装は developer）。テストは loupe.test.ts。
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

export function loupeLayout(_input: LoupeLayoutInput): LoupeBox {
  throw new Error('COOP-1 作業 2: loupeLayout は まだ 実装されていない');
}
