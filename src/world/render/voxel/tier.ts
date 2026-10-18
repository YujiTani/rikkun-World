/**
 * 近さの段（VOX-E。docs/design/VOX-plan.md §5）。three にも world にも依らない純粋関数。
 * - micro: 小ブロック（greedyShape＋3D テクスチャ） / box: 1 マスの箱＋9×9 の模様 / lod: 列ごと 1 枚の LOD。
 * - 段は列（16×16）ごとに、プレイヤーから そのいちばん近い点までの水平の距離で決める。
 * - 境目は ±2 ずらす（チラつき防止）: いまの段を出るのは 境目+2、入るのは 境目−2。
 */
import { DEFAULT_CAMERA_CONFIG } from '../../../camera/config';

export type Tier = 'micro' | 'box' | 'lod';

/** F3 の設定で選べる小ブロックの半径 */
export const MICRO_RADII = [16, 24, 32] as const;
export const DEFAULT_MICRO_R = 32;
/** 箱の外側（これより遠くは LOD） */
export const BOX_OUTER = 48;
/** カメラが プレイヤーのうしろに いる距離。段の中心は プレイヤーなので、小ブロックの半径はこのぶん小さくする */
export const MICRO_BACK = DEFAULT_CAMERA_CONFIG.thirdPersonDistance;
/** 段の境目のずらし */
export const TIER_HYSTERESIS = 2;

/**
 * 小ブロックの段に使う半径（プレイヤーからの距離）。設定の半径 r（F4・microR）から MICRO_BACK を引く。
 * 前に見える小ブロックの範囲が、カメラ中心だったときと同じになる。0 は 0 のまま。
 */
export function microTierRadius(r: number): number {
  return r > 0 ? Math.max(0, r - MICRO_BACK) : 0;
}

/**
 * 許される半径に直す（知らない数は 近い許される値へ）。0 は 0 のまま = 小ブロックなし（近くも箱の段。#180）。
 * F4 の切りかえ（MICRO_RADII）には 0 を入れない: 0 は 見た目を見ないテスト（E2E のサーバー）だけの値。
 */
export function normalizeMicroR(r: number): number {
  if (r === 0) return 0;
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
 * はじめの小ブロックの半径（main.ts が `location.search` と `import.meta.env.VITE_MICRO_DEFAULT` を渡す。#180）。
 * 決める順: URL の `?microR=0|16|24|32`（許されない数は normalizeMicroR で近い値に直す）
 *   > 環境変数 `off` なら 0（E2E のサーバー。小ブロックの細かいメッシュを作らない）> なし・ほかの値なら DEFAULT_MICRO_R。
 * 空・数でない・負の `?microR` は 無いのと同じ。
 */
export function decideMicroR(search: string, envDefault: string | undefined): number {
  const raw = new URLSearchParams(search).get('microR');
  if (raw !== null && raw.trim() !== '') {
    const q = Number(raw);
    if (Number.isFinite(q) && q >= 0) return normalizeMicroR(q);
  }
  return envDefault === 'off' ? 0 : DEFAULT_MICRO_R;
}

/**
 * 次の段。prev = いまの段（まだ決まっていなければ null: ずらさずに境目そのもので決める）。
 * 小ブロックの中にいるあいだは r+2 まで、外から入るのは r−2 まで。箱も 48 の前後で同じ。
 * r = 0 は 小ブロックなし: micro を返さない（近くも箱）。
 */
export function nextTier(dist: number, prev: Tier | null, r: number): Tier {
  const h = prev === null ? 0 : TIER_HYSTERESIS;
  const inMicro = r > 0 && (prev === 'micro' ? dist <= r + h : dist <= r - h);
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
