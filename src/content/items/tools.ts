import { PICK_HOW } from './howText';
import type { ToolItemId } from './ids';
import type { ItemDef } from './types';

/**
 * 道具（M4・BAL-D）。つるはし 3 本・おの 3 本の値は ここ 1 か所（ルール #304）。
 * ほる強さ・ほれるレベル・たいきゅうは、その 道具の 行に 単位つきで 書く（調整は ここの 数を かえるだけ）。
 * `family` が 「あう ブロック」: おの = き（log）・つるはし = いし（stone）。あわない ブロックは 強さが 半分（dig/toolFamily.ts）。
 * 絵は ui/itemArtM4.ts、手に持つ形は camera/heldTools.ts・heldAxes.ts。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const TOOLS = {
  wood_pickaxe: {
    name: 'きの つるはし',
    zukan: '［木｜き］で ［作｜つく］った はじめての つるはし。すでより ずっと ［早｜はや］く ほれる。ここから ぼうけんが はじまる。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'ブロック を はやく ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 59, // 59 かい つかうと こわれる
    recipe: { count: 1, inputs: [['log', 3]] },
    tool: { power: 2, level: 0, family: 'stone' }, // ほる強さ 2・レベル 0
  },
  stone_pickaxe: {
    name: 'いしの つるはし',
    zukan: '［先｜さき］を ［石｜いし］に した つるはし。かたい ［石｜いし］も ざくざく ほれて、てつの ［石｜いし］も ほれるように なる。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'もっと はやく ほれる。てつ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 131,
    recipe: { count: 1, inputs: [['stone', 3], ['log', 2]] },
    tool: { power: 4, level: 1, family: 'stone' }, // ほる強さ 4・レベル 1
  },
  iron_pickaxe: {
    name: 'てつの つるはし',
    zukan: 'てつで きたえた つるはし。［地｜ち］［下｜か］の ふかい ところの ［金｜きん］や ダイヤも ほりだせる。たんけんの たのもしい あいぼう。',
    maxStack: 1,
    rarity: 'rare',
    category: 'tool',
    info: { use: 'いちばん はやく ほれる。てつ も ほれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 250,
    recipe: { count: 1, inputs: [['iron_ingot', 3], ['log', 2]] },
    tool: { power: 6, level: 2, family: 'stone' }, // ほる強さ 6・てつ まで ほれる（レベル 2）
  },
  // BAL-D: おの 3 本（作業台では てつの つるはしの すぐ後ろ）
  wood_axe: {
    name: 'きの おの',
    zukan: '［木｜き］で ［作｜つく］った おの。［木｜き］を すでより ［早｜はや］く ［切｜き］れる。まるたを たくさん あつめよう。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'き を はやく きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 59,
    recipe: { count: 1, inputs: [['log', 3]] },
    tool: { power: 2, level: 0, family: 'log' }, // ほる強さ 2・レベル 0
  },
  stone_axe: {
    name: 'いしの おの',
    zukan: 'はを ［石｜いし］に した おの。もっと ［早｜はや］く ［木｜き］が ［切｜き］れる。［森｜もり］の きこりに なった きぶん。',
    maxStack: 1,
    rarity: 'common',
    category: 'tool',
    info: { use: 'もっと はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 131,
    recipe: { count: 1, inputs: [['stone', 3], ['log', 2]] },
    tool: { power: 4, level: 0, family: 'log' }, // ほる強さ 4・レベル 0
  },
  iron_axe: {
    name: 'てつの おの',
    zukan: 'てつで きたえた おの。［太｜ふと］い ［木｜き］も あっという ［間｜ま］に ［切｜き］れる。',
    maxStack: 1,
    rarity: 'rare',
    category: 'tool',
    info: { use: 'いちばん はやく き を きれる', how: PICK_HOW, buttons: ['1-9', 'leftHold'], stats: 'pickaxe' },
    wear: 250,
    recipe: { count: 1, inputs: [['iron_ingot', 3], ['log', 2]] },
    tool: { power: 6, level: 0, family: 'log' }, // ほる強さ 6・レベル 0
  },
  // TAKO-1: せっけいず（ハウジング #339）を かく どうぐ。たたく強さ・ほる強さは 持たない（素手と 同じ）。
  // たいきゅう 5 は ここ 1 か所（せっけいず 1 まいで 1 へらす 処理は #339 が この 数を 読んで 作る。TAKO-1 では へらさない）
  fude: {
    name: 'ふで',
    zukan: '［竹｜たけ］の えに すみを すいこませた ふで。けんちくしさんの エディターで、［紙｜かみ］に せっけいずを かく。なんまいも かくと すりへって しまう。',
    maxStack: 1,
    rarity: 'uncommon',
    category: 'tool',
    info: { use: 'せっけいず を かく どうぐ', how: 'さぎょうだい で つくる', buttons: [] },
    wear: 5, // せっけいず 5 まい かくと こわれる（5 かい）
    recipe: { count: 1, inputs: [['sumi', 1], ['bamboo', 2]] }, // すみ 1 ＋ たけ 2
  },
} satisfies Record<ToolItemId, ItemDef>;
