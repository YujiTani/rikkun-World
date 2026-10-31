import { WEAR_HOW } from './howText';
import type { ArmorItemId } from './ids';
import type { ItemDef } from './types';

/**
 * 防具（M4）。かぶと・よろい・こて・すねあての値は ここ 1 か所（ルール #304）。
 * 防ぐ量・たいきゅうは、その 防具の 行に 単位つきで 書く。`kind` は 説明に 出す 種類（かぶと = 玉・よろい と こて = ふつう・すねあて = 落下）。
 * 絵は ui/itemArtM4.ts、着たときの 形は camera/BlockDoll.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const ARMOR = {
  kabuto: {
    name: 'かぶと',
    zukan: 'てつの かぶと。［頭｜あたま］を まもって、ようかいの ひのたまの あつさを へらして くれる。',
    maxStack: 1,
    rarity: 'rare',
    category: 'armor',
    info: { use: 'ようかい の ひのたま を へらす（あたま）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 165, // 165 かい
    recipe: { count: 1, inputs: [['iron_ingot', 2], ['cloth', 1]] },
    armor: { slot: 'head', kind: 'ball', value: { normal: 0, ball: 2, fall: 0 } }, // ひのたまを 2 へらす
  },
  yoroi: {
    name: 'よろい',
    zukan: 'てつの よろい。［体｜からだ］を まもって、ようかいの こうげきを へらして くれる。きると ちょっと おもいけど たのもしい。',
    maxStack: 1,
    rarity: 'rare',
    category: 'armor',
    info: { use: 'ようかい の こうげき を へらす（からだ）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 240,
    recipe: { count: 1, inputs: [['iron_ingot', 3], ['string', 2], ['cloth', 2]] },
    armor: { slot: 'body', kind: 'normal', value: { normal: 2, ball: 0, fall: 0 } }, // ふつうの こうげきを 2 へらす
  },
  kote: {
    name: 'こて',
    zukan: 'てつの こて。うでを まもって、ようかいの こうげきを へらして くれる。',
    maxStack: 1,
    rarity: 'rare',
    category: 'armor',
    info: { use: 'ようかい の こうげき を へらす（うで）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 225,
    recipe: { count: 1, inputs: [['iron_ingot', 1], ['cloth', 1]] },
    armor: { slot: 'arms', kind: 'normal', value: { normal: 1, ball: 0, fall: 0 } }, // ふつうの こうげきを 1 へらす
  },
  suneate: {
    name: 'すねあて',
    zukan: 'てつの すねあて。［足｜あし］を まもって、［高｜たか］い ところから おちた ときの いたさを へらして くれる。',
    maxStack: 1,
    rarity: 'rare',
    category: 'armor',
    info: { use: 'たかい ところ から おちた いたみ を へらす（あし）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 195,
    recipe: { count: 1, inputs: [['iron_ingot', 2], ['string', 1]] },
    armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 2 } }, // 落ちた いたみを 2 へらす
  },
} satisfies Record<ArmorItemId, ItemDef>;
