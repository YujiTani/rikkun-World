import { SEA_Y, WORLD_HEIGHT } from '../../contracts';

/** VOX-I-1: 12 の国（docs/design/VOX-I.md §2）。山でない 8 国と、山の 4 国 */
export const COUNTRY_KINDS: readonly CountryKind[] = ['harappa', 'mori', 'ookina', 'hana', 'sunahama', 'susuki', 'take', 'kappa', 'iwayama', 'tengu', 'momiji', 'yuki'];
export const MOUNTAIN_KINDS: readonly CountryKind[] = ['iwayama', 'tengu', 'momiji', 'yuki'];
export type CountryKind = 'harappa' | 'mori' | 'ookina' | 'hana' | 'sunahama' | 'susuki' | 'take' | 'kappa' | 'iwayama' | 'tengu' | 'momiji' | 'yuki';

/** 国ごとの数（VOX-I §6 の表）。高さは SEA_Y からの相対 */
export interface CountryDef {
  hillScale: number;
  hill: number;
  bump: number;
  cliff: number;
  /** 木になる区画の割合 */
  trees: number;
  /** すな にする高さ（海から これ未満だけ。なければ くさ） */
  sandBelowOnMountain?: number;
  /** ゆき にする高さ（海から これ以上は てっぺんまで ゆき） */
  snowFrom?: number;
  /** いし にする高さ（海から これ以上。なければ stoneTopFrom） */
  stoneFrom?: number;
  /** 大陸の高さを まるごと 上げ下げ（境目で まぜる） */
  landShift?: number;
  leaves?: 'momiji_leaves' | 'matsu_leaves';
  /** 見える せきたん・てつ の 倍 */
  visibleOre?: number;
  /** 木のうち 2×2 の大木の割合 */
  bigTree?: number;
  /** 1 列（16×16）の上限 */
  cap?: { trees?: number; bigTrees?: number; flower?: number; susuki?: number; take?: number };
  /** 草の上の 物の割合（1 マスあたり） */
  flower?: number;
  susuki?: number;
  take?: number;
  /** たけやぶ の道のはば */
  path?: readonly [number, number];
  /** 山の形（§3.6） */
  mountain?: { top: number; k: number; plateau: number };
  /** かっぱの ぬま: 浅い所を 持ち上げる（§3.8） */
  landFloor?: { above: number; eFrom: number; eTo: number; onlyFrom: number; taper: number; mustArea: number };
  pond?: { count: readonly [number, number]; must: number; mustArea: number; slot: number; width: readonly [number, number]; depth: readonly [number, number]; eMin: number };
  /** 小ブロックの地面のきまり */
  micro: { tuft: number; rock: number; soil: number };
}

const COUNTRIES: Readonly<Record<CountryKind, CountryDef>> = {
  harappa: { hillScale: 64, hill: 10, bump: 1.5, cliff: 0.04, trees: 0.09, micro: { tuft: 0.6, rock: 0.4, soil: 0.22 } },
  mori: { hillScale: 48, hill: 14, bump: 2, cliff: 0.08, trees: 0.6, cap: { trees: 12 }, micro: { tuft: 0.5, rock: 0.5, soil: 0.3 } },
  ookina: { hillScale: 56, hill: 10, bump: 1.5, cliff: 0.04, trees: 0.2, bigTree: 0.6, cap: { trees: 5, bigTrees: 2 }, micro: { tuft: 0.45, rock: 0.4, soil: 0.35 } },
  hana: { hillScale: 72, hill: 8, bump: 1, cliff: 0.02, trees: 0.04, flower: 0.15, cap: { flower: 40 }, micro: { tuft: 0.7, rock: 0.25, soil: 0.15 } },
  sunahama: { hillScale: 96, hill: 6, bump: 1, cliff: 0, trees: 0.01, sandBelowOnMountain: 10, landShift: -16, micro: { tuft: 0.95, rock: 0.25, soil: 0 } },
  susuki: { hillScale: 80, hill: 9, bump: 1, cliff: 0.02, trees: 0.02, susuki: 0.156, cap: { susuki: 40 }, micro: { tuft: 0.8, rock: 0.3, soil: 0.15 } },
  take: { hillScale: 56, hill: 8, bump: 1.5, cliff: 0.04, trees: 0, take: 0.23, path: [2, 3], cap: { take: 60 }, micro: { tuft: 0.7, rock: 0.3, soil: 0.35 } },
  kappa: {
    hillScale: 96, hill: 4, bump: 1, cliff: 0, trees: 0.06,
    landFloor: { above: 2, eFrom: 14, eTo: 30, onlyFrom: -4, taper: 8, mustArea: 18 },
    pond: { count: [4, 8], must: 4, mustArea: 18, slot: 9, width: [4, 7], depth: [1, 2], eMin: 30 },
    micro: { tuft: 0.45, rock: 0.2, soil: 0.4 },
  },
  iwayama: { hillScale: 40, hill: 8, bump: 2, cliff: 0.08, trees: 0.04, stoneFrom: 20, visibleOre: 3, mountain: { top: 70, k: 0.8, plateau: 3 }, micro: { tuft: 0.75, rock: 0.8, soil: 0.1 } },
  tengu: { hillScale: 40, hill: 8, bump: 2, cliff: 0.08, trees: 0.12, stoneFrom: 30, leaves: 'matsu_leaves', visibleOre: 2.5, mountain: { top: 68, k: 0.87, plateau: 1 }, micro: { tuft: 0.75, rock: 0.8, soil: 0.1 } },
  momiji: { hillScale: 48, hill: 8, bump: 2, cliff: 0.04, trees: 0.45, leaves: 'momiji_leaves', visibleOre: 1.5, mountain: { top: 64, k: 0.6, plateau: 4 }, micro: { tuft: 0.6, rock: 0.6, soil: 0.25 } },
  yuki: { hillScale: 40, hill: 8, bump: 2, cliff: 0.04, trees: 0.03, snowFrom: 40, visibleOre: 2, mountain: { top: 80, k: 0.85, plateau: 3 }, micro: { tuft: 0.9, rock: 0.7, soil: 0.05 } },
};

/** くさ・のばな の こさ（FLORA-75 §4.1。1 マスに 当たる わりあい。間隔のきまり の 前）: [くさ, のばな] */
const FLORA_RATE: Readonly<Record<CountryKind, readonly [number, number]>> = {
  harappa: [0.06, 0.02],
  mori: [0.08, 0.01],
  ookina: [0.06, 0.01],
  hana: [0.03, 0],
  sunahama: [0, 0],
  susuki: [0.02, 0],
  take: [0.03, 0],
  kappa: [0.08, 0.02],
  iwayama: [0.03, 0.01],
  tengu: [0.03, 0.01],
  momiji: [0.04, 0.01],
  yuki: [0.01, 0],
};

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
    /** 山（山の国いがい用の「高台」）: smoothstep(from, to, n(scale)) × peak × L × (1 − w) */
    mountain: { scale: 512, from: 0.62, to: 0.85, peak: 20 },
    /** でこぼこの大きさ */
    bumpScale: 16,
    /** 崖: n(scale) の順位が (1 − 割合) より上の所を step の倍数に切り下げる（L ≥ minL かつ w = 0） */
    cliff: { scale: 96, minL: 0.5, step: 3 },
    /** H のはんい */
    minAbove2: -30,
    max: 270,
  },

  /** 国（VOX-I-1。docs/design/VOX-I.md §3・§6）。升目の点・境目・はじまり・山のわく */
  biome: {
    cell: 112,
    pointMin: 28,
    pointSpan: 56,
    /** 「しめり」「でこぼこ」のノイズの格子の大きさ */
    noiseScale: 256,
    /** 境目のはば（いちばん近い 2 点の距離の差 e） */
    blend: 14,
    /** anchor から この距離以内に点がある升目は はじまりの はらっぱ */
    startForce: 80,
    /**
     * ノイズの値 → 0〜1 の順位の表（101 こ、小さい順）。シード 20261012 の 値ノイズ（subSeed 105、格子 256）を 間かく 16・4096×4096 で読み、
     * 小さい順に並べた 1% きざみ。シードで変えない。ノイズの目（105）は、3 つのシードで 8 国が 12.5% に近くなる目を えらんだ（#184-AC2）
     */
    rankTable: [
      6e-05, 0.05993, 0.08786, 0.11269, 0.13514, 0.1527, 0.16917, 0.18412, 0.1984, 0.21134, 0.22324, 0.23475, 0.24522, 0.25564, 0.26524, 0.2745, 0.28344, 0.29162, 0.30028, 0.30795,
      0.3157, 0.32364, 0.33093, 0.33836, 0.34525, 0.35289, 0.36018, 0.3673, 0.3745, 0.38147, 0.3881, 0.39457, 0.40128, 0.40812, 0.41478, 0.42119, 0.42725, 0.43393, 0.43973, 0.4456,
      0.45216, 0.45774, 0.46295, 0.46811, 0.47359, 0.47928, 0.48489, 0.49031, 0.49579, 0.50187, 0.50729, 0.51305, 0.51867, 0.5248, 0.53086, 0.53687, 0.54325, 0.5497, 0.55621, 0.56263,
      0.56876, 0.57544, 0.58189, 0.58849, 0.59522, 0.60175, 0.60864, 0.61533, 0.62234, 0.62885, 0.63519, 0.64143, 0.64841, 0.65455, 0.66072, 0.66742, 0.67423, 0.68091, 0.68823, 0.6953,
      0.70291, 0.71039, 0.71801, 0.72554, 0.73352, 0.7413, 0.74958, 0.75802, 0.76663, 0.77686, 0.78711, 0.79751, 0.80952, 0.82301, 0.83761, 0.85287, 0.8701, 0.88961, 0.91142, 0.93572,
      0.99938,
    ] as readonly number[],
    /** 山のわく: 4×4 升目に 山 1 こ。anchor が わく のまん中に来るよう 2 升目ずらす。山は 2×2 升目で、点は 2×2 のまん中から ±jitter */
    mountain: { frame: 4, shift: 2, jitter: 8, minBase: 2, roughAmp: 1, roughScale: 24, maxReach: 200 },
  },
  /** 国ごとの数（B の表） */
  countries: COUNTRIES,

  /** くさ・のばな（FLORA-75）。こさ（国ごと）と 1 列の上限 */
  flora: { rate: FLORA_RATE, capKusa: 24, capNobana: 8, startClear: 8, mouthClear: 2, rockClear: 2 },

  /**
   * 間隔のきまり（FLORA-75 §5）。割合と 大きさは ここだけ。
   * share = 場所ごとの 段（ひろい／ふつう／せまい）の 割合。noiseScale = 段を 決める ゆっくりした ノイズの 大きさ（ブロック）。
   * startWide〜startRamp = スタートから この チェビシェフきょりまでは いつも ひろい、そこから startRamp まで だんだん もとの順位に もどる
   */
  spacing: {
    share: { wide: 0.7, normal: 0.25, narrow: 0.05 },
    noiseScale: 96,
    startWide: 64,
    startRamp: 96,
    /** あき地: 区の大きさ・まん中を ふちから おく はば・段ごとの 半径 */
    clearing: { cell: 32, edge: 6, radius: { wide: 6, normal: 5, narrow: 4 } },
    /** むら（うすい所を へらす）の ノイズの大きさ */
    patchScale: 12,
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
