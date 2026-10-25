import type { YokaiKind } from '../contracts';
import { KIND_TRAITS } from './traits';

/**
 * 妖怪の 種類の えらび方（COUNTRY-1 §3.3）。国の行（種類 → 重み）× 全体の倍率で 1 つ えらぶ。
 * 順番は 昔から この 4 つ（乱数の 並びを きめる。見本ページの並びの yokai/index.ts の YOKAI_ORDER とは別もの）。表に ない 種類は 重み 0。
 * 新しい 妖怪は ここにも 手で 足す（足し忘れると 一度も 出ない）。全種類が 1 回ずつ 入っているかは content/yokai/registry.test.ts が 見張る。
 */
export const YOKAI_DRAW_ORDER = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'] as const satisfies readonly YokaiKind[];

export type YokaiRow = Partial<Record<YokaiKind, number>>;
export type YokaiScale = Partial<Record<YokaiKind, number | null>>;

/** 倍率: 0 か null は 出さない。書いて いない 種類は 1 倍 */
function scaleOf(scale: YokaiScale, k: YokaiKind): number {
  const v = scale[k];
  if (v === undefined) return 1;
  return v === null ? 0 : Math.max(0, v);
}

/** 行 × 倍率（その 種類の 重み。0 以上） */
export function weightOf(row: YokaiRow, scale: YokaiScale, k: YokaiKind): number {
  return Math.max(0, row[k] ?? 0) * scaleOf(scale, k);
}

export function rowTotal(row: YokaiRow, scale: YokaiScale): number {
  let t = 0;
  for (const k of YOKAI_DRAW_ORDER) t += weightOf(row, scale, k);
  return t;
}

/** 行 × 倍率の 合計が 0 なら ものさしの行（fallback）を つかう。呼ぶがわが 使う */
export function effectiveRow(row: YokaiRow, scale: YokaiScale, fallback: YokaiRow): YokaiRow {
  return rowTotal(row, scale) > 0 ? row : fallback;
}

/**
 * 種類を 1 つ えらぶ。r は 0 以上 1 未満。数に上限がある妖怪（traits.limitedCount = ぬりかべ）が 上限に いる（limitedFull）ときは その妖怪を 0 として のこりで えらぶ。
 * 合計が 0 なら null。
 */
export function pickYokaiKind(row: YokaiRow, scale: YokaiScale, limitedFull: boolean, r: number): YokaiKind | null {
  const w: number[] = [];
  let total = 0;
  for (const k of YOKAI_DRAW_ORDER) {
    const v = KIND_TRAITS[k].limitedCount && limitedFull ? 0 : weightOf(row, scale, k);
    w.push(v);
    total += v;
  }
  if (!(total > 0)) return null;
  let x = r * total;
  let last: YokaiKind | null = null;
  for (let i = 0; i < YOKAI_DRAW_ORDER.length; i++) {
    if (w[i]! <= 0) continue;
    last = YOKAI_DRAW_ORDER[i]!;
    if (x < w[i]!) return last;
    x -= w[i]!;
  }
  return last;
}
