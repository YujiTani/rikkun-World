/**
 * 妖怪の色ちがい 3 段階の 色の表（DESIGN 13.1、BALANCE §2.4）。
 * `YOKAI_VARIANT_COLORS[妖怪][段階 2 | 3] = { もとの色: 新しい色 }`。段階 1 = 今の色（表に無い）。
 * 表にない色（顔・した・はだ・かみ・げた・ちょうちんの え）は 3 段階とも 今のまま。
 */
export type VariantStage = 1 | 2 | 3;
export type ColorMap = Record<number, number>;
export type YokaiKindId = 'karakasa' | 'chochin' | 'nurikabe' | 'rokurokubi';

export const YOKAI_VARIANT_COLORS: Record<YokaiKindId, Record<2 | 3, ColorMap>> = {
  karakasa: {
    2: { 0xe0503a: 0x9aaaff, 0x8b4a2b: 0x4b56b8, 0xf2c14e: 0xe2eaff, 0xa0703c: 0x7a86cc },
    3: { 0xe0503a: 0xffc83d, 0x8b4a2b: 0xff6a3d, 0xf2c14e: 0xfff2b0, 0xa0703c: 0xe89a30 },
  },
  chochin: {
    2: { 0xffb347: 0xbcd2ff, 0xfff2a0: 0xe4eeff, 0xc46a1e: 0x5f7be6, 0x3a3a4a: 0x343d8c },
    3: { 0xffb347: 0xfff05a, 0xfff2a0: 0xfff8c8, 0xc46a1e: 0xff5a3c, 0x3a3a4a: 0xd99a1a },
  },
  nurikabe: {
    2: { 0xa39b8b: 0xb2bce6, 0x8a8273: 0x8e99cc, 0x8e8676: 0x8c97cc, 0x6dbe45: 0xb0ecff, 0x5aa83a: 0x7fd2f2 },
    3: { 0xa39b8b: 0xf2cc6a, 0x8a8273: 0xd9a940, 0x8e8676: 0xddae48, 0x6dbe45: 0xff9a50, 0x5aa83a: 0xff8040 },
  },
  rokurokubi: {
    2: { 0x6f84e8: 0xc29cf2, 0x5b6fd6: 0x9f78e0, 0xf2c14e: 0xe8eeff },
    3: { 0x6f84e8: 0xffc83d, 0x5b6fd6: 0xf0a830, 0xf2c14e: 0xff6a3d },
  },
};

/** もとの色（段階 1）を 段階に合わせた色にする。表に無ければ そのまま */
export function variantColor(kind: string, stage: VariantStage, hex: number): number {
  if (stage === 1) return hex;
  const t = (YOKAI_VARIANT_COLORS as Record<string, Record<2 | 3, ColorMap> | undefined>)[kind];
  return t?.[stage][hex] ?? hex;
}

/** 段階 2・3 の 色から 段階 1 の もとの色へ もどす（もとの色なら そのまま） */
export function baseColorOf(kind: string, hex: number): number {
  const t = (YOKAI_VARIANT_COLORS as Record<string, Record<2 | 3, ColorMap> | undefined>)[kind];
  if (!t) return hex;
  for (const st of [2, 3] as const) for (const [from, to] of Object.entries(t[st])) if (to === hex) return Number(from);
  return hex;
}
