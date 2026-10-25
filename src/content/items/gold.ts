import { BOW_HOW, CRAFT_E, KATANA_HOW, PICK_HOW, WEAR_HOW } from './howText';
import type { GoldId } from './ids';
import type { ItemDef } from './types';

/**
 * 金シリーズ（GOLD-1 #222）。金のアイテムの値は ここ 1 か所だけ（ルール #304）。
 * 強さ・耐久・防ぐ量は、その アイテムの 行に 単位つきで 書く（調整は ここの 数を かえるだけ）。
 * 絵は ui/itemArtGold.ts（2D）・camera/heldGold.ts（手に持つ形）。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const GOLD = {
  // きん: かまどで きんの たまご（LIVE-2）を やく（てつ と 同じ 60 ステップ）
  kin: {
    name: 'きん',
    maxStack: 64,
    rarity: 'epic', // ほし 5（きん ぜんぶ）
    category: 'metal',
    info: { use: 'きん の そうび の ざいりょう', how: CRAFT_E, buttons: ['E'] },
    recipe: { count: 1, inputs: [['kin_tamago', 1]], station: 'furnace' },
  },
  kin_katana: {
    name: 'きんの かたな',
    maxStack: 1,
    rarity: 'epic',
    category: 'weapon',
    info: { use: 'ようかい を いちばん つよく たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 500, // 500 かい つかうと こわれる
    recipe: { count: 1, inputs: [['kin', 2], ['log', 1]] },
    tool: { damage: 5 }, // たたく強さ 5（ダメージ）
    // 刃の 届く 長さ 2.2（ブロック）。軌跡は 案 B: 金 ＋ こん色の 下地（2 回に 1 回 きらり）
    blade: { reach: 2.2, trail: { color: 0xf2b938, glow: 0xfff0b4, blade: 0xebb840, bladeShine: 0xfff0b4, style: 'gold', under: 0x2a2238 } },
  },
  kin_yumi: {
    name: 'きんの ゆみ',
    maxStack: 1,
    rarity: 'epic',
    category: 'weapon',
    info: {
      use: 'や を とばして とおく の ようかい を たおす。や が いる',
      how: BOW_HOW,
      buttons: ['1-9', 'left'],
      stats: 'bow',
    },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 3], ['string', 3]] }, // ゆみ は き の かわり に きん
    bow: { damage: [2, 3, 5] }, // や の ダメージ（ひく 1・2・3 だん め）
  },
  kin_pickaxe: {
    name: 'きんの つるはし',
    maxStack: 1,
    rarity: 'epic',
    category: 'tool',
    info: { use: 'いちばん はやく ほれる。てつ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 3], ['log', 2]] },
    tool: { power: 6, level: 2, damage: 5 }, // ほる強さ 6・てつ まで ほれる（レベル 2）・たたく強さ 5
  },
  kin_axe: {
    name: 'きんの おの',
    maxStack: 1,
    rarity: 'epic',
    category: 'tool',
    info: { use: 'いちばん はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 3], ['log', 2]] },
    tool: { power: 6, level: 0, damage: 5 }, // ほる強さ 6・レベル 0・たたく強さ 5
  },
  kin_kabuto: {
    name: 'きんの かぶと',
    maxStack: 1,
    rarity: 'epic',
    category: 'armor',
    info: { use: 'ようかい の ひのたま を へらす（あたま）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 2], ['cloth', 1]] },
    armor: { slot: 'head', kind: 'ball', value: { normal: 0, ball: 3, fall: 0 } }, // てつ より 1 多く ふせぐ（てつ で 0 の 種類 は 0 の まま）
  },
  kin_yoroi: {
    name: 'きんの よろい',
    maxStack: 1,
    rarity: 'epic',
    category: 'armor',
    info: { use: 'ようかい の こうげき を へらす（からだ）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 3], ['string', 2], ['cloth', 2]] },
    armor: { slot: 'body', kind: 'normal', value: { normal: 3, ball: 0, fall: 0 } },
  },
  kin_kote: {
    name: 'きんの こて',
    maxStack: 1,
    rarity: 'epic',
    category: 'armor',
    info: { use: 'ようかい の こうげき を へらす（うで）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 1], ['cloth', 1]] },
    armor: { slot: 'arms', kind: 'normal', value: { normal: 2, ball: 0, fall: 0 } },
  },
  kin_suneate: {
    name: 'きんの すねあて',
    maxStack: 1,
    rarity: 'epic',
    category: 'armor',
    info: { use: 'たかい ところ から おちた いたみ を へらす（あし）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 500,
    recipe: { count: 1, inputs: [['kin', 2], ['string', 1]] },
    armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 3 } },
  },
  // はらぱんみみず: ちか で ようかい を たおす・ブロック を こわす と ときどき でる。なかま の にわとり に あげる
  harapan_mimizu: {
    name: 'はらぱんみみず',
    maxStack: 64,
    rarity: 'epic',
    category: 'plant',
    info: { use: 'なかま の にわとり に あげる と なかよし が いっぱい に なる', how: 'もって なかま の おとな の にわとり に みぎクリック', buttons: ['1-9', 'right'] },
  },
} satisfies Record<GoldId, ItemDef>;
