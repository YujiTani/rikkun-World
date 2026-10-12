/** 世界生成の数値（M5 第 2 版 §4）。ここだけで変えられるようにする。 */
export const GEN_CONFIG = {
  /** ふだんのシード（4-3） */
  defaultSeed: 20261012,

  /** 世界の中心・スタートの列（4-1） */
  centerX: 64,
  centerZ: 64,

  /** 海の列の高さ h（海の底） */
  seaH: 6,
  /** 浜の高さ h */
  beachH: 7,
  /** 海の水が入る y */
  waterY: 7,
  /** 陸の高さの上限（やま・岩山 以外） */
  landMaxH: 16,

  /** 岸（4-2）。d < R の列が陸。R は角度で少しでこぼこ */
  coast: {
    /** z < northZ の列は北側の岸 */
    northZ: 40,
    northMean: [60.8, 61.2] as readonly [number, number],
    northWobble: [0.6, 0.4] as readonly number[],
    northMin: 60,
    northMax: 62,
    otherMean: [60.6, 61.2] as readonly [number, number],
    otherWobble: [0.5, 0.3, 0.2] as readonly number[],
    otherMin: 60,
    otherMax: 62,
    /** ひらち・もり の方向は岸を遠くする（角度の範囲 度, 最小の岸） */
    farSectors: [
      { fromDeg: -22, toDeg: 24, min: 61 },
      { fromDeg: 150, toDeg: 210, min: 61 },
    ] as readonly { fromDeg: number; toDeg: number; min: number }[],
  },

  /** スタートの平らな所（中心から ±2 = 5×5）と、その高さ H0 の選び方 */
  plateauHalf: 2,
  plateauHeightMin: 10,
  plateauHeightChoices: 3,
  /** d ≤ この値の列は H0 + terrainOverPlateau 以下（岩山を除く） */
  plateauNearRadius: 16,
  terrainOverPlateau: 1,
  /** おかの外のゆるい丘が始まる d と、ふえきる幅 */
  hillStart: 18,
  hillRamp: 12,

  /** 岩山（4-2。M1-01 の位置を +32） */
  rock: {
    cxMin: 63,
    cxMax: 65,
    czMin: 50,
    czMax: 54,
    radiusMin: 3.5,
    radiusMax: 4.5,
    peakOverPlateauMin: 2,
    peakOverPlateauMax: 3,
    visibleCoal: 6,
    coalMaxY: 14,
  },

  /** やま（4-2） */
  mountain: {
    cxMin: 60,
    cxMax: 68,
    czMin: 26,
    czMax: 30,
    radius: 18,
    peakHMin: 22,
    peakHMax: 25,
    /** 頂上を選ぶ中心からの距離（仕様は 4 以内。余裕をとる） */
    peakSearchRadius: 3.5,
    /** すそ野のかたむき（1 マスで下がる高さ）。1 以下 */
    slope: 0.75,
    stoneFromH: 17,
  },

  /** もり */
  forest: { cxMin: 26, cxMax: 32, czMin: 58, czMax: 70, radius: 12, wantAtLeast: 28, wantMax: 40 },

  /** ひらち（24×20） */
  flat: { x0Min: 84, x0Max: 88, z0Min: 52, z0Max: 58, w: 24, d: 20, h: 7 },

  /** いずみ・かわ */
  spring: { czMin: 36, czMax: 40, radius: 3 },
  riverWidth: 3,

  /** くさはら・いけ */
  meadow: { cxMin: 60, cxMax: 68, czMin: 96, czMax: 100, radius: 12, hMin: 8, hMax: 11 },
  pond: { maxFromMeadowCenter: 6, radiusMin: 3, radiusMax: 4, maxFromWorldCenter: 40 },

  /** 木（4-2 の最後の文・M1-01 §4-5） */
  trees: {
    totalMin: 100,
    totalMax: 125,
    nearDistance: 12,
    nearMin: 3,
    /** みき同士の間かく（x・z どちらかがこの値以上）。もり の中どうしは forestSpacing */
    spacing: 4,
    forestSpacing: 3,
    trunkMin: 4,
    trunkMax: 5,
    /** 見える木の候補: |x-64| がこの値以上 */
    visibleMinDx: 7,
    /** ひらち から みき までの最小の間（はっぱ をかけないため） */
    flatMargin: 3,
  },

  /** 木を置かない所（4-5）。両端をふくむ */
  noTrunkBoxes: [
    { x0: 58, x1: 70, z0: 44, z1: 63 },
    { x0: 59, x1: 69, z0: 59, z1: 69 },
  ] as readonly { x0: number; x1: number; z0: number; z1: number }[],

  /** 鉱石（4-4） */
  ores: {
    coal: { minY: 1, maxY: 14, clusterMin: 2, clusterMax: 5, wantAtLeast: 500 },
    iron: { minY: 1, maxY: 5, clusterMin: 2, clusterMax: 3, wantAtLeast: 180 },
    maxClusters: 8000,
    /** やま の中 */
    mountainCoalWant: 170,
    mountainIronWant: 75,
    mountainIronMinY: 8,
    mountainIronMaxY: 20,
    mountainMinY: 8,
    /** やま の表面に見えるもの */
    mountainSurfaceCoal: 30,
    mountainSurfaceIron: 14,
  },

  /** 目の高さ（M1-02 §4.1）。見える木・岩山の見通しの判定に使う */
  eyeHeight: 1.62,
  /** 見通しの線を調べる間かく */
  rayStep: 0.05,

  /** 戻る場所（4-5） */
  spawn: { x: 64, z: 64, yawDeg: 0, pitchDeg: 0 },

  /** スタート地点のすぐ横の、こわれない たいまつ（スタートの x・z からの ずれ。高さは地面の上） */
  startTorch: { dx: 2, dz: -1 },

  /** テストに使ってよい場所（4-5） */
  testArea: { x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 47 },
};
