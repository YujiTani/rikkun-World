import { yokaiVariantColors } from '../content/yokai/registry';
import type { YokaiKind } from '../contracts';

/**
 * 妖怪の色ちがい 3 段階の 色の表（DESIGN 13.1、BALANCE §2.4）。
 * `YOKAI_VARIANT_COLORS[妖怪][段階 2 | 3] = { もとの色: 新しい色 }`。段階 1 = 今の色（表に無い）。
 * 表にない色（顔・した・はだ・かみ・げた・ちょうちんの え）は 3 段階とも 今のまま。
 */
export type VariantStage = 1 | 2 | 3;
export type ColorMap = Record<number, number>;
/** 色ちがいの 表の キー。YokaiKind の 別名（種類は content/yokai/ids.ts の 1 か所） */
export type YokaiKindId = YokaiKind;

/** 値は content/yokai/<kind>.ts（全種類そろわないと 型エラー） */
export const YOKAI_VARIANT_COLORS: Record<YokaiKindId, Record<2 | 3, ColorMap>> = yokaiVariantColors();

/** もとの色（段階 1）を 段階に合わせた色にする。表に無ければ そのまま */
export function variantColor(kind: YokaiKind, stage: VariantStage, hex: number): number {
  if (stage === 1) return hex;
  return YOKAI_VARIANT_COLORS[kind][stage][hex] ?? hex;
}

/** 段階 2・3 の 色から 段階 1 の もとの色へ もどす（もとの色なら そのまま） */
export function baseColorOf(kind: YokaiKind, hex: number): number {
  const t = YOKAI_VARIANT_COLORS[kind];
  for (const st of [2, 3] as const) for (const [from, to] of Object.entries(t[st])) if (to === hex) return Number(from);
  return hex;
}
