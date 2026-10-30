import type { BlockId } from '../../contracts';

/**
 * 炭鉱（地下）の 数（MINE-1。docs/design/MINE-1.md）。ここだけで 変えられる ように する（#304: 1 つの データは 1 か所）。
 * 高さは ブロックの y（足の 高さ）。数は 1 列（16×16）あたり。
 *   1A: 3 つの 層（§4.1）・鉱石の 量と かたまり（§4.2）
 *   1B: 新しい 鉱物 6 つ（ねんど・せっかいせき・ほたるいし・きんの いし・すいしょうの いし・ダイヤの いし。§4.2）の 行
 *   1C〜1D: 坑道・ほらあなの 種類は ここに 足す（まだ 無い）
 */

export type MineLayerId = 'asai' | 'nakahodo' | 'fukai';

export interface MineLayerDef {
  id: MineLayerId;
  /** この 層の いちばん 下の y（マス） */
  minY: number;
  /** この 層の いちばん 上の y（マス）。null ＝ 地面まで（あさい 層） */
  maxY: number | null;
}

/** 鉱石の 量 1 行（§4.2）。どの 層の どの 鉱石が 1 列に 何こ あるか */
export interface MineOreRow {
  layer: MineLayerId;
  block: BlockId;
  /** 見える 数（こ）。地面より 下の 空気（ほらあな・口）か 水に ふれた 鉱石。テストが くらべる 目安で、置く 数には 使わない（かべに 寄せない） */
  visible: number;
  /** ぜんぶ の 数（こ）。石の 中に かくれた 物も 入れた、置く 数。かたまりの 数 ＝ これ ÷ かたまりの 平均の 大きさ */
  all: number;
  /** かたまりの 大きさの 表（なければ `cluster.sizes`）。ダイヤの いしだけ 小さい（1〜2 こ） */
  sizes?: readonly MineClusterSize[];
}

/** かたまりの 目当ての 大きさ 1 行 */
export interface MineClusterSize {
  /** 大きさ（こ） */
  size: number;
  /** わりあい（%）。ぜんぶ たすと 100 */
  percent: number;
}

/** ダイヤの いしの かたまり（§4.2）: 1 こ 60%・2 こ 40%（平均 1.4 こ）。いちばん 出にくい */
const DIAMOND_SIZES = [
  { size: 1, percent: 60 },
  { size: 2, percent: 40 },
] satisfies readonly MineClusterSize[];

export const MINE_CONFIG = {
  /**
   * 3 つの 層（§4.1）。深さだけで 決まる（場所・国に よらない）。y 0 は そこいし（層 なし）。
   * 今の 地面は ふつう y 146〜170、山は 200 を こえる。海面は 144
   */
  layers: [
    { id: 'asai', minY: 96, maxY: null },
    { id: 'nakahodo', minY: 52, maxY: 95 },
    { id: 'fukai', minY: 1, maxY: 51 },
  ] satisfies readonly MineLayerDef[],

  /**
   * 鉱石の 量（§4.2）。数は その 層の 中だけで 数えた、ふつうの 所（坑道・ほらあなの 種類が かからない 列）の 平均。
   * 山の 面の 見える 鉱石（GEN_CONFIG.ores の visibleCoal など）と はじまりの 岩山の せきたん（GEN_CONFIG.rock）は 別で、ここに 入れない。
   * 見える ÷ ぜんぶ は かたまりで 約 2.7%（表の ぜんぶ ＝ 見える ÷ 0.027）。せきたんは あさい 層だけ。
   * 1B で 足した 鉱物（ねんど・せっかいせき…）の 行は この 表の いちばん うしろ（前の 行の 乱数を ずらさない）。
   * ぜんぶ ＝ 見える ÷ 0.027（かたまりで 約 2.7%。§4.2）。★は 自分の 層だけ
   */
  ores: [
    { layer: 'asai', block: 'coal_ore', visible: 3.2, all: 119 },
    { layer: 'asai', block: 'iron_ore', visible: 0.35, all: 13 },
    { layer: 'nakahodo', block: 'iron_ore', visible: 1.1, all: 41 },
    { layer: 'fukai', block: 'iron_ore', visible: 1.1, all: 41 },
    // ---- MINE-1B（#349）
    { layer: 'asai', block: 'nendo', visible: 0.6, all: 22 },
    { layer: 'nakahodo', block: 'sekkaiseki', visible: 0.5, all: 19 },
    { layer: 'nakahodo', block: 'hotaruishi', visible: 0.3, all: 11 },
    { layer: 'fukai', block: 'kin_ore', visible: 0.2, all: 7.4 },
    { layer: 'fukai', block: 'suisho_ore', visible: 0.15, all: 5.6 },
    { layer: 'fukai', block: 'diamond_ore', visible: 0.04, all: 1.5, sizes: DIAMOND_SIZES },
  ] satisfies readonly MineOreRow[],

  /** かたまり（§4.2）。同じ 鉱石が 面で くっついた 2〜5 こ。大きい ほど 少ない */
  cluster: {
    /** 目当ての 大きさ（こ）と わりあい（%）。平均は 3.0（かたまりの 数の 計算に 使う）。ダイヤは 1〜2 こ（行の `sizes`） */
    sizes: [
      { size: 2, percent: 40 },
      { size: 3, percent: 30 },
      { size: 4, percent: 20 },
      { size: 5, percent: 10 },
    ] satisfies readonly MineClusterSize[],
    /** 1 こ目を 置く マスを えらびなおす 回数の 上限（回）。石でない マス（空気・つち・ほかの 鉱石）に 当たったら 引きなおす */
    firstTries: 24,
  },
};
