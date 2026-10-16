/**
 * 近さの段（VOX-E。docs/design/VOX-plan.md §5）。three にも world にも依らない純粋関数。
 * - micro: 小ブロック（greedyShape＋3D テクスチャ） / box: 1 マスの箱＋9×9 の模様 / lod: 列ごと 1 枚の LOD。
 * - 段は列（16×16）ごとに、プレイヤーから そのいちばん近い点までの水平の距離で決める。
 * - 境目は ±2 ずらす（チラつき防止）: いまの段を出るのは 境目+2、入るのは 境目−2。
 */
export type Tier = 'micro' | 'box' | 'lod';

/** F3 の設定で選べる小ブロックの半径 */
export const MICRO_RADII = [16, 24, 32] as const;
export const DEFAULT_MICRO_R = 32;
/** 箱の外側（これより遠くは LOD） */
export const BOX_OUTER = 48;
/** 段の境目のずらし */
export const TIER_HYSTERESIS = 2;

/** 許される半径に直す（知らない数は 近い許される値へ） */
export function normalizeMicroR(r: number): number {
  let best: number = MICRO_RADII[MICRO_RADII.length - 1];
  let bd = Infinity;
  for (const v of MICRO_RADII) {
    const d = Math.abs(v - r);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

/**
 * 次の段。prev = いまの段（まだ決まっていなければ null: ずらさずに境目そのもので決める）。
 * 小ブロックの中にいるあいだは r+2 まで、外から入るのは r−2 まで。箱も 48 の前後で同じ。
 */
export function nextTier(dist: number, prev: Tier | null, r: number): Tier {
  const h = prev === null ? 0 : TIER_HYSTERESIS;
  const inMicro = prev === 'micro' ? dist <= r + h : dist <= r - h;
  if (inMicro) return 'micro';
  // 小ブロックだった列は 箱の内がわにいたので、箱を出るのも 48+2 まで
  const inBox = prev === 'box' || prev === 'micro' ? dist <= BOX_OUTER + h : dist <= BOX_OUTER - h;
  return inBox ? 'box' : 'lod';
}

/** 列 (cx, cz)（16×16）の いちばん近い点までの水平の距離 */
export function columnDistance(cx: number, cz: number, px: number, pz: number): number {
  const x0 = cx * 16;
  const z0 = cz * 16;
  const dx = Math.max(x0 - px, 0, px - (x0 + 16));
  const dz = Math.max(z0 - pz, 0, pz - (z0 + 16));
  return Math.hypot(dx, dz);
}
