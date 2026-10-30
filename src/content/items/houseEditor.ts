import type { HouseFurnitureId, HousePlanId } from './ids';
import type { ItemDef } from './types';

const NOW_HOW = 'いまは もてる だけ';
const FURN_SOURCE = 'けんちくし が たてた いえ を ほる';

/**
 * 家の 新しい 家具 5 つ（HOUSE-1B #339。案 A「ごつごつの くりの 木」。docs/design/HOUSE-1.md §4.3）。
 * 方眼の 大きさ・材料は エディターの 表（house/editor/furniture.ts）。ここは 持ち物の 名前・説明・めずらしさ だけ。
 * 置いて ブロックに なるのは HOUSE-1C（#340）、はたらき（いす・おふろ・あんどん・ほんだな）は HOUSE-1D（#341）。
 * 置けるブロックに なる 前なので いまは 置けない。重ねる 数は ふとんと 同じ（置けるブロックと 同じ 64）。絵は ui/itemArtHouseEditor.ts（仮の 絵）。
 */
export const HOUSE_FURNITURE = {
  table: {
    name: 'テーブル',
    maxStack: 64,
    rarity: 'common',
    category: 'home',
    info: { use: 'いえの なかに おく ざぶとん つきの つくえ', how: NOW_HOW, buttons: [] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  chair: {
    name: 'いす',
    maxStack: 64,
    rarity: 'common',
    category: 'home',
    info: { use: 'いえの なかに おく すわる ところ', how: NOW_HOW, buttons: [] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  andon: {
    name: 'あんどん',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'いえの なかに おく やさしい あかり', how: NOW_HOW, buttons: [] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  shelf: {
    name: 'ほんだな',
    maxStack: 64,
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'いえの なかに おく ほんを しまう たな', how: NOW_HOW, buttons: [] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
  ofuro: {
    name: 'おふろ',
    maxStack: 64,
    rarity: 'rare',
    category: 'home',
    info: { use: 'いえの なかに おく あったかい おふろ', how: NOW_HOW, buttons: [] },
    source: FURN_SOURCE,
    wear: 'permanent',
  },
} satisfies Record<HouseFurnitureId, ItemDef>;

/**
 * せっけいず（HOUSE-1B #339。docs/design/HOUSE-1.md §2.7）。1 マスに 1 こ・こわれない・捨てられる・くらには 入らない（重ならない 物）。
 * 「<名前>の せっけいず」と いう 名前と 形・番号は 1 まいずつ 持つ（持ち物の マスの `plan`〔番号〕→ 保存の house の 中身）。
 * ここの 名前は 中身を 読めない とき（番号が 分からない 古い マス）の 名前。つかえるのは HOUSE-1C（けんちくを はじめる）。
 */
export const HOUSE_PLANS = {
  sekkeizu: {
    name: 'せっけいず',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'home',
    info: { use: 'おうちを たてる ための せっけいず（つかえるのは もうすぐ）', how: NOW_HOW, buttons: [] },
    source: 'けんちくし の エディター で かく',
    wear: 'permanent',
  },
} satisfies Record<HousePlanId, ItemDef>;
