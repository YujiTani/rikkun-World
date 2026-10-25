/**
 * アイテム id の「ひとつだけの出どころ」（#306・ルール #304）。
 * id を文字で書くのは、シリーズごとに、ここ 1 回だけ。ほかのファイルは ここから型を作る。
 * 葉のファイル（何も import しない）。contracts.ts の `ItemOnlyId` もここから読む。
 */

/** 金シリーズ（GOLD-1 #222）: きん・きんの そうび 8 こ・はらぱんみみず */
export const GOLD_IDS = [
  'kin',
  'kin_katana',
  'kin_yumi',
  'kin_pickaxe',
  'kin_axe',
  'kin_kabuto',
  'kin_yoroi',
  'kin_kote',
  'kin_suneate',
  'harapan_mimizu',
] as const;
export type GoldId = (typeof GOLD_IDS)[number];
