import type { ItemId } from '../../contracts';

/**
 * TOWN-1 1E の 数の 表（かえりの おふだ・かじやさん・かいとりの やたい・食事。docs/design/TOWN-1-shop.md §4.7〜§4.10。数は ここ 1 か所。#304・#311）。
 * テスト・画面・窓口は ここを 読む。数の 1 つ 1 つは【PO 案】。何も import しない 葉（型だけ）。
 */

/** かえりの おふだ（§4.7） */
export const OFUDA_TUNING = {
  /** ため（つかって から うつる まで。ステップ ＝ 1/60 秒。うごいても・たたかれても やめない） */
  chargeSteps: 60,
  /** もどる 所を さがす はんい（ひろば〔`town.info().plaza`〕から 水平に。マス。この きょりより 内がわ だけ） */
  searchRadius: 8,
  /** もどる 所を さがす 高さの はば（ひろばの 足もとの 高さから 上下に。マス。ふんすいの 段など） */
  searchRise: 2,
  /** ため の 間の 光の つぶを 出す 間かく（ステップ） */
  sparkEvery: 6,
  /** 1 回に 出す 光の つぶ（こ） */
  sparkCount: 3,
  /** 光の つぶの 色（0xRRGGBB。やさしい 金色） */
  sparkHex: 0xfff2a8,
  /** うつった ときの 光の つぶ（こ） */
  arriveCount: 14,
} as const;

/** かじやさんの ねだん（§4.8。めずらしさの ★ の 数 → ようかいダマ。1 回で たいきゅう まんたん。どれだけ へって いても 同じ） */
export const SMITH_PRICE = {
  /** ★1 ノーマル（ようかいダマ 2） */
  1: 2,
  /** ★2（ようかいダマ 3） */
  2: 3,
  /** ★3（ようかいダマ 5） */
  3: 5,
  /** ★4（ようかいダマ 8） */
  4: 8,
  /** ★5（ようかいダマ 12） */
  5: 12,
  /** ★6（ようかいダマ 20） */
  6: 20,
  /** ★7 レジェンダリー（ようかいダマ 30。たいきゅう 10000 でも 同じ） */
  7: 30,
} as const satisfies Record<1 | 2 | 3 | 4 | 5 | 6 | 7, number>;

export const SMITH_TUNING = {
  /** なおした ときの トンカン（かじやさんの うでが はやく うごく 長さ。ステップ） */
  hammerSteps: 60,
  /** ふだんの つちを ふる 間かく（ステップ。ときどき かなとこを たたく） */
  idleEvery: 150,
  /** 1 回 たたく 長さ（ステップ） */
  swingSteps: 24,
  /** 炉の 火が ぼっと 大きく なる ときの 火の つぶ（こ）と 色（0xRRGGBB） */
  flameCount: 18,
  flameHex: 0xff8a2a,
} as const;

/** かいとりの やたいの 1 行（わたす 物・その 数 → ようかいダマ 1） */
export interface KaitoriRow {
  item: ItemId;
  /** 1 組で わたす 数（こ）。1 組で ようかいダマ 1 */
  need: number;
}

/** かいとりの やたいの 表（§4.9。ならびは 画面の カードの 順。1 組 ＝ ようかいダマ 1） */
export const KAITORI_ROWS = [
  /** トマト 10 こ → ようかいダマ 1 */
  { item: 'tomato', need: 10 },
  /** かぼちゃ 10 こ → ようかいダマ 1 */
  { item: 'pumpkin', need: 10 },
  /** たまねぎ 10 こ → ようかいダマ 1 */
  { item: 'onion', need: 10 },
  /** なす 10 こ → ようかいダマ 1 */
  { item: 'eggplant', need: 10 },
  /** にわとりの たまご 4 こ → ようかいダマ 1 */
  { item: 'egg', need: 4 },
  /** てつの こうせき 4 こ → ようかいダマ 1 */
  { item: 'iron_ore', need: 4 },
  /** きんの こうせき 2 こ → ようかいダマ 1 */
  { item: 'kin_ore', need: 2 },
  /** すいしょう 1 こ → ようかいダマ 1 */
  { item: 'crystal', need: 1 },
] as const satisfies readonly KaitoriRow[];

export const KAITORI_TUNING = {
  /** 1 日に もらえる ようかいダマの 上限（人ごと。こ。ゲームの 1 日 ＝ つぎの ひるの はじめまで） */
  dailyCap: 5,
} as const;

/** 食事の しゅるい（だんごの やたい・ごはんの やたい） */
export type FoodKind = 'dango' | 'gohan';

export interface FoodRow {
  /** ねだん（ようかいダマ 何こ） */
  price: number;
  /** ふえる 体力（ハート 半分 ＝ 1）。'full' ＝ その 人の いちばん 多い 体力まで */
  heal: number | 'full';
}

/** やたいの 食事（§4.10。回復の 数は オーナー確認） */
export const FOOD_TABLE = {
  /** だんご: ようかいダマ 1・体力 ＋6（ハート 3 こ。まんたんを こえる 分は すてる） */
  dango: { price: 1, heal: 6 },
  /** ごはん: ようかいダマ 3・体力 まんたん */
  gohan: { price: 3, heal: 'full' },
} as const satisfies Record<FoodKind, FoodRow>;

export const FOOD_TUNING = {
  /** その 場で もぐもぐ する 長さ（ステップ。0.5 秒。この あと 体力が ふえはじめる） */
  munchSteps: 30,
  /** ハートが 1 こずつ ぽん ぽん と ふえる 間かく（ステップ） */
  popEvery: 4,
  /** 1 回の ぽんで ふえる 体力（ハート 1 こ ＝ 2） */
  popHp: 2,
} as const;

/** 画面を とじた あとの ふきだしを 出して おく 長さ（ステップ。よろずやと 同じ 2 秒） */
export const VENDOR_SAY_STEPS = 120;
