import { SEA_Y } from '../contracts';
import type { CountryKind } from '../world/gen/config';

/**
 * ゆきやまの 雪・もみじやまの 紅葉の 舞い（試作。URL `?drift=1` の ときだけ。fun.md: くり返しの 演出は はげしく しない）。
 * この ファイルは 「国・高さ・頭の上 → 出す 割合」を 決める 純粋な 計算と、数の 表だけ。
 */

/** 数と 動きの 表（1 か所） */
export const DRIFT = {
  /** 雪の つぶの 上限（こ） */
  maxSnow: 300,
  /** 紅葉の 葉の 上限（こ。雪より 少ない） */
  maxLeaf: 120,
  /** プレイヤーの まわりに 出す はんい（マス）。これより 遠くへ はなれた つぶは まわりに 出しなおす */
  radius: 22,
  /** つぶを 出す 高さ（プレイヤーの 足より 上、マス） */
  topAbove: 14,
  /** 国の 境目から この 値（e = 2 番目の 国までの 距離 − いちばん近い 国までの 距離、マス）まで 0 から なめらかに ふやす */
  edgeBlend: 10,
  /** 雪の 線（海から この 高さ ＝ yuki の snowFrom と 同じ 40 マス）。これより 上は 雪の 割合 1 */
  snowLine: 40,
  /** 雪の 線の これだけ 下から 少しずつ ふやす（マス） */
  snowBand: 14,
  /** 雪の 線の ずっと 下での 割合（0〜1） */
  snowLow: 0.4,
  /** 紅葉の 割合（0〜1。数の 上限で すでに 雪より 少ない） */
  leafBase: 0.8,
  /** 頭の 上が ふさがって いる ときの 倍率（屋根・どうくつの 中） */
  coveredK: 0.08,
  /** 雪の 落ちる 速さ（マス/秒） */
  snowFall: 1.1,
  /** 葉の 落ちる 速さ（マス/秒。雪より ゆっくり） */
  leafFall: 0.8,
  /** 横に 流れる 風の 速さ（マス/秒） */
  wind: 0.7,
  /** ゆらゆらの はば（マス）・はやさ（ラジアン/秒） */
  swayAmp: 0.45,
  swayRate: 1.3,
  /** 雪の つぶの 大きさ（1 辺、マス） */
  snowSize: 0.09,
  /** 葉の 大きさ（長い 辺・みじかい 辺・あつさ、マス） */
  leafLen: 0.22,
  leafWid: 0.15,
  leafThick: 0.03,
  /** 葉が まわる 速さ（ラジアン/秒） */
  leafSpin: 3.2,
  /** 出ない ことに なった つぶが 次に 調べなおす まで（秒、最小〜最大） */
  idleMin: 1,
  idleMax: 3,
  /** 地面へ これより みじかい ところを 落ちる つぶは 出さない（マス） */
  minFall: 2,
  /** 頭の 上を しらべる はんい（足の 上 2〜この マス）。しらべる 間かく（秒） */
  coverRange: 9,
  coverEvery: 0.25,
  /** カメラに 近い つぶは ちぢめて きえる: この 距離（マス）で 大きさ 0、ここまで 来ると 全部の 大きさ */
  nearHide: 1.2,
  nearFull: 2.8,
  /** 雪の うすい 水色（白い 地面の 上でも 見える ように 5 こに 1 こ。少し 大きい） */
  snowBlue: 0xb4d4f0,
  snowBlueEvery: 5,
  snowBlueScale: 1.6,
  /** 夜の 色の 倍率（昼 1。いまの 明るさ nightBrightness〜1 の 間を 直線で むすぶ） */
  nightTint: 0.4,
  nightBrightness: 0.25,
  /** 葉の 色（赤・だいだい・黄） */
  leafColors: [0xc8321e, 0xe0701c, 0xe8b820],
} as const;

export interface DriftDensity {
  /** 雪を 出す 割合（0〜1） */
  snow: number;
  /** 葉を 出す 割合（0〜1） */
  leaf: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};

/**
 * 国 kind・境目までの e・高さ y（ワールドの y）・頭の上が ふさがって いるか → 出す 割合。
 * 境目に 近いほど 0 へ（急に 出たり 消えたり しない）。
 */
export function driftDensity(kind: CountryKind, e: number, y: number, covered: boolean): DriftDensity {
  const edge = smooth(0, DRIFT.edgeBlend, e);
  const cover = covered ? DRIFT.coveredK : 1;
  if (kind === 'yuki') {
    const rel = y - SEA_Y;
    const k = DRIFT.snowLow + (1 - DRIFT.snowLow) * smooth(DRIFT.snowLine - DRIFT.snowBand, DRIFT.snowLine, rel);
    return { snow: k * edge * cover, leaf: 0 };
  }
  if (kind === 'momiji') return { snow: 0, leaf: DRIFT.leafBase * edge * cover };
  return { snow: 0, leaf: 0 };
}

/** 割合 → 出す 数（上限 max を こえない） */
export function driftCount(density: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(density * max)));
}

/** 今の 明るさ（time の brightness。夜 0.25〜昼 1）→ つぶの 色の 倍率（夜 0.4〜昼 1） */
export function driftTint(brightness: number): number {
  const t = (brightness - DRIFT.nightBrightness) / (1 - DRIFT.nightBrightness);
  return DRIFT.nightTint + (1 - DRIFT.nightTint) * Math.min(1, Math.max(0, t));
}

/** カメラまでの 距離 dist（マス）→ 大きさの 倍率（近いほど 小さく、nearHide 以内で 0） */
export function driftNearScale(dist: number): number {
  return smooth(DRIFT.nearHide, DRIFT.nearFull, dist);
}
