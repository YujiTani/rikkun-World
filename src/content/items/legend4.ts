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
  // 天使の弓: 持つと 背中に 白い つばさ。空中で あと 3 回 ジャンプ・ふわふわ ゆっくり おちる・着地しても いたく ない。や は ふつうの 放物線
  tenshi_yumi: {
    name: '［天使｜てんし］の［弓｜ゆみ］',
    zukan: '［空｜そら］の ずっと ［上｜うえ］、［雲｜くも］の ［国｜くに］に すむ てんしが もって いた ［弓｜ゆみ］。エンジェルアロー とも よばれる。もつと せなかに ［白｜しろ］い ［羽｜はね］が はえて、［空｜そら］の ［上｜うえ］でも なんども ジャンプが できる。おちる ときは ［羽｜はね］の ように ふわふわ ゆっくりで、［高｜たか］い ところから おりても へっちゃら。［矢｜や］の とおった あとに ［白｜しろ］い ［羽｜はね］が まう とき、もう ようかいに かちめは ない。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'weapon',
    info: {
      use: 'や を とばして とおく の ようかい を たおす。や が いる',
      special: 'せなか に つばさ が はえて、ふわふわ とべる ように なる',
      how: BOW_HOW,
      buttons: ['1-9', 'left'],
      stats: 'bow',
    },
    wear: 10000,
    // や の つよさ [3, 5, 7]（まっすぐ とぶ 距離は なし = ふつうの 放物線）。空中ジャンプ・ゆっくり 落ちる・着地ダメージ なしは player/tenshiMove.ts
    bow: { damage: LEGEND4_TUNING.tenshi.damage },
    // power は 刀の 表の 形を そろえる ための 値（ゆみは や の つよさを 使う ので 使われない）。passive なし
    legend: {
      power: LEGEND4_TUNING.tenshi.damage[2],
      charge: null,
      onAttack: [],
      passive: [],
    },
  },
  // ノームの斧: おのと 同じに 木を きり、きれた 上の まるたも いっしょに きる。妖怪には よこなぎ（前の 扇に 7）
  gnome_axe: {
    name: 'ノームの［斧｜おの］',
    zukan: 'ノームは ［森｜もり］の ［木｜き］の ねもとに すむ ［小｜ちい］さな ［小人｜こびと］。［小｜ちい］さいけれど ［力｜ちから］もちで、［大｜おお］きな ［木｜き］も あっと いう ［間｜ま］に きって しまう。この おのは ノームの たからもの。［木｜き］を きると、［上｜うえ］の ［木｜き］も いっしょに きれる。よこに ひとふり すれば、まわりの ようかいも まとめて なぎはらう。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'weapon',
    info: {
      use: 'き を はやく きれる。ようかい も たたける',
      special: 'き を きれば 2 だん いっきに まっぷたつ！ よこなぎ で ようかい を なぎはらう',
      how: 'えらんで、ブロック に むけて ひだりクリック を おしつづける。ようかい に むけて ひだりクリック で よこに ふる',
      buttons: ['1-9', 'leftHold'],
      stats: 'pickaxe',
    },
    wear: 10000,
    // ほる 強さ・レベル・あう なかま（き）は てつの おのと 同じ。たたく 強さ = よこなぎの ダメージ
    tool: { power: LEGEND4_TUNING.gnome.digPower, level: LEGEND4_TUNING.gnome.digLevel, family: 'log', damage: LEGEND4_TUNING.gnome.damage },
    // ためわざ なし・ずっと 効く 力 なし（power は 刀の 表の 形を そろえる ための 値）
    legend: { power: LEGEND4_TUNING.gnome.damage, charge: null, onAttack: [], passive: [] },
  },
  // 大地のハンマー: ゆっくり おもく ふりおろして 前の 土や 石を いっぺんに くだく。空中で 押すと まっすぐ 急降下
  daichi_hammer: {
    name: '［大地｜だいち］のハンマー',
    zukan:
      '［大地｜だいち］の ［力｜ちから］が ぎゅっと つまった、おもい おもい ハンマー。ふりおろすと じめんが われて、ねらった ところの まわりの ［土｜つち］や ［石｜いし］が いっぺんに くだける。［空｜そら］から とびおりて たたきつけると、［高｜たか］い ところから ほど ［強｜つよ］く なる。ふるのは ゆっくり。けれど その いちげきは、どんな ようかいも ふきとばす。',
    maxStack: 1,
    rarity: 'legendary', // 7 段目
    category: 'weapon',
    info: {
      use: 'ようかい を つよく たたく。ねらった ところ の まわり の つち や いし も こわす',
      special: 'だいち を くだく いちげき！ ジャンプ こうげき は はかいりょく ばつぐん',
      how: 'えらんで、ようかい に むけて ひだりクリック。そら で ふると まっすぐ おちて たたきつける',
      buttons: ['1-9', 'left'],
      stats: 'hammer',
    },
    wear: 10000,
    // 歩けない（moveMul 0）のは 振って いる 間だけ。手に 持って いる 間の 速さは ふつう。power は 刀の 表の 形を そろえる ための 値（使われない）
    legend: {
      power: LEGEND4_TUNING.daichi.damage,
      charge: null,
      onAttack: [],
      passive: [],
    },
  },
} satisfies Record<Legend4Id, ItemDef>;
