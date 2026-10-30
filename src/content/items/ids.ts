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

/** 畑のたね（M7・#63）: たまねぎ・トマト・かぼちゃ・なす（作物 CropKind と同じ 順。この順が ITEM_TYPES・色分け・作業台のカードの 並び） */
export const SEED_ITEM_IDS = ['seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant'] as const;
export type SeedItemId = (typeof SEED_ITEM_IDS)[number];

/** 畑のやさい（M7）: たべられる。id は 作物の 名前そのまま */
export const VEG_ITEM_IDS = ['onion', 'tomato', 'pumpkin', 'eggplant'] as const;
export type VegItemId = (typeof VEG_ITEM_IDS)[number];

/** 畑の道具（M7・M7-2）: くわ・じょうろ・ながい じょうろ（この順）。スプリンクラーは 置ける ブロックなので BlockId 側（contracts.ts）に ある */
export const FARM_TOOL_IDS = ['kuwa', 'watering_can', 'long_watering_can'] as const;
export type FarmToolId = (typeof FARM_TOOL_IDS)[number];

/** バケツ（BUCKET-1）: から・みず（この順） */
export const FARM_BUCKET_IDS = ['bucket', 'water_bucket'] as const;
export type FarmBucketId = (typeof FARM_BUCKET_IDS)[number];

/** ようかいだま（M3 の 名残り。いまは 手に入らない 古い保存用）。ITEM_TYPES では ざいりょうの 先頭 */
export const ORB_IDS = ['yokai_orb'] as const;
export type OrbId = (typeof ORB_IDS)[number];

/** ざいりょう 6 つ（M3・M4）: かみ・あぶら・いと・ぬの・ねんど・すいしょう（この順が ITEM_TYPES の 並び。ようかいだまの 次） */
export const MATERIAL_ITEM_IDS = ['paper', 'oil', 'string', 'cloth', 'clay', 'crystal'] as const;
export type MaterialId = (typeof MATERIAL_ITEM_IDS)[number];

/** てつの かたまり（M4。かまどで 鉄鉱石を やく。ITEM_TYPES では つるはし・おのの 次） */
export const INGOT_IDS = ['iron_ingot'] as const;
export type IngotId = (typeof INGOT_IDS)[number];

/** 小物 6 つ（M4。働きは あとで 入る）: ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ（この順が ITEM_TYPES・作業台の カード・たいきゅうの 並び） */
export const GADGET_IDS = ['lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa'] as const;
export type GadgetId = (typeof GADGET_IDS)[number];

/**
 * 生き物のアイテム 7 つ（LIVE-1〜3）: たまご・むし・むしとりあみ・とりごや・きんの たまご・なま／やいた もも にく
 * （こたつ nukunuku は 置ける ブロックなので BlockId 側（contracts.ts）に ある。ITEM_TYPES では むしとりあみの 次）
 */
export const LIVE_ITEM_IDS = ['egg', 'mushi', 'mushi_ami', 'toriya', 'kin_tamago', 'momo_nama', 'momo_yaki'] as const;
export type LiveItemId = (typeof LIVE_ITEM_IDS)[number];

/** 家づくりの道具（HOUSE-1A #338）: みずもり・どうづき（建築士さんが くれる。はたらきは HOUSE-1C）。ITEM_TYPES では 金の 次 */
export const HOUSE_TOOL_IDS = ['mizumori', 'dotsuki'] as const;
export type HouseToolId = (typeof HOUSE_TOOL_IDS)[number];
