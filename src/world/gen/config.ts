import { SEA_Y, WORLD_HEIGHT } from '../../contracts';

/**
 * 世界生成の数値（VOX-B。docs/tickets/VOX-B.md の「数の表」）。ここだけで変えられるようにする。
 * 高さは SEA_Y（海面）からの相対で書く。
 */
export const GEN_CONFIG = {
  /** ふだんのシード（4-3） */
  defaultSeed: 20261012,

  /** スタートさがしの始点と、バイオームの升目の角（P1・B1） */
  anchor: { x: 64, z: 64 },

  /** 高さ H（H1〜H9） */
  height: {
    /** 大きい形（ブロック）: 大陸 c = continent512 * w512 + continent256 * w256 */
    continent: { big: 512, small: 256, bigWeight: 0.7, smallWeight: 0.3 },
    /** Hb = SEA_Y + (c − landCenter) × landScale を [SEA_Y + minAbove, SEA_Y + maxAbove] に収める */
    landCenter: 0.42,
    landScale: 86,
    minAbove: -30,
    maxAbove: 50,
    /** はじまりの土地: この距離まで SEA_Y + startAbove、そこから farRadius までなめらかにもとへ */
    startAbove: 6,
    startRadius: 48,
    farRadius: 192,
    /** 陸の重み L = clamp((Hb − SEA_Y) / landRamp, 0, 1) */
    landRamp: 24,
    /** 山: smoothstep(from, to, n(scale)) × peak × L × (1 − w) */
    mountain: { scale: 512, from: 0.62, to: 0.85, peak: 50 },
    /** でこぼこの大きさ */
    bumpScale: 16,
    /** 崖: n(scale) の順位が (1 − 割合) より上の所を step の倍数に切り下げる（L ≥ minL かつ w = 0） */
    cliff: { scale: 96, minL: 0.5, step: 3 },
    /** H のはんい */
    minAbove2: -30,
    max: 270,
  },

  /** バイオーム（B1〜B5） */
  biome: {
    cell: 128,
    pointMin: 16,
    pointSpan: 96,
    /** しめり n(384) がこれ以上なら森 */
    forestMoist: 0.56,
    noiseScale: 384,
    /** 境目のはば（いちばん近い 2 点の距離の差） */
    blend: 16,
  },
  /** 草原 / 森 の数（B の表） */
  biomes: {
    grassland: { hillScale: 64, hill: 10, bump: 1.5, cliff: 0.04, trees: 0.09 },
    forest: { hillScale: 48, hill: 14, bump: 2, cliff: 0.08, trees: 0.75 },
  },

  /** 地層 */
  strata: {
    /** H ≥ SEA_Y + この値 で つち 1 まい（それ以下は つち 2） */
    dirt1From: 50,
    /** H ≥ SEA_Y + この値 は いちばん上から いし（山の上） */
    stoneTopFrom: 70,
    /** 陸の はじまり（H ≥ SEA_Y + この値） */
    landFrom: 2,
  },

  /** 仮の海のふち（S6。読みこむところでかける） */
  edge: { deep: 4, flat: 3 },

  /** 鉱石（O1〜O5）。clusters = 1 列に置く かたまり の数 */
  ores: {
    coal: { minY: SEA_Y - 64, clusters: 8, sizeMin: 3, sizeMax: 6 },
    ironShallow: { minY: 96, maxY: SEA_Y - 8, clusters: 2, sizeMin: 2, sizeMax: 4 },
    ironDeep: { minY: 8, maxY: 95, clusters: 6, sizeMin: 2, sizeMax: 4 },
    visibleCoal: 0.04,
    visibleIron: 0.015,
    visibleIronFrom: SEA_Y + 40,
  },

  /** 洞くつ（C1〜C4） */
  caves: {
    minY: 8,
    /** 洞くつは y ≤ H − topGap（海の列は seaGap） */
    topGap: 8,
    seaGap: 10,
    /** 3D ノイズ 2 本の格子（ブロック）と、トンネルの太さ（0.5 からのずれ） */
    scaleA: [30, 18, 30] as readonly number[],
    scaleB: [26, 16, 26] as readonly number[],
    radius: 0.061,
    /** 洞くつの口: 列ごとに この割合（C4 は 1/8 だが、読みこむ範囲では 0 こになる seed があったので 1/4。VOX-B 返事に理由）。スタートから この距離（チェビシェフ）より外 */
    mouthChance: 1 / 4,
    mouthFarFromStart: 40,
    rampLength: 12,
    rampWidth: 3,
    /** さか道・へやの 空気の高さ。表（C4）は 3 だが、自動ジャンプは 足もとの上 3.05 が空いていないと 跳ばず、もどれないので 4（VOX-B 返事に理由） */
    rampHeight: 4,
    roomSize: 5,
    roomHeight: 4,
    /** 口を置くための しらべ直しの回数 */
    mouthTries: 8,
    /** 口の入り口の陸の高さ（H ≥ SEA_Y + この値） */
    mouthLandFrom: 4,
  },

  /** 木（T1〜T4） */
  trees: {
    plot: 4,
    trunkMin: 4,
    trunkMax: 5,
    /** スタートから チェビシェフ この距離以内には 木を置かない */
    startClear: 4,
    /** まわり 4 列との高さの差がこれ以上なら置かない */
    maxSlope: 2,
    /** スタートから チェビシェフ この距離以内の木は、スタートから 北・東・南・西 の道（よこ ±(corridor−1)）の上に置かない（はっぱで歩けなくならない） */
    corridorWithin: 7,
    corridor: 3,
    /** はじまりの木: スタートから チェビシェフ min〜max に count 本 */
    startMin: 5,
    startMax: 12,
    startCount: 3,
  },

  /** はじまりの岩山（P6） */
  rock: {
    dz: -12,
    jitter: 2,
    radiusMin: 3.5,
    radiusMax: 4.5,
    peakOverMin: 3,
    peakOverMax: 4,
    visibleCoal: 6,
    visibleCoalSouth: 3,
    /** 見える せきたん は 頂上から この深さまで */
    visibleDepth: 8,
  },

  /** スタート広場（P4）: 5×5 を そろえ、チェビシェフ 3〜ringMax は 1 段ずつ */
  plaza: { half: 2, ringMax: 6 },
  searchRadius: 16,
  /** 条件 P2: SEA_Y + min 〜 SEA_Y + max、5×5 の差 */
  spawnAbove: { min: 2, max: 12 },
  spawnFlat: 2,

  /** 目の高さ（M1-02 §4.1）。見える木・岩山の見通しの判定に使う */
  eyeHeight: 1.62,
  /** 見通しの線を調べる間かく */
  rayStep: 0.05,

  /** 戻る場所（4-5） */
  spawn: { yawDeg: 0, pitchDeg: 0 },

  /** スタート地点のすぐ横の、こわれない たいまつ（スタートの x・z からの ずれ。高さは 地面の上） */
  startTorch: { dx: 2, dz: -1 },

  /** テストに使ってよい場所（4-5）。y1 は 空まで */
  testArea: { x0: 0, x1: 12, z0: 0, z1: 12, y0: 8, y1: WORLD_HEIGHT - 1 },
};
