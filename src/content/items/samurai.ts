import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { WEAR_HOW } from './howText';
import type { SamuraiId } from './ids';
import type { ItemDef } from './types';

/**
 * 侍シリーズ（SAMURAI-1 #300）。侍装備 4 つの値は ここ 1 か所（ルール #304）。
 * 防ぐ量は 調整表 craft/ninjaTuning.ts（忍者と 同じ 表）の数を そのまま 読む。特別な力の 数（パリィ・とばされにくさ・手甲・下駄）も あの表。
 * 特別な力の しくみは craft/samuraiPower.ts・craft/geta.ts・combat/parry.ts。絵は ui/itemArtSamurai.ts。
 * ヌシが おとす（contracts.ts の nushiDrops）・宝箱・ガシャで 手に入る。作れないので レシピは なし。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const SAMURAI = {
  samurai_jingasa: {
    name: '［明珍｜みょうちん］［陣笠｜じんがさ］',
    zukan: 'むかし、［明珍｜みょうちん］と いう よろいづくりの めいじんの ［家｜いえ］が あった。その ［家｜いえ］に つたわる ［陣笠｜じんがさ］。ひのたまを ふせぎ、パリィで はじく ［時間｜じかん］が ［長｜なが］く なる。かぶると、まるで ［一｜ひと］つ ［一｜ひと］つの こうげきが ゆっくり ［見｜み］える らしい。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'armor',
    info: { use: 'こうげき から まもる（あたま）', special: 'ひのたま を ふせぐ。パリィ で はじく じかん が ながく なる', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000, // 10000 かい（事実上 こわれない）
    armor: { slot: 'head', kind: 'ball', value: { normal: 0, ball: NINJA_TUNING.jingasaBallCut, fall: 0 } }, // ひのたまを 2 へらす（てつの かぶとと 同じ）
  },
  samurai_haori: {
    name: '［明珍｜みょうちん］［羽織｜はおり］',
    zukan: '［明珍｜みょうちん］の ［家｜いえ］に つたわる、さむらいの たいしょうが はおった ［羽織｜はおり］。ようかいに ぶつかられても びくとも せず、とばされにくい。',
    maxStack: 1,
    rarity: 'legendary',
    category: 'armor',
    info: { use: 'こうげき から まもる（からだ）', special: 'ようかい の こうげき を ふせぐ。［吹｜ふ］き［飛｜と］ばされ にくく なる', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000,
    armor: { slot: 'body', kind: 'normal', value: { normal: NINJA_TUNING.haoriNormalCut, ball: 0, fall: 0 } }, // ふつうの こうげきを 2 へらす（てつの よろいと 同じ）
  },
  samurai_tekko: {
    name: '［明珍｜みょうちん］［手甲｜てっこう］',
    zukan: '［明珍｜みょうちん］の めいじんが ひと はり ひと はり きたえた ［手甲｜てっこう］。［刀｜かたな］の あつかいが うまく なって、かたい あいてにも よく きく。',
    maxStack: 1,
    rarity: 'legendary',
    category: 'armor',
    info: { use: 'こうげき から まもる（うで）', special: 'かたな の あつかい が うまく なる。かたい あいて にも こうか ばつぐん', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000,
    armor: { slot: 'arms', kind: 'normal', value: { normal: NINJA_TUNING.samuraiTekkoNormalCut, ball: 0, fall: 0 } }, // ふつうの こうげきを 1 へらす（てつの こてと 同じ）
  },
  samurai_geta: {
    name: '［明珍｜みょうちん］［下駄｜げた］',
    zukan: '［明珍｜みょうちん］の ［家｜いえ］に つたわる ふしぎな ［下駄｜げた］。おちた ときの いたさを へらし、［走｜はし］ると カランコロンと ここちよい ［音｜おと］が ［鳴｜な］る。その ［足｜あし］［音｜おと］は、ようかいたちが いちばん こわがる ［音｜おと］ だった と いう。',
    maxStack: 1,
    rarity: 'legendary',
    category: 'armor',
    info: { use: 'こうげき から まもる（あし）', special: 'おちた とき の いたさ を へらす。はしる と カランコロン と ［心地｜ここち］よい おと が する', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000,
    armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: NINJA_TUNING.getaFallCut } }, // 落ちた いたみを 2 へらす（てつの すねあてと 同じ）
  },
} satisfies Record<SamuraiId, ItemDef>;
