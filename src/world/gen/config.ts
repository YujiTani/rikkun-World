/** 島生成の数値（M1-01 第 3 版 §4）。ここだけで変えられるようにする。 */
export const GEN_CONFIG = {
  /** ふだんのシード（4-9） */
  defaultSeed: 20261012,

  /** 島の中心の列（4-1） */
  centerX: 32,
  centerZ: 32,

  /** 海の列の高さ h（海の底） */
  seaH: 6,
  /** 浜の高さ h */
  beachH: 7,
  /** 海の水が入る y */
  waterY: 7,
  /** 陸の高さの上限 */
  landMaxH: 15,

  /** 島の半径 = mean + 3 つの波の合計（合計の最大 1.8）。陸の列数 1,200〜1,900 に収まる範囲 */
  radiusMean: 22.5,
  radiusWobble: [0.9, 0.6, 0.3] as readonly number[],

  /** スタートの平らな所（中心から ±2 = 5×5）と、その高さ H0 の選び方 */
  plateauHalf: 2,
  plateauHeightMin: 10,
  plateauHeightChoices: 3,
  /** 平らな所以外の地面の高さの上限 = H0 + この値（岩山を除く。岩山への見通しのため） */
  terrainOverPlateau: 1,

  /** 岩山（4-4） */
  mountain: {
    cxMin: 31,
    cxMax: 33,
    czMin: 18,
    czMax: 22,
    radiusMin: 3.5,
    radiusMax: 4.5,
    /** 頂上は H0 + (2 か 3) */
    peakOverPlateauMin: 2,
    peakOverPlateauMax: 3,
    /** 見えるせきたんの数 */
    visibleCoal: 6,
    /** せきたんの最大 y（4-6） */
    coalMaxY: 14,
  },

  /** 木（4-5） */
  trees: {
    countMin: 14,
    countMax: 18,
    maxDistance: 18,
    nearDistance: 12,
    nearMin: 3,
    /** みき同士の間かく（x・z どちらかがこの値以上） */
    spacing: 4,
    trunkMin: 4,
    trunkMax: 5,
    /** 見える木の候補: |x-32| がこの値以上 */
    visibleMinDx: 7,
  },

  /** 木を置かない所（4-5）。両端をふくむ */
  noTrunkBoxes: [
    // 岩山への見通し（仕様は x=26〜38, z=12〜31。少し広めにとる）
    { x0: 26, x1: 38, z0: 10, z1: 33 },
    // スタートの近く（x=27〜37, z=27〜37）
    { x0: 27, x1: 37, z0: 27, z1: 37 },
  ] as readonly { x0: number; x1: number; z0: number; z1: number }[],

  /** 鉱石（4-6） */
  ores: {
    coal: { minY: 1, maxY: 14, clusterMin: 2, clusterMax: 5, wantAtLeast: 60 },
    iron: { minY: 1, maxY: 5, clusterMin: 2, clusterMax: 3, wantAtLeast: 24 },
    maxClusters: 4000,
  },

  /** 目の高さ（M1-02 §4.1）。見える木・岩山の見通しの判定に使う */
  eyeHeight: 1.62,
  /** 見通しの線を調べる間かく */
  rayStep: 0.05,

  /** 戻る場所（4-7） */
  spawn: { x: 32, z: 32, yawDeg: 0, pitchDeg: 0 },

  /** テストに使ってよい場所（4-11） */
  testArea: { x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: 31 },
};
