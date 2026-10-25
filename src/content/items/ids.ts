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

/** 忍者シリーズ（NINJA-1 #299）: 忍者装備 4 つ（あたま・からだ・うで・あし の じゅん） */
export const NINJA_ITEM_IDS = ['ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi'] as const;
export type NinjaId = (typeof NINJA_ITEM_IDS)[number];

/** 侍シリーズ（SAMURAI-1 #300）: 侍装備 4 つ（あたま・からだ・うで・あし の じゅん） */
export const SAMURAI_ITEM_IDS = ['samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta'] as const;
export type SamuraiId = (typeof SAMURAI_ITEM_IDS)[number];

/** レジェンダリー武器（WEAPON-7/8/9）: 雷神剣・風神剣・虹。ヌシが おとす（この順が ドロップ表・色分けの 並び） */
export const LEGEND_IDS = ['raijin_ken', 'fujin_ken', 'niji'] as const;
export type LegendId = (typeof LEGEND_IDS)[number];

/** 道具（M4・BAL-D）: つるはし 3 本・おの 3 本（この順が ITEM_TYPES・作業台のカード・色分けの 並び） */
export const TOOL_ITEM_IDS = ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe'] as const;
export type ToolItemId = (typeof TOOL_ITEM_IDS)[number];

/** 刀・なぎなた（M4）: ぼくとう・かたな・なぎなた・きらめく カタナ（この順） */
export const SWORD_IDS = ['bokuto', 'katana', 'naginata', 'crystal_katana'] as const;
export type SwordId = (typeof SWORD_IDS)[number];

/** ゆみ・や（M4）。ゆみは WEAPON-2 の 3 だん引き。や は ゆみが つかう（ブロックと 同じ 64 こ まで 重ねられる） */
export const BOW_IDS = ['yumi', 'ya'] as const;
export type BowId = (typeof BOW_IDS)[number];

/** 防具（M4）: かぶと・よろい・こて・すねあて（あたま・からだ・うで・あし の じゅん） */
export const ARMOR_ITEM_IDS = ['kabuto', 'yoroi', 'kote', 'suneate'] as const;
export type ArmorItemId = (typeof ARMOR_ITEM_IDS)[number];
