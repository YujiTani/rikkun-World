import type { BlockId } from '../../contracts';
import { magmaAmount, magmaId } from './magma';
import { WATER_PASS_MAX, WATER_SEARCH, WATER_TICK_STEPS, waterAmount, waterId } from './water';

/**
 * WATERFALL-1 §4.1: 液体の 種類の 表（1 か所。#304）。水は WATER-1 の 値の まま、マグマは おそく・せまく 流れる。
 * 流れの きまり（落ちる → 低い 所 → ならす）は 同じ（world/water/liquidCore.ts）。
 */
export interface LiquidKind {
  readonly name: 'water' | 'magma';
  /** 計算する 間かく（ステップ。60 = 1 秒） */
  readonly tickSteps: number;
  /** 低い 所を さがす 横の きょり（マス） */
  readonly search: number;
  /** 1 パスで 計算する マスの 上限 */
  readonly passMax: number;
  /** 番号 → 量 0〜8（この 液体で なければ 0） */
  amount(index: number): number;
  /** 量 0〜8 → id（0 = air） */
  id(n: number): BlockId;
}

export const LIQUID_KINDS: Readonly<Record<'water' | 'magma', LiquidKind>> = {
  water: { name: 'water', tickSteps: WATER_TICK_STEPS, search: WATER_SEARCH, passMax: WATER_PASS_MAX, amount: waterAmount, id: waterId },
  // マグマ: 3 倍 おそい（0.75 秒に 1 パス）・横は 2 マスまで さがす
  magma: { name: 'magma', tickSteps: 45, search: 2, passMax: 256, amount: magmaAmount, id: magmaId },
};

/** WATERFALL-1 §4.2: わきみず・たきつぼの 数（1 か所） */
export const SPRING_TUNING = {
  /** わきみずが 1 つぶ 出す 間かく（ステップ。水の パスと 同じ 0.25 秒） */
  waterEvery: WATER_TICK_STEPS,
  /** マグマの わきみずが 1 つぶ 出す 間かく（マグマの パスと 同じ） */
  magmaEvery: 45,
  /** 水が 床に 落ちて いる とき、1 回（1 つぶ）ごとに たきつぼが できる 確率 */
  takiChance: 0.05,
  /** たきつぼが できる 前に 出す 最低の つぶの 数 = 列の 高さ ＋ これ（まわる 水が 列を うめて、たきつぼの 上に 1 マスぶん のこる） */
  minPool: 8,
  /** わきみずの 出口から 下へ たどる 長さの 上限（マス。これより 深い 床には たきつぼが できない・つながらない） */
  takiReach: 32,
  /** MAGMA-SPAWN: プレイヤーから この 距離（チェビシェフ、マス）より 遠い わきみずは 休む（自然の 滝が 遠くで ずっと 仕事を しない） */
  activeRadius: 32,
  /** たきつぼに なれる 床（自然の 地面だけ。家・家具・鉱石は ならない） */
  takiFloor: ['grass', 'dirt', 'stone', 'sand', 'snow', 'nendo', 'sekkaiseki', 'katame_tsuchi'] as readonly BlockId[],
} as const;

/** WATERFALL-1 §4.4: マグマの あぶない きまり（1 か所） */
export const MAGMA_TUNING = {
  /** 光の 強さ（0〜15） */
  light: 12,
  /** 体が マグマに ふれて いる あいだ、この ステップごとに 受ける ダメージ */
  hurtEvery: 30,
  hurtAmount: 1,
  /** ゆらめきの はばの 倍率（水 = 1）と 速さの 倍率（ゆっくり） */
  waveAmpMul: 0.6,
  waveSpeedMul: 0.35,
  /** 版 2: 煮えたぎる（ボコボコ） マグマの マスの 割合と、コマの 速さ（コマ / 秒。4 コマ） */
  boilChance: 0.15,
  boilFps: 5,
  /** 版 2: マグマに ふれた 固い ブロックが 焼ける（こげた ブロック）。burnEvery ステップごとに 1 マスずつ 確率 burnChance（シード つき） */
  burnEvery: 60,
  burnChance: 0.08,
  /** 焼けない: こくようせき・こげた ブロック・わきみず 2 つ・たきつぼ（と こわれない・固くない ブロック） */
  burnSkip: ['kokuyouseki', 'kogeta', 'wakimizu', 'magma_wakimizu', 'takitsubo'] as readonly BlockId[],
  /** こげた ブロックに ふれて いる（足もと・体の となり）あいだ この ステップごとに ダメージ */
  scorchHurtEvery: 60,
  scorchHurtAmount: 1,
} as const;

/**
 * 版 2: その マスの マグマが 煮えたぎる 見た目か。世界の 座標だけの まぜあわせ（決まった 塩）で 決める → 量が かわっても・流れても
 * 同じ マスなら 同じ。読み直しても 同じ。描く 所だけが 見る（量・流れ・水との 反応・ダメージは ふつうの マグマと 同じ）
 */
export function magmaBoilsAt(x: number, y: number, z: number): boolean {
  let h = 0x6a09e667;
  for (const v of [x, y, z]) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return h / 4294967296 < MAGMA_TUNING.boilChance;
}

/** 番号で 液体（水・マグマ）か。描く・光・当たりで 水と 同じ あつかいを する 所が 使う */
export function isLiquidIndex(index: number): boolean {
  return waterAmount(index) > 0 || magmaAmount(index) > 0;
}

/** 番号 index と 同じ 種類の 液体の 量を はかる 関数（液体で なければ 水の 関数） */
export function liquidAmountOf(index: number): (i: number) => number {
  return magmaAmount(index) > 0 ? magmaAmount : waterAmount;
}
