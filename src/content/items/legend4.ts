import { BOW_HOW } from './howText';
import type { Legend4Id } from './ids';
import { LEGEND4_TUNING } from './legend4Tuning';
import type { ItemDef } from './types';

/**
 * LEGEND-4: レジェンダリー武器 5 つ（docs/design/LEGEND-4.md）。PR1 = 黒龍。ほかの 4 つは それぞれの PR で ここへ 足す。
 * ヌシが おとす・宝箱に 入る（めずらしさ legendary から 自動。contracts.ts の nushiDrops・world/gen/mineChest.ts）。作れないので レシピは なし。
 * たいきゅう 10000（つくれず ヌシと 宝箱でしか 手に 入らない 武器だけの 例外。WEAPON-7 §2.4）。数は `LEGEND4_TUNING`（legend4Tuning.ts）の 1 か所。
 * 絵は ui/itemArtL4.ts（16x16）と art/icons32/（32 マス）・手に持つ 形は camera/heldL4.ts・墨の すじは fx/kokuryuInkFx.ts。
 */
export const LEGEND4 = {
  // 黒龍: や が 落ちずに まっすぐ とんで、ならんだ 妖怪を ぜんぶ つらぬく。持つと 足が はやく、ジャンプが 高い
  kokuryu: {
    name: '［黒龍｜こくりゅう］',
    zukan: 'むかし、［黒｜くろ］い ［雲｜くも］の おくに ［一｜いっ］［頭｜とう］の ［黒龍｜こくりゅう］が すんで いた。［黒龍｜こくりゅう］が すみを はいて ［空｜そら］に ［一｜いっ］［本｜ぽん］の ［線｜せん］を かくと、その ［線｜せん］が かたまって この ［弓｜ゆみ］に なったと いう。［矢｜や］は おちずに まっすぐ とんで、ならんだ ようかいを ［何｜なん］びきでも つらぬいて いく。もつ ものは ［風｜かぜ］の ように ［走｜はし］り、［空｜そら］［高｜たか］く まいあがる。くろい ［矢｜や］の まえに、にげ ばしょは ない。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'weapon',
    info: {
      use: 'や を とばして とおく の ようかい を たおす。や が いる',
      special: 'や が つよく なり、すべて を つらぬく！ もてば かぜ の ように はやく、そら たかく とべる',
      how: BOW_HOW,
      buttons: ['1-9', 'left'],
      stats: 'bow',
    },
    wear: 10000,
    // や の つよさ [4, 6, 10]・まっすぐ とぶ きょり 48 マス
    bow: { damage: LEGEND4_TUNING.kokuryu.damage, straightRange: LEGEND4_TUNING.kokuryu.range },
    // ためわざ なし・手に 持つ 間 走る 速さ 1.2 倍（風神剣と 同じ passive）。ジャンプ 2 倍は LEGEND4_TUNING.kokuryu.jumpMul（content/items/gadgetTuning.ts の jumpHeightWith が 読む）。
    // power は 刀の 表の 形を そろえる ための 値（ゆみ は や の つよさ [4, 6, 10] を 使う ので 使われない）
    legend: {
      power: LEGEND4_TUNING.kokuryu.damage[2],
      charge: null,
      onAttack: [],
      passive: [{ kind: 'moveMul', mul: LEGEND4_TUNING.kokuryu.moveMul }],
    },
  },
  // 八咫烏: ふつうの 弓と 同じ 放物線。当たった 点で むらさきの ほのおが 半径 2 に はじけ（3 ダメージ）、2 回に 1 回 矢が へらない
  yatagarasu: {
    name: '［八咫烏｜やたがらす］',
    zukan: '［八咫烏｜やたがらす］は ［足｜あし］が ［三｜さん］［本｜ぼん］ ある ［大｜おお］きな からす。むかし、［道｜みち］に まよった ［人｜ひと］たちの ［前｜まえ］を とんで、［光｜ひかり］で ［行｜い］く ［先｜さき］を おしえたと いう。その ［羽｜はね］で ［作｜つく］った この ［弓｜ゆみ］の ［矢｜や］は、［金｜きん］いろに かがやいて とび、あたると むらさきの ほのおが ぱっと ひろがる。ときには うった ［矢｜や］が ［光｜ひかり］と なって もどり、へらない ことも ある。［光｜ひかり］の みちびきは、いまも この ［弓｜ゆみ］に やどって いる。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'weapon',
    info: {
      use: 'や を とばして とおく の ようかい を たおす。や が いる',
      special: 'ひかり の や が あたると むらさき の ほのお が だいばくはつ！ ときどき や が へらない',
      how: BOW_HOW,
      buttons: ['1-9', 'left'],
      stats: 'bow',
    },
    wear: 10000,
    // や の つよさ [4, 6, 10]・ほのお あり（半径・ダメージ・くじは LEGEND4_TUNING.yatagarasu。BowSystem が yatagarasu.ts で 読む）
    bow: { damage: LEGEND4_TUNING.yatagarasu.damage, burst: true },
    // ためわざ・passive なし。power は 刀の 表の 形を そろえる ための 値（使われない）
    legend: {
      power: LEGEND4_TUNING.yatagarasu.damage[2],
      charge: null,
      onAttack: [],
      passive: [],
    },
  },
} satisfies Record<Legend4Id, ItemDef>;
