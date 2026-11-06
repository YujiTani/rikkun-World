import type { HouseToolId } from './ids';
import type { ItemDef } from './types';

/** 2 つの 道具の「どう つかう」（HOUSE-1C #340。どちらも 同じ） */
const USE_HOW = 'てに もって じめん に みぎクリック';

/**
 * 家づくりの道具 2 つ（HOUSE-1A #338）: みずもり・どうづき。値は ここ 1 か所（ルール #304）。
 * 建築士さんが はじめて 話した ときに 1 こずつ くれる（作れない ので レシピは なし。ずかんの「てにいれかた」は `source`）。
 * 1 マスに 1 こ・こわれない（仕様 docs/design/HOUSE-1.md §4.4）。働き（地面の 高さの 色・じがため）は HOUSE-1C（#340）で 入った。
 * 絵は ui/itemArtHouse.ts（仮の 絵。アートの 3 案から 本番の 絵に かわる）。
 */
export const HOUSE_TOOLS = {
  mizumori: {
    name: 'みずもり',
    zukan: 'じめんの ［高｜たか］さを しらべる、だいくさんの ものさし。じめんに みぎクリック すると、［高｜たか］すぎる ところが ［赤｜あか］、ひくすぎる ところが ［青｜あお］に なる。けんちくしさんに もらえる。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'じめん の たかさ を しらべる。たかすぎる ところ は あか、ひくすぎる ところ は あお に なる', how: USE_HOW, buttons: ['1-9', 'right'] },
    source: 'けんちくし から もらう',
    wear: 'permanent',
  },
  dotsuki: {
    name: 'どうづき',
    zukan: 'じめんを トントン たたいて かためる、だいくさんの どうぐ。「よいとまけ」の かけ［声｜ごえ］で たたけば、おうちを たてられる かためた ［土｜つち］が できる。けんちくしさんに もらえる。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'じめん を トントン たたいて かためる。かためた つち の うえ に いえ が たてられる', how: USE_HOW, buttons: ['1-9', 'right'] },
    source: 'けんちくし から もらう',
    wear: 'permanent',
  },
} satisfies Record<HouseToolId, ItemDef>;
