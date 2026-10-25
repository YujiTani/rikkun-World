import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { WEAR_HOW } from './howText';
import type { NinjaId } from './ids';
import type { ItemDef } from './types';

/**
 * 忍者シリーズ（NINJA-1 #299）。忍者装備 4 つの値は ここ 1 か所（ルール #304）。
 * 防ぐ量は 調整表 craft/ninjaTuning.ts の数を そのまま 読む（戦いの数の 1 か所は あの表。特別な力の 数も あちら）。
 * 特別な力の しくみは craft/ninjaPower.ts・combat/Kodachi.ts・yokai/ai（気づく距離）。絵は ui/itemArtNinja.ts。
 * 作れない（ヌシ・ガシャ・宝箱でだけ手に入る）ので レシピは なし。たいきゅう 10000 = 事実上 こわれない。
 * 値は これまでの 表から そのまま 写した もの（2026-10-25）。
 */
export const NINJA = {
  ninja_zukin: {
    name: '［黒頭巾｜くろずきん］',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'armor',
    info: { use: 'こうげき から まもる（あたま）', special: 'ひのたま を ふせぐ。みず の なか で いき が ながく もつ', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000, // 10000 かい（つくれず 手に 入れ方が 限られる ので 事実上 こわれない）
    armor: { slot: 'head', kind: 'ball', value: { normal: 0, ball: NINJA_TUNING.zukinBallCut, fall: 0 } }, // ひのたまを 2 へらす（てつの かぶとと 同じ）
  },
  ninja_shozoku: {
    name: '［忍｜しの］び［装束｜しょうぞく］',
    maxStack: 1,
    rarity: 'legendary',
    category: 'armor',
    info: { use: 'こうげき から まもる（からだ）', special: 'ようかい に きづかれ にくい', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000,
    armor: { slot: 'body', kind: 'normal', value: { normal: NINJA_TUNING.shozokuNormalCut, ball: 0, fall: 0 } }, // ふつうの こうげきを 2 へらす（てつの よろいと 同じ）
  },
  ninja_tekko: {
    name: '［忍｜しの］びの ［手甲｜てっこう］',
    maxStack: 1,
    rarity: 'legendary',
    category: 'armor',
    info: { use: 'こうげき から まもる（うで）', special: 'かたな・すで で こうげき した とき に ［小太刀｜こだち］ で おいうち', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000,
    armor: { slot: 'arms', kind: 'normal', value: { normal: NINJA_TUNING.tekkoNormalCut, ball: 0, fall: 0 } }, // ふつうの こうげきを 1 へらす（てつの こてと 同じ）
  },
  ninja_tabi: {
    name: '［忍｜しの］びの ［足袋｜たび］',
    maxStack: 1,
    rarity: 'legendary', // #293 試作 → NINJA-1
    category: 'armor',
    info: { use: 'こうげき から まもる（あし）', special: 'たかい ところ から おちても いたく ない', how: WEAR_HOW, buttons: ['1-9', 'right'], stats: 'armor' },
    wear: 10000,
    armor: { slot: 'legs', kind: 'fall', value: { normal: 0, ball: 0, fall: NINJA_TUNING.tabiFallCut } }, // 落ちた いたみを ぜんぶ ふせぐ（どんな 高さより 大きい 数）
  },
} satisfies Record<NinjaId, ItemDef>;
