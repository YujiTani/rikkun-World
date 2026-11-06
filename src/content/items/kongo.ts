import { BOW_HOW, CRAFT_E, KATANA_HOW, PICK_HOW, WEAR_HOW } from './howText';
import type { KongoId } from './ids';
import type { ItemDef } from './types';

/**
 * こんごうシリーズ（KONGO-1。金シリーズ gold.ts の つぎの「さいきょう」）。ダイヤと こんごうの そうびの 値は ここ 1 か所だけ（ルール #304）。
 * めずらしさは ぜんぶ mythic（ほし 6・ミラクル）。強さ・耐久・防ぐ量は その アイテムの 行に 単位つきで 書く（調整は ここの 数を かえるだけ）。
 * 絵は ui/itemArtKongo.ts（2D）・camera/heldKongo.ts（手に持つ形）。
 * ダイヤの 鉱石 `diamond_ore` は MINE-1B で 入った（ほると ダイヤ 1。図鑑の「てに いれかた」は `dugFrom: 'diamond_ore'` から「ダイヤの いし を ほる（てつの つるはし から）」）。
 */
export const KONGO = {
  // ダイヤ: そうびの ざいりょう（炭鉱の ふかい 層の 鉱石から。MINE-1B）
  diamond: {
    name: 'ダイヤ',
    zukan: '［地｜ち］［下｜か］の いちばん ふかい ところで、［長｜なが］い ［長｜なが］い ［時間｜じかん］を かけて できた ダイヤ。せかいで いちばん かたい ［石｜いし］。「こんごう」とも よばれ、こわれない そうびの もとに なる。',
    maxStack: 64,
    rarity: 'mythic', // ほし 6
    category: 'metal',
    info: { use: 'こんごう の そうび の ざいりょう', how: CRAFT_E, buttons: ['E'] },
    dugFrom: 'diamond_ore',
  },
  kongo_katana: {
    name: 'こんごうの かたな',
    zukan: 'ダイヤで きたえた「こんごう」の ［刀｜かたな］。どんな ようかいにも まけない、いちばん ［強｜つよ］い ［刀｜かたな］。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'weapon',
    info: { use: 'ようかい を いちばん つよく たたく', how: KATANA_HOW, buttons: ['1-9', 'left'], stats: 'blade' },
    wear: 1500, // 1500 かい つかうと こわれる
    recipe: { count: 1, inputs: [['diamond', 2], ['log', 1]] },
    tool: { damage: 7 }, // たたく強さ 7（ダメージ。金 5）
    // 刃の 届く 長さ 2.2（ブロック）。軌跡は 金と 同じ 形で 色だけ 案 C（刃 = 水色、下地 = こい むらさき、きらり）
    blade: { reach: 2.2, trail: { color: 0x7ad8f0, glow: 0xd8fbff, blade: 0x7ad8f0, bladeShine: 0xd8fbff, style: 'gold', under: 0x1a1a40 } },
  },
  kongo_yumi: {
    name: 'こんごうの ゆみ',
    zukan: 'ダイヤで ［作｜つく］った「こんごう」の ［弓｜ゆみ］。どこまでも まっすぐ とぶ ［矢｜や］を はなつ。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'weapon',
    info: {
      use: 'や を とばして とおく の ようかい を たおす。や が いる',
      how: BOW_HOW,
      buttons: ['1-9', 'left'],
      stats: 'bow',
    },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 3], ['string', 3]] },
    bow: { damage: [3, 4, 7] }, // や の ダメージ（ひく 1・2・3 だん め。金 2・3・5）
  },
  kongo_pickaxe: {
    name: 'こんごうの つるはし',
    zukan: 'ダイヤで ［作｜つく］った「こんごう」の つるはし。どんな ［石｜いし］にも まけない、いちばん すごい つるはし。［地｜ち］［下｜か］の いちばん ふかい ［石｜いし］だって へっちゃら。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'tool',
    info: { use: 'いちばん はやく ほれる。ダイヤ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 3], ['log', 2]] },
    // ほる強さ 8（金 6）・ほれるレベル 2（= 今ある ぜんぶの ブロックと ほかの つるはし 以上。ダイヤの 鉱石に 3 が つくなら 3 に 上げる）・たたく強さ 6
    tool: { power: 8, level: 2, damage: 6 },
  },
  kongo_axe: {
    name: 'こんごうの おの',
    zukan: 'ダイヤで ［作｜つく］った「こんごう」の おの。どんな ［太｜ふと］い ［木｜き］も いっしゅんで ［切｜き］れる。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'tool',
    info: { use: 'いちばん はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 3], ['log', 2]] },
    tool: { power: 8, level: 0, damage: 6 }, // ほる強さ 8・レベル 0・たたく強さ 6
  },
  kongo_kabuto: {
    name: 'こんごうの かぶと',
    zukan: 'ダイヤの「こんごう」の かぶと。せかいで いちばん かたい ［石｜いし］で、［頭｜あたま］を しっかり まもる。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'armor',
    info: { use: 'ようかい の ひのたま を へらす（あたま）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 2], ['cloth', 1]] },
    armor: { slot: 'head', kind: 'ball', value: { normal: 0, ball: 4, fall: 0 } }, // ひのたまを 4 へらす（金 3）
  },
  kongo_yoroi: {
    name: 'こんごうの よろい',
    zukan: 'ダイヤの「こんごう」の よろい。どんな こうげきも はねかえしそうな、いちばん ［強｜つよ］い よろい。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'armor',
    info: { use: 'ようかい の こうげき を へらす（からだ）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 3], ['string', 2], ['cloth', 2]] },
    armor: { slot: 'body', kind: 'normal', value: { normal: 4, ball: 0, fall: 0 } }, // こうげきを 4 へらす（金 3）
  },
  kongo_kote: {
    name: 'こんごうの こて',
    zukan: 'ダイヤの「こんごう」の こて。うでを しっかり まもって くれる。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'armor',
    info: { use: 'ようかい の こうげき を へらす（うで）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 1], ['cloth', 1]] },
    armor: { slot: 'arms', kind: 'normal', value: { normal: 3, ball: 0, fall: 0 } }, // こうげきを 3 へらす（金 2）
  },
  kongo_suneate: {
    name: 'こんごうの すねあて',
    zukan: 'ダイヤの「こんごう」の すねあて。［高｜たか］い ところから おちても へっちゃら。',
    maxStack: 1,
    rarity: 'mythic',
    category: 'armor',
    info: { use: 'たかい ところ から おちた いたみ を へらす（あし）', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 1500,
    recipe: { count: 1, inputs: [['diamond', 2], ['string', 1]] },
    armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: 4 } }, // おちた いたみを 4 へらす（金 3）
  },
} satisfies Record<KongoId, ItemDef>;
