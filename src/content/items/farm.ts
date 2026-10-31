import { vegRow } from './howText';
import type { FarmBucketId, FarmToolId, SeedItemId, VegItemId } from './ids';
import type { ItemDef } from './types';
import type { BlockId } from '../../contracts';
import type { InfoRow } from '../../craft/info/table';

/**
 * 畑のアイテム（M7・M7-2・BUCKET-1・#63）。14 個の値は ここ 1 か所（ルール #304）。
 * たね 4・やさい 4・くわ・じょうろ 2・スプリンクラー（置ける ブロック）・バケツ 2。
 * 作物の しゅるい → たね・やさいの 対応（contracts.ts の SEED_ITEM・VEG_ITEM）は 型で そろえ、registry.test.ts が 確かめる。
 * 絵は ui/itemArtM7.ts・itemArtM72.ts・bucketArt.ts、手に持つ形は camera/heldTools.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */

/** たねの 説明の行（4 つ 同じ。1 つずつ 新しく 作る） */
const seedInfo = (): InfoRow => ({ use: 'はたけ に まくと やさい が そだつ', how: 'もって はたけ に みぎクリック', buttons: ['1-9', 'right'] });

/** たね: はたけ に まく（やさい 1 こ → たね 4 こ に 作れる。作業台の 順は 作物の 順） */
export const SEEDS = {
  seed_onion: {
    name: 'たまねぎの たね',
    zukan: 'まあるい たまねぎの たね。はたけに まいて ［水｜みず］を あげると、［小｜ちい］さな めが ［出｜で］て だんだん ［大｜おお］きく なる。',
    maxStack: 64,
    rarity: 'common',
    category: 'plant',
    info: seedInfo(),
    recipe: { count: 4, inputs: [['onion', 1]] },
  },
  seed_tomato: {
    name: 'トマトの たね',
    zukan: 'まっ［赤｜か］な トマトの たね。お［日｜ひ］さまと ［水｜みず］が だいすき。そだつと ［赤｜あか］い みが ころころ なるよ。',
    maxStack: 64,
    rarity: 'common',
    category: 'plant',
    info: seedInfo(),
    recipe: { count: 4, inputs: [['tomato', 1]] },
  },
  seed_pumpkin: {
    name: 'かぼちゃの たね',
    zukan: '［大｜おお］きな かぼちゃの たね。［小｜ちい］さな たねから びっくりするほど ［大｜おお］きな みが できる。',
    maxStack: 64,
    rarity: 'common',
    category: 'plant',
    info: seedInfo(),
    recipe: { count: 4, inputs: [['pumpkin', 1]] },
  },
  seed_eggplant: {
    name: 'なすの たね',
    zukan: 'むらさき［色｜いろ］の なすの たね。つやつやの なすが みのるまで、［毎日｜まいにち］ ［水｜みず］を あげよう。',
    maxStack: 64,
    rarity: 'common',
    category: 'plant',
    info: seedInfo(),
    recipe: { count: 4, inputs: [['eggplant', 1]] },
  },
} satisfies Record<SeedItemId, ItemDef>;

/** やさい: たべると ハートが もどる（説明に 出す 数。食べた ときの 回復量 eatHeal は 設定 M7 側） */
export const VEGGIES = {
  onion: {
    name: 'たまねぎ',
    zukan: 'はたけで そだった たまねぎ。［食｜た］べると ［元気｜げんき］が すこし もどる。［切｜き］ると ［目｜め］が しみるのは ひみつの ［力｜ちから］。',
    maxStack: 64,
    rarity: 'common',
    category: 'food',
    info: vegRow(1),
  },
  tomato: {
    name: 'トマト',
    zukan: 'まっ［赤｜か］に みのった トマト。かじると あまずっぱくて、［元気｜げんき］が すこし もどる。',
    maxStack: 64,
    rarity: 'common',
    category: 'food',
    info: vegRow(1),
  },
  pumpkin: {
    name: 'かぼちゃ',
    zukan: 'ずっしり おもい かぼちゃ。［食｜た］べると ［元気｜げんき］が たくさん もどる。',
    maxStack: 64,
    rarity: 'common',
    category: 'food',
    info: vegRow(2),
  },
  eggplant: {
    name: 'なす',
    zukan: 'つやつやの むらさきの なす。［食｜た］べると ［元気｜げんき］が すこし もどる。',
    maxStack: 64,
    rarity: 'common',
    category: 'food',
    info: vegRow(1),
  },
} satisfies Record<VegItemId, ItemDef>;

const CAN_HOW = 'みず に みぎクリック で くむ、はたけ に みぎクリック';

/** くわ・じょうろ 2 しゅるい（置けない・上限 1）。じょうろ・ながい じょうろは こわれない */
export const FARM_TOOLS = {
  kuwa: {
    name: 'くわ',
    zukan: '［土｜つち］を たがやす くわ。［草｜くさ］や ［土｜つち］を ふかふかの はたけに かえる。のうかの はじめの いっぽ。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'くさ や つち を はたけ に する', how: 'もって くさ・つち に みぎクリック', buttons: ['1-9', 'right'] },
    wear: 131, // 131 かい つかうと こわれる
    recipe: { count: 1, inputs: [['log', 2], ['stone', 1]] },
    tool: { power: 4, family: 'dirt' }, // ほる強さ 4。あう ブロックは つち
  },
  watering_can: {
    name: 'じょうろ',
    zukan: '［水｜みず］を はこぶ じょうろ。はたけに しゃわしゃわ ［水｜みず］を まいて、やさいを ［元気｜げんき］に そだてよう。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'はたけ 1 マス に みず を まく', how: CAN_HOW, buttons: ['1-9', 'right'], stats: 'can' },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['iron_ingot', 1], ['stone', 2]] },
    can: { capacity: 10, tiles: 1 }, // みず 10 かい ぶん・1 マス に まく
  },
  long_watering_can: {
    name: 'ながい じょうろ',
    zukan: '［口｜くち］の ［長｜なが］い じょうろ。いっぺんに となりの はたけまで ［水｜みず］が とどく。はたけしごとが ぐんと らくに なる。',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'tool',
    info: { use: 'はたけ 2 マス（ねらった はたけ と その むこう）に みず を まく', how: CAN_HOW, buttons: ['1-9', 'right'], stats: 'can' },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['iron_ingot', 3], ['log', 1]] },
    can: { capacity: 20, tiles: 2 }, // みず 20 かい ぶん・2 マス に まく
  },
} satisfies Record<FarmToolId, ItemDef>;

/** スプリンクラー: 置ける ブロック（BlockId 側の 表は 動かさない。ここは アイテムの 行だけ）。64 こ まで 重ねられる */
export const SPRINKLER = {
  sprinkler: {
    name: 'スプリンクラー',
    zukan: 'まわりの はたけに ずっと ［水｜みず］を まいて くれる からくり。いそがしい のうかの みかた。',
    maxStack: 64,
    placeBlock: 'sprinkler',
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'まわり の はたけ を ずっと しめらせる', how: 'もって みぎクリック で おく', buttons: ['1-9', 'right'] },
    recipe: { count: 1, inputs: [['iron_ingot', 4], ['stone', 2]] },
  },
} satisfies Partial<Record<BlockId, ItemDef>>;

/** バケツ: みずを くんで はこぶ（置けない・上限 1・こわれない） */
export const BUCKETS = {
  bucket: {
    name: 'バケツ',
    zukan: 'てつで ［作｜つく］った バケツ。［池｜いけ］や ［川｜かわ］の ［水｜みず］を くんで はこべる。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'みず を くんで はこぶ', how: 'みず に みぎクリック で くむ', buttons: ['1-9', 'right'] },
    wear: 'permanent',
    recipe: { count: 1, inputs: [['iron_ingot', 3]] },
  },
  water_bucket: {
    name: 'みずの バケツ',
    zukan: '［水｜みず］が たっぷり ［入｜はい］った バケツ。はたけの そばに ［水｜みず］を おけば、やさいが よく そだつ。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'はたけ の そば に みず を おく', how: 'もって みぎクリック で おく', buttons: ['1-9', 'right'] },
    wear: 'permanent',
  },
} satisfies Record<FarmBucketId, ItemDef>;
