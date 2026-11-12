/**
 * 山の形 v2（試作。URL `?mountain=v2`）の 数の表。数は ここ 1 か所（単位は ブロック。角度は ラジアン。高さは 海から）。
 * 形の 作り方は mountainV2.ts（まとめ）・mountainV2Params.ts（山ごとの 数）・mountainV2Parts.ts（部品）。
 */

export type MountainKind = 'iwayama' | 'tengu' | 'momiji' | 'yuki';

export const TAU = Math.PI * 2;

/**
 * 種類ごとの 表面（形とは べつ）。steep = 岩に する かたむき（となりの列との高さの差）。steepSnow = 雪の ある 山で、となりの 列が これ 以上 高い（高い かべの 足もと）列は 雪が のらず 岩（段の 上面・ふちの 平らな 所には 雪が のる）。
 * snowFrom = 雪の線（海から。この 高さが 雪の 出はじめ。上へ いくほど 雪が のこる。なし = 999。のこりかたは V2_SNOW）。
 * rockFrom = これより 上（海から）は ゆるい面でも 岩（段の上の 広い 平らな所 = まわり flatR マスが 高さの差 1 以下 だけ くさ）。なし = 999。
 * rockHalf = 岩はだの 帯の はば（0 = ぜんぶ いし。大きいほど つち・せきたん が ふえる）
 */
export const V2_SURFACE = {
  iwayama: { steep: 2, steepSnow: 2, snowFrom: 999, rockFrom: 12, flatR: 3, rockHalf: 0.16 },
  tengu: { steep: 2, steepSnow: 2, snowFrom: 999, rockFrom: 999, flatR: 3, rockHalf: 0.18 },
  momiji: { steep: 4, steepSnow: 4, snowFrom: 999, rockFrom: 999, flatR: 3, rockHalf: 0.18 },
  yuki: { steep: 2, steepSnow: 8, snowFrom: 30, rockFrom: 999, flatR: 3, rockHalf: 0.18 },
} as const satisfies Record<MountainKind, { steep: number; steepSnow: number; snowFrom: number; rockFrom: number; flatR: number; rockHalf: number }>;

/**
 * 雪の まだら（ゆきやま。V2_SURFACE.snowFrom が ある 種類だけ）。高さ e = 海からの 高さ − 雪の線（線は ノイズで ±lineWobble ゆらす）。
 * 雪の のこる かくりつ: curve = [e, かくりつ] の 折れ線（線の 4 マス下で 0 → 線で 0.2 → e 25 で 0.3（下の 帯は 2〜3 割）→ e 35 で 0.65（山の 上 4〜5 割は 5〜7 割）→ e 60 で 0.92（頂上の ちかくは ほぼ ぜんぶ 白））。
 * 雪が のこる か（まだら）= ノイズ（大きな かたまり bigScale と こまかい fineScale を bigMix の わりあいで まぜる）が かくりつ + 条件 より 小さい か。
 * ノイズは 坂の 向き（8 方位）に そって 長く のばす（stretch 倍）。条件: 平ら・くぼみは のこりやすい（flat・hollow）、とがった 出っぱりは のこりにくい（bump）。
 * かたまり: となりの 4 列の「白の 元の 判定」が minWhite 未満なら 白に しない・4 列とも 白の 判定なら 白に する（作る 順に よらない）。
 * 雪が のこらない 所は 高さ rockFrom（線から）以上 = 岩、それより 下 = くさ。slopeBase = 坂の 向きを みる 距離、slopeMin = 向きを 決める 最低の 坂（これ 未満 = 向きなし）、farBelow = 線より これ 以上 低い 列は 雪の 計算を とばす（まわりに 高い かべが あっても 白に ならない 余裕）
 */
export const V2_SNOW = {
  lineWobble: 8,
  lineScale: 40,
  curve: [[-4, 0], [0, 0.25], [25, 0.4], [35, 0.9], [60, 1]] as readonly (readonly [number, number])[],
  bigScale: 16,
  fineScale: 8,
  bigMix: 0.65,
  stretch: 2.5,
  flat: 0.12,
  hollow: 0.2,
  bump: 0.12,
  bumpAt: 0.4,
  minWhite: 2,
  rockFrom: 20,
  slopeBase: 2,
  slopeMin: 0.15,
  farBelow: 25,
} as const;

/** 岩はだの 色の 帯: 横の 帯（高さ y で きまる。ほぼ 水平）の 厚み・横の 帯の わりあい（のこりは たての すじ）・たての すじの 大きさ・ノイズの 広げ具合（1 より 大きい ほど つち・せきたん が ふえる） */
export const V2_ROCK = { bandScale: 3.5, bandMix: 0.7, vertScale: 9, gain: 1.4 } as const;

/** 部品 a〜e の 強さの 下限・上限（0〜1）。順: a 段々・b 柱・c かべ・d 峰と尾根・e こぶ。山ごとの 強さを この はんいに おさめる */
type Mix = readonly [number, number, number, number, number];

export const T = {
  /** 場所ごとの 強さの 地図: ノイズの格子（マス）・地図が 低い所でも のこる ぶん・けわしさの地図の格子・けわしい 所の 判定の はば */
  map: { scale: 70, floor: 0.3, steepScale: 80, steepFrom: 0.45, steepTo: 0.7 },
  /** 高さの 折れ線の表（スプライン）: [今の 高さ ÷ 主峰, 変えたあとの 高さ ÷ 主峰]。0.5〜0.6 の あいだで 急に 立ちあがる（岩かべ）。けわしさの 地図が 高い所に だけ かける */
  spline: [
    [0, 0],
    [0.3, 0.1],
    [0.5, 0.18],
    [0.6, 0.55],
    [0.75, 0.78],
    [1, 1],
  ] as const,
  /** するどい峰の ぎざぎざ: 大きさ・ノイズの格子・かかる 高さ（主峰÷）の はば */
  jag: { amp: 6, scale: 11, from: 0.55, to: 0.8 },
  /** 種類ごとの 主峰の高さ top・すその 坂 k・てっぺんの 平ら plateau・主峰が 立つ かくりつ spire・部品の 強さの 下限 min と 上限 max */
  base: {
    iwayama: { top: 75, k: 0.8, plateau: 3, spire: 0.1, min: [0.8, 0.8, 0.6, 0, 0] as Mix, max: [1, 1, 1, 0.5, 0.1] as Mix },
    tengu: { top: 75, k: 0.9, plateau: 1, spire: 0.9, min: [0.4, 0, 0, 0.7, 0] as Mix, max: [1, 0.6, 0.5, 1, 0.3] as Mix },
    momiji: { top: 64, k: 0.6, plateau: 5, spire: 0, min: [0.4, 0, 0, 0, 0.5] as Mix, max: [0.6, 0.6, 0.8, 0.4, 1] as Mix },
    yuki: { top: 72, k: 0.75, plateau: 2, spire: 0.9, min: [0.4, 0, 0, 0.4, 0] as Mix, max: [1, 0.7, 0.8, 1, 0.4] as Mix },
  } satisfies Record<MountainKind, { top: number; k: number; plateau: number; spire: number; min: Mix; max: Mix }>,
  /**
   * 主峰（まわりより 25〜45 高い とがった 峰）: 高さの 上乗せ・すその 半径（山の すその 半径の 倍。小さく 0.2〜0.3）・
   * 尾根の 角度の はば・尾根と 尾根の あいだの へこみ（1 = へこまない）・高さの 落ちかた（べき。1 未満 = ふもとが きゅうに 立つ）・
   * 段（かた）の 高さ・縁の ゆらぎ（マス・格子）
   */
  spire: { hMin: 25, hMax: 45, footMin: 0.2, footMax: 0.3, ridgeWidth: 0.3, valley: 0.45, pow: 1, step: 6, flat: 0.12, wobble: 2, wobbleScale: 7 },
  /** 登れる道（すそ → 頂上。山を まわる らせん）: 道の 坂（1 以下）・道の はば（まん中の 平ら / まわりへ なだらかに）・点の 間かく・向きを えらぶ ために ためす 向きの 数・柱の ちかくを とおる ばつ（点 1 つ ごと）・土手（道が 地面より 高く 浮く ぶん）の 上限と、こえた ときの ばつ（1 マス あたり）・ほりこみ（地面が 道より 高い ぶん）の 1 マスあたりの 点・ただで ほれる 深さ・終わりの 地面の 高さの 許す 上限と それを こえた 1 マスあたりの ばつ・山の 高さの 段面（向きの 数・ひくい ほうから 何わりの 高さを 使うか（ためす 数種）・調べる 半径の 倍（すその 半径 ×）・坂を 見る 幅（マス））・山の 坂に 対する 道の 坂の 上限（1 未満）・らせんの はじまりの 半径 */
  path: { k: 0.6, flat: 1.5, edge: 4.5, step: 0.25, tryDirs: 72, pillarPenalty: 400, maxBank: 3, bankPenalty: 120, profAngles: 24, profQs: [0, 0.15, 0.3, 0.5] as readonly number[], cutCost: 0.2, cutFree: 6, endFree: 3, endPenalty: 100, profReach: 1.6, profSmooth: 3, maxRho: 0.95, startR: 2 },
  /** 柱の 橋（細い 岩の道）: つながる かくりつ・橋の はば（まん中の 平ら / まわりへ）・橋の 坂（1 以下）・くねり（大きさ・長さ）・さがす 長さの 上限・道に 直角に つなぐ まっすぐな 長さ */
  bridge: { chance: 0.55, flat: 1.2, edge: 2.4, k: 0.45, bend: 5, bendLen: 12, maxLen: 110, joinLen: 6 },
  /** 段の かべの 下の がれ: かべの 下 この くらいの 高さ分（坂の 何倍）・高さ 1〜2・ところどころ（ノイズの しきい）・線を くずす ゆらぎ（マス・格子） */
  rubble: { foot: 1.6, hMax: 2, over: 0.45, scale: 5, wobble: 3, wobbleScale: 7 },
  /** 高さの 上限（海から。世界の 上限 270 − 海 144 = 126 の 中） */
  maxH: 120,
  /** きょりを ゆがめる: 大きさ（マス）・ノイズの格子（マス） */
  warp: { amp: 14, scale: 48 },
  /** だ円の ひしゃげ具合の はば（1 = 円） */
  ellipse: { min: 1.0, max: 1.4 },
  /** 部品の 強さ: 強い（2〜3 こ）の 下限〜1・弱い のこりの 上限 */
  mix: { strongMin: 0.7, weakMax: 0.25, strongN0: 2, strongN1: 3 },
  /** a 段々: 平らな所の はば（2〜4 から 広場 15〜30）・かべの高さ（3〜20）・せまい段が 多くなる ぶん（2 じょう）・どの山でも 出る 最低の 強さ・強さ → 段の 出かたの 倍率（1 で ぜんぶ 段） */
  stair: { runMin: 2, runMax: 30, wallMin: 3, wallMax: 20, runPow: 2, minStrength: 0.35, gain: 2.6 },
  /** b 岩の柱: かたまり 2〜4 こ（1 かたまり 2〜5 本）・かたまりの はんい・太さ 6〜14（てっぺん 3×3 以上が 平ら）・高さ 12〜45・かたまりの 立つ きょり（頂上から）・上の細り（平らな 部分の わりあい）・断面の いびつさ（大きさ・格子）・柱が 立つ 山の 強さの 下限 */
  pillar: { clMin: 2, clMax: 4, n0: 2, n1: 5, spread: 12, wMin: 6, wMax: 14, hMin: 12, hMax: 45, from: 30, to: 75, taper: 0.7, wobble: 0.25, wobbleScale: 6, minStrength: 0.3 },
  /**
   * c 大きな垂直のかべ（山の 中で おわる 台地）: かべの高さ 40〜80・かべが ある 頂上からの きょり・かべの 長さ（山の 半径の 倍）・うしろの 台地の ふかさ（8 以上）と ゆるく おちる はば・
   * 線の くねり（大きさ・長さ）・たてのみぞ（深さ・はば）・かべの 途中の 小さな 段（はば・のこる 高さの わりあい）・はしが スパッと 切れた 垂直の 切り口で おわる かくりつ（のこりは なめらかに おちる）・山の 外へ 出ない ための 山の ふち（半径の 倍）・かべが 出る 山の 強さの 下限
   */
  wall: {
    hMin: 40,
    hMax: 80,
    distMin: 12,
    distMax: 28,
    lenMin: 0.6,
    lenMax: 1.2,
    depthMin: 14,
    depthMax: 22,
    backFade: 12,
    bend: 8,
    bendLen: 18,
    groove: 2,
    grooveScale: 3,
    ledgeW: 5,
    ledgeFrac: 0.55,
    cutChance: 0.4,
    footFrom: 0.7,
    footTo: 0.95,
    minStrength: 0.3,
  },
  /** d 峰と尾根: 尾根 3〜5・尾根の角度の はば・谷の ふかさ・谷が ふかくなる きょり・てっぺんの とがり・小さな峰 2〜4・峰の きょり・峰の さがり */
  peak: { ridgeMin: 3, ridgeMax: 5, ridgeWidth: 0.38, valleyDepth: 46, valleyFrom: 4, valleyTo: 28, tipH: 12, tipR: 16, subMin: 2, subMax: 4, subR0: 30, subR1: 60, subDrop0: 20, subDrop1: 40, subWeak: 40 },
  /** e こぶ: 2〜3 こ・ならぶ ま・こぶの高さの さがり・こぶの 坂・平ら */
  lump: { min: 2, max: 3, spacing: 46, drop: 12, k: 0.6, plateau: 5, topMul: 0.9 },
} as const;
