import type { YokaiKind } from '../contracts';

/**
 * 妖怪の 種類の えらび方（COUNTRY-1 §3.3）。国の行（種類 → 重み）× 全体の倍率で 1 つ えらぶ。
 * 順番は 昔から この 4 つ（乱数の 並びを きめる）。表に ない 種類は 重み 0。
 */
export const YOKAI_ORDER: readonly YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];

export type YokaiRow = Partial<Record<YokaiKind, number>>;
export type YokaiScale = Record<string, number | null | undefined>;

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
  for (const k of YOKAI_ORDER) t += weightOf(row, scale, k);
  return t;
}

/** 行 × 倍率の 合計が 0 なら ものさしの行（fallback）を つかう。呼ぶがわが 使う */
export function effectiveRow(row: YokaiRow, scale: YokaiScale, fallback: YokaiRow): YokaiRow {
  return rowTotal(row, scale) > 0 ? row : fallback;
}

/**
 * 種類を 1 つ えらぶ。r は 0 以上 1 未満。ぬりかべ が 上限に いる（nurikabeFull）ときは ぬりかべ を 0 として のこりで えらぶ。
 * 合計が 0 なら null。
 */
export function pickYokaiKind(row: YokaiRow, scale: YokaiScale, nurikabeFull: boolean, r: number): YokaiKind | null {
  const w: number[] = [];
  let total = 0;
  for (const k of YOKAI_ORDER) {
    const v = k === 'nurikabe' && nurikabeFull ? 0 : weightOf(row, scale, k);
    w.push(v);
    total += v;
  }
  if (!(total > 0)) return null;
  let x = r * total;
  let last: YokaiKind | null = null;
  for (let i = 0; i < YOKAI_ORDER.length; i++) {
    if (w[i]! <= 0) continue;
    last = YOKAI_ORDER[i]!;
    if (x < w[i]!) return last;
    x -= w[i]!;
  }
  return last;
}
