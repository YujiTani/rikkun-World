import type { HouseToolId } from './ids';
import type { ItemDef } from './types';

const NOW_HOW = 'いまは もてる だけ';

/**
 * 家づくりの道具 2 つ（HOUSE-1A #338）: みずもり・どうづき。値は ここ 1 か所（ルール #304）。
 * 建築士さんが はじめて 話した ときに 1 こずつ くれる（作れない ので レシピは なし。ずかんの「てにいれかた」は `source`）。
 * 1 マスに 1 こ・こわれない（仕様 docs/design/HOUSE-1.md §4.4）。働き（地面の 高さの 色・じがため）は HOUSE-1C（#340）で 入る ので、
 * 説明は「いまは もてる だけ」の 行（レシピの 「働きが あと」〔時計の 絵〕では ない。作れない ので）。絵は ui/itemArtHouse.ts（仮の 絵。アートの 3 案から 本番の 絵に かわる）。
 */
export const HOUSE_TOOLS = {
  mizumori: {
    name: 'みずもり',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'じめん の たかさ を しらべる どうぐ（つかえるのは もうすぐ）', how: NOW_HOW, buttons: [] },
    source: 'けんちくし から もらう',
    wear: 'permanent',
  },
  dotsuki: {
    name: 'どうづき',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'じめん を トントン かためる どうぐ（つかえるのは もうすぐ）', how: NOW_HOW, buttons: [] },
    source: 'けんちくし から もらう',
    wear: 'permanent',
  },
} satisfies Record<HouseToolId, ItemDef>;
