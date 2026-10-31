import type { HouseFurnitureId, HousePlanId } from './ids';
import { DIG_DEFAULTS } from '../../dig/config';
import { PLACE_HOW } from './howText';
import type { ItemDef } from './types';

/** 家の ブロック（houseBlocks.ts）も 同じ 文 */
export const FURN_SOURCE = 'けんちくし が たてた いえ を ほる';

/**
 * 家の 新しい 家具（HOUSE-1B #339。案 A「ごつごつの くりの 木」。どれが あるかは ids.ts の HOUSE_FURNITURE_IDS。docs/design/HOUSE-1.md §4.3）。
 * 方眼の 大きさ・材料は エディターの 表（house/editor/furniture.ts）。ここは 持ち物の 名前・説明・めずらしさ だけ。
 * 置くと 向きの ある ブロックに なる（HOUSE-1C PR-1 #340。ブロックの id は アイテムの id と 同じ〔向き 0〕。向きの 違い・2 つ目 いこうの マスは world/blocks/houseBlocks.ts）。
 * はたらき（いす・おふろ・あんどん・ほんだな）は HOUSE-1D（#341）。重ねる 数は ふとんと 同じ（置けるブロックと 同じ 64）。絵は ui/itemArtHouseEditor.ts（仮の 絵）。
 */
export const HOUSE_FURNITURE = {
  table: {
    placeBlock: 'table',
    name: 'テーブル',
    zukan: 'ざぶとんの ついた くりの ［木｜き］の テーブル。みんなで かこんで ごはんを ［食｜た］べよう。けんちくしさんの おうちに ある。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.table,
    category: 'home',
    info: { use: 'いえの なかに おく ざぶとん つきの つくえ', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  chair: {
    placeBlock: 'chair',
    name: 'いす',
    zukan: 'くりの ［木｜き］の いす。みぎクリックで すわって ひと［休｜やす］み。［歩｜ある］くか ジャンプで ［立｜た］ちあがる。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.chair,
    category: 'home',
    info: { use: 'いえの なかに おく すわる ところ', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  andon: {
    placeBlock: 'andon',
    name: 'あんどん',
    zukan: '［紙｜かみ］を はった わくの ［中｜なか］で ［火｜ひ］が ゆれる あんどん。たいまつの ように まわりを ［明｜あか］るく して、［夜｜よる］の おうちを やさしく てらす。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.andon,
    category: 'home',
    info: { use: 'いえの なかに おく やさしい あかり', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  shelf: {
    placeBlock: 'shelf',
    name: 'ほんだな',
    zukan: '［本｜ほん］が ぎっしり ならんだ ［本｜ほん］だな。みぎクリックすると あそびかたの ［本｜ほん］（ルールブック）が ひらく。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.shelf,
    category: 'home',
    info: { use: 'いえの なかに おく ほんを しまう たな', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  ofuro: {
    placeBlock: 'ofuro',
    name: 'おふろ',
    zukan: 'ゆげの たつ あったかい おふろ。みぎクリックで ［入｜はい］ると、ぽかぽか して すこしずつ ［元気｜げんき］が もどって くる。［歩｜ある］くか ジャンプで あがる。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.ofuro,
    category: 'home',
    info: { use: 'いえの なかに おく あったかい おふろ', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  long_table: {
    placeBlock: 'long_table',
    name: 'ながい テーブル',
    zukan: 'みんなで ならんで すわれる ［長｜なが］い テーブル。おきゃくさんを よんで、［大｜おお］ぜいで ごちそうを かこもう。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.long_table,
    category: 'home',
    info: { use: 'いえの なかに おく みんなで つかう ながい つくえ', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  round_table: {
    placeBlock: 'round_table',
    name: 'まるい テーブル',
    zukan: 'まあるい テーブル。［角｜かど］が ないから、だれとでも ［顔｜かお］を ［見｜み］て お［話｜はなし］ できる。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.round_table,
    category: 'home',
    info: { use: 'いえの なかに おく まるい つくえ', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  stool: {
    placeBlock: 'stool',
    name: 'まるいす',
    zukan: 'ちょこんと すわれる ［丸｜まる］い こしかけ。みぎクリックで すわって、［歩｜ある］くか ジャンプで ［立｜た］ちあがる。',
    maxStack: 64,
    rarity: DIG_DEFAULTS.rarity.stool,
    category: 'home',
    info: { use: 'いえの なかに おく まるい こしかけ', how: PLACE_HOW, buttons: ['1-9', 'right'] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
} satisfies Record<HouseFurnitureId, ItemDef>;

/**
 * せっけいず（HOUSE-1B #339。docs/design/HOUSE-1.md §2.7）。1 マスに 1 こ・こわれない・捨てられる（重ならない 物）。
 * 「<名前>の せっけいず」と いう 名前と 形・番号は 1 まいずつ 持つ（持ち物の マスの `plan`〔番号〕→ 保存の house の 中身）。
 * ここの 名前は 中身を 読めない とき（番号が 分からない 古い マス）の 名前。つかえるのは HOUSE-1C（けんちくを はじめる）。
 */
export const HOUSE_PLANS = {
  sekkeizu: {
    name: 'せっけいず',
    zukan: 'ゆめの おうちの かたちを かいた せっけいず。けんちくしさんに ［見｜み］せると、その とおりの おうちを たてて くれる。なんけんでも たてられるよ。',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'けんちくし に みせると、この かたち の いえ を たてて くれる', how: 'けんちくし に はなして「けんちくを はじめる」', buttons: [] },
    source: 'けんちくし の エディター で かく',
    wear: 'permanent',
  },
} satisfies Record<HousePlanId, ItemDef>;
