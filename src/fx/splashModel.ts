/**
 * しぶき（滝つぼの 白い 水けむり）の 数・高さ・ひろがりを きめる（試作。`?water=v2` の 滝）。
 * 絵（InstancedMesh）は splashFx.ts。ここは 計算だけ（テストしやすい ように 分ける）。
 */

export const SPLASH = {
  /** 落差（マス）が これ より 小さい 滝には しぶきを 出さない */
  minDrop: 4,
  /** これ より 高い 落差は 同じ あつかい（出す 数・高さの 上限） */
  capDrop: 20,
  /** 1 か所が 1 秒に 出す つぶ の 数: 落差 minDrop のとき・落差が 1 ふえる ごとの ふえる 数（個/秒） */
  rateBase: 3,
  ratePerDrop: 0.9,
  /** 上がる 高さ（マス）: 落差 minDrop のとき・落差 1 ごと */
  riseBase: 1.2,
  risePerDrop: 0.2,
  /** 横に ひろがる 半径（マス）: 落差 minDrop のとき・落差 1 ごと */
  spreadBase: 1.2,
  spreadPerDrop: 0.12,
  /** つぶの 寿命（秒）: 落差 minDrop のとき・落差 1 ごと */
  lifeBase: 0.9,
  lifePerDrop: 0.03,
  /** つぶの 大きさ（マスの 1 辺）・うしろ 半分で 小さく なって きえる */
  size: 0.32,
  /** つぶの 数の 上限（ぜんぶの 滝を あわせて）・見える 距離（プレイヤーから、マス）・場所の 一覧を 作りなおす 間（秒） */
  maxParticles: 400,
  range: 48,
  refresh: 0.5,
  /** 上がる ときの 空気の ていこう（1 秒で のこる 速さの わりあい。ふんわり 止まる） */
  drag: 0.35,
} as const;

const clampDrop = (drop: number): number => Math.min(drop, SPLASH.capDrop);

/** 1 か所が 1 秒に 出す つぶの 数（落差 3 いかは 0） */
export function splashRate(drop: number): number {
  if (drop < SPLASH.minDrop) return 0;
  return SPLASH.rateBase + (clampDrop(drop) - SPLASH.minDrop) * SPLASH.ratePerDrop;
}

/** 上がる 高さ（マス） */
export function splashRise(drop: number): number {
  return SPLASH.riseBase + (clampDrop(drop) - SPLASH.minDrop) * SPLASH.risePerDrop;
}

/** 横の ひろがり（半径、マス） */
export function splashSpread(drop: number): number {
  return SPLASH.spreadBase + (clampDrop(drop) - SPLASH.minDrop) * SPLASH.spreadPerDrop;
}

/** つぶの 寿命（秒） */
export function splashLife(drop: number): number {
  return SPLASH.lifeBase + (clampDrop(drop) - SPLASH.minDrop) * SPLASH.lifePerDrop;
}
