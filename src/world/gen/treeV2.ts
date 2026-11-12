import type { CountryKind } from './config';
import { LOOK } from './lookFlags';

/**
 * 木の形のバリエーション（試作。URL に ?trees=v2 を付けたときだけ）。
 * 形は (木の位置) だけで決まる → 列の境目をまたいでも切れない。数は ここの表の 1 か所。
 */

/** 木 v2 か（既定は true。URL の ?trees=v1 で 古い 木。lookFlags.ts） */
export const TREES_V2: boolean = LOOK.treesV2;

/** 大きさ: 小（今くらい）・中・大（みき 2×2） */
export type TreeSize = 's' | 'm' | 'l';
/** 形: round = まるい 広葉樹、maple = 横に広い もみじ、pine = 曲がった まつ、conifer = 細長い 円すい */
export type TreeForm = 'round' | 'maple' | 'pine' | 'conifer';

/** 国ごとの 割合（0〜1。中・大。のこりが 小）と 形 */
export interface TreeMix {
  /** 中の木（高さ 9〜12）の割合 */
  m: number;
  /** 大木（高さ 14〜20、みき 2×2）の割合。平らな 4 マスが ないと 中になる */
  l: number;
  form: TreeForm;
  /** はっぱを 変える国だけ */
  leaves?: 'matsu_leaves';
}

export const TREE_MIX: Readonly<Record<CountryKind, TreeMix>> = {
  harappa: { m: 0.35, l: 0, form: 'round' },
  mori: { m: 0.4, l: 0.15, form: 'round' },
  ookina: { m: 0.4, l: 0.2, form: 'round' },
  hana: { m: 0.3, l: 0, form: 'round' },
  sunahama: { m: 0.3, l: 0, form: 'round' },
  susuki: { m: 0.3, l: 0, form: 'round' },
  take: { m: 0.3, l: 0, form: 'round' },
  kappa: { m: 0.3, l: 0, form: 'round' },
  iwayama: { m: 0.3, l: 0, form: 'round' },
  tengu: { m: 0.45, l: 0.15, form: 'pine' },
  momiji: { m: 0.3, l: 0.1, form: 'maple' },
  yuki: { m: 0.45, l: 0.15, form: 'conifer', leaves: 'matsu_leaves' },
};

/** みきの高さ（マス）[最小, 最大]。形ごと・大きさごと */
const TREE_TRUNK: Record<TreeForm, Record<TreeSize, readonly [number, number]>> = {
  round: { s: [4, 5], m: [9, 12], l: [18, 26] },
  maple: { s: [4, 5], m: [8, 11], l: [11, 14] },
  pine: { s: [5, 6], m: [9, 12], l: [14, 18] },
  conifer: { s: [12, 14], m: [15, 17], l: [18, 20] },
};

/** はっぱの広がり（みきから 何マス。木どうしの あきの計算に使う） */
export const TREE_REACH: Record<TreeForm, Record<TreeSize, number>> = {
  round: { s: 2, m: 3, l: 5 },
  maple: { s: 2, m: 2, l: 6 },
  pine: { s: 3, m: 4, l: 5 },
  conifer: { s: 2, m: 3, l: 3 },
};

/** はっぱ・えだが みきの根もとから いちばん遠くまで出る マス（これ以上は 出ない）。列を作るとき 木を さがす はば */
export const TREE_MAX_EXTENT = 16;

/** 大きさを 決める（roll は 0〜1 の 乱数。大木に できないときは 呼ぶ側で 中にする） */
export function pickSize(mix: TreeMix, roll: number): TreeSize {
  if (roll < mix.l) return 'l';
  if (roll < mix.l + mix.m) return 'm';
  return 's';
}

/** みきの高さ（roll は 0〜1） */
export function trunkOf(form: TreeForm, size: TreeSize, roll: number): number {
  const [a, b] = TREE_TRUNK[form][size];
  return a + Math.floor(roll * (b - a + 1));
}

/** 大木は「まわりより高い所」だけ: 根もとの高さが、まわり（4 方向 PROMINENCE_DIST マス先）の へいきんより これ以上 高い */
export const PROMINENCE_MIN = 0.3;
export const PROMINENCE_DIST = 7;

/** 国ごとの 木の数の 倍（v2。もみじやまを 赤く）。木になる区画の割合（config の trees）に かける */
export const TREE_DENSITY: Partial<Record<CountryKind, number>> = { momiji: 2.4 };
