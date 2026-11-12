import type { BlockId } from '../../contracts';

/**
 * 水の 景色 v2（試作。URL に `?water=v2` が ある ときだけ。既定の 世界は かわらない）の 数の 表（1 か所）。
 * 滝・川・池は 山ごとに 作る。場所は (シード, 升目) の 乱数と 地形だけで 決まる（国だけの 物と 同じ。作る 順に 関係ない）。
 *
 * しくみ（水は 1 マス 8 つぶで 量が 保たれる。生成した 水は ねむって いる = 計算に のらない）:
 *   ・滝・川の 段差 = 「わきどころ（水源）」を へりの 上に、落ちた 先の 底に 「たきつぼ」。つながると 池の 水を 1 つぶ ぬいて 出口に 出す（量が かわらない）ので ずっと 流れる。
 *   ・池・川の 水面は 平ら。生成の とき 外へ もれる 所は ない（岸・へりを ふさぐ）ので 動かない。
 */

/** `?water=v2` か（Node の テストでは location が ないので false。テストは vi.mock で 差しかえる） */
export const WATER_V2: boolean = typeof location !== 'undefined' && typeof location.search === 'string' && new URLSearchParams(location.search).get('water') === 'v2';

/** 滝つぼ・川・池に 使う ブロックの 名前（id の 直書きを ここに あつめる） */
export const WATER_BLOCKS = {
  water: 'water' as BlockId,
  spring: 'wakimizu' as BlockId,
  pit: 'takitsubo' as BlockId,
  air: 'air' as BlockId,
  /** 川ぞこ・池の 底（じゃりの かわり: すな・あらいし・こけの あらいし） */
  bed: ['sand', 'ara_ishi', 'sand', 'koke_ara_ishi'] as readonly BlockId[],
  /** 滝つぼ・川の 岸の いし（あらいし・こけの あらいし・いし の ふんいき。いしは 地面の 高さを かえる ので あらいしの なかまだけ） */
  rim: ['ara_ishi', 'koke_ara_ishi', 'ara_ishi', 'koke_ara_ishi', 'koke_ishi'] as readonly BlockId[],
  /** 浅瀬の すな（ふちの ところどころ） */
  shore: 'sand' as BlockId,
  /** 池の ふち（いしれんがも まぜる） */
  pondRim: ['ara_ishi', 'koke_ara_ishi', 'renga_ishi', 'koke_renga_ishi', 'ara_ishi'] as readonly BlockId[],
  /** うめる ブロック（あらいし。いし・つちは 地面の 高さを 変えた ことに なる ので 使わない） */
  fill: 'ara_ishi' as BlockId,
  /** もみじやまの 池の 岸 */
  ochiba: 'ochiba' as BlockId,
  /** 岸に 草・花を 置く 地面（くさの ブロック） */
  grassTop: 'grass' as BlockId,
  /** 岸の 草・花 */
  grass: 'kusa' as BlockId,
  flowers: ['flower_y', 'flower_o', 'flower_p'] as readonly BlockId[],
} as const;

/** 数の 表（単位は ブロック／マス。ことわりが ない 数は ブロックの 数） */
export const WATER_TUNE = {
  /** 山の 点から この きょり（チェビシェフ）の 中に だけ 置く（国だけの 物を さがす はんいにも 使う） */
  reach: 110,
  /** 1 つの 山に 置く 滝の 数 0・1・2 本の 確率（足して 1。シードで 決まる） */
  fallCount: [0.1, 0.55, 0.35] as const,
  fall: {
    /** 落差（へりの 地面 − 滝つぼの 地面）の 下限と 上限（落ちる 長さは わきどころが とどく 32 まで） */
    drop: [8, 28] as const,
    /** 落差が この 以上の かべを 先に えらぶ（大きな かべ） */
    bigDrop: 12,
    /** 大きな かべの 点数の おまけ */
    bigBonus: 30,
    /** はば（わきどころの 数）の 候補 */
    width: [3, 5] as const,
    /** へりの 列どうし・落ちる 先の 列どうしの 高さの 差の 上限 */
    flat: 2,
    /** 滝つぼ: 半径 4.5〜7.5（直径 9〜15。ふちは いびつ）・まん中の ふかさ 2〜4 */
    poolRadius: [4.5, 7.5] as const, // 入らない ときは 半径 3.5 まで 小さく する
    poolDepth: [2, 4] as const,
    /** 滝つぼの まわりで 地面が 水面より 高くて けずる 上限・ひくくて うめる 上限 */
    poolCut: 4,
    poolFill: 5,
    /** 上の 水源の 池: へりの うしろへ 3 マス・ふかさ 2・まわりの 地面の 高さの ゆるし（水面から） */
    sourceDepth: 2,
    sourceRows: 3,
    sourceSlack: [-3, 3] as const,
    /** さがす とき 山の 点から の はんい と、ほかの 滝の へりから はなす きょり */
    search: 62,
    apart: 20,
    /** 乱数の 順に 試して、そのうち 落差の 大きい 方を 選ぶ 候補の 数 */
    pick: 12,
    /** 川の 長さ（マス）が これ まで 長い ほど 先に えらぶ */
    riverGoal: 40,
    /** 川の 長さ（マス。滝つぼの 中も 数える）の 下限（0 = みじかくても 滝つぼで 終わって よい） */
    riverMin: 0,
  },
  /** 段々の 滝: 落差が min 以上の かべは 段に わける（段の 落差 stageMin〜 、段の 数は 2〜maxStages）。たな（たまり）の 半径・ふかさ・落ち口の よこずらし（±shift）・ためす 回数 */
  tier: { min: 10, maxStages: 4, stageMin: 5, shelfRadius: [3, 4] as const, shelfDepth: [1, 2] as const, shift: 4, attempts: 8, walk: 14, apart: 1.9 },
  river: {
    /** 川の はば（2 か 3）・ふかさ（1〜2） */
    /** 上流の はば（下流ほど 広がる: widen マスごとに 1 ずつ、最大 maxWidth）・ふかさ */
    width: 2,
    widen: 25,
    maxWidth: 5,
    depth: [1, 2] as const,
    /** 長さの 上限（マス）・まっすぐ 進む 最低の 長さ（ジグザグ どめ）・1 回の 段差の 上限（これより 深く 落ちる 所では 川を 止める） */
    maxLen: 200,
    minLeg: 4,
    /** 段差（小さな 滝）を 作れる まっすぐな 長さの 下限（曲がり角の すぐ そばには 作らない） */
    minSillLeg: 3,
    maxDrop: 6,
    /** 川の 水面を 地面より 低く ほる 深さの 上限（ほりすぎの 谷に しない）・段差を まっすぐな 所に ずらす 上限 */
    maxCut: 4,
    shift: 3,
    /** 進む 向きを えらぶ とき の ぼかしの 半径（地面の 高さを ならす）・曲がる ときの ばつ（高さ 相当）・岸を うめる 数の 上限（それ以上は 止める） */
    blur: 2,
    turnCost: 0.6,
    maxFill: 500,
    /** 川の 終わりの 池の 半径（大きい 方から ためす）・まわりを うめる 数の 上限 */
    mouthRadius: [8, 6.5, 4.5, 3] as const,
    mouthFill: 5,
    /** 岸に 草・花を 置く 確率（0〜1）・そのうち 花 */
    plant: 0.35,
    flower: 0.3,
    /** 山の すそと みなす 山の すそからの 高さ（これ 以下で 川を 終える） */
    footAbove: 2,
  },
  pond: {
    /** 広場の 池の 数（1 つの 山）・半径 3.5〜6.5（直径 7〜13。ふちは いびつ）・ふかさ 1〜2 */
    count: [1, 2] as const,
    radius: [3.5, 6.5] as const,
    depth: [1, 2] as const,
    /** 山の すそ（baseHeight）より これ 以上 高い 所（段の 広場）・まわり（半径 + 2）の 高さの 差の 上限・さがす 間かく */
    above: 6,
    flat: 2,
    step: 3,
    /** ほかの 物（目じるし・滝・川）から はなす 間（足もとの 四角から） */
    gap: 2,
    /** 石どうろう（小）を 池の ふちから おく きょり */
    touro: 2,
  },
  /** 池・滝つぼの ふちの 形のゆがみ（半径の ± 割合） */
  blob: 0.28,
  /** ふちの 列の くじ: 岩を 置く 確率・すなの あさせ（のこりは そのままの 地面）・岩の 高さの 上限（だん） */
  rimRock: 0.3,
  rimSand: 0.2,
  rockHigh: 3,
  /** もみじやまの 池の 岸に おちばを しく 確率 */
  ochiba: 0.7,
} as const;
