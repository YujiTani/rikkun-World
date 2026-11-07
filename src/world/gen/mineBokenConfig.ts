/**
 * 坑道の 冒険（MINE-1E。docs/design/MINE-1E.md §4）の 数の 表。1 つの データは 1 か所（#304）。
 * 長さは マス・y は 足の マスの 高さ。【PO 案】の 数は オーナー確認①で 直して よい（テストは 窓口〔`shaftStyleTable()` など〕から 読む）。
 */

export type Depth = 'asai' | 'nakahodo' | 'fukai';
export type Level = 'yasashii' | 'futsu' | 'fukuzatsu';
export type DeadEndKind = 'oo' | 'naka' | 'atari' | 'hazure' | 'hibi_naka' | 'hibi_oo';
export type Span = readonly [number, number];

/** 性格の 表（§4.1） */
export const STYLE_TABLE = {
  /** ふかさ: いちばん 下の 階の 層。floors ＝ 階の 数（いちばん 下の 階を 入れる。同じ わりあい） */
  depth: [
    { id: 'fukai', chance: 0.6, floors: [3, 5] },
    { id: 'nakahodo', chance: 0.3, floors: [2, 3] },
    { id: 'asai', chance: 0.1, floors: [2, 2] },
  ] as { id: Depth; chance: number; floors: Span }[],
  /** 広さ: 坑道 ぜんぶの 箱の 1 辺（マス） */
  size: [
    { size: 64, chance: 0.25 },
    { size: 96, chance: 0.5 },
    { size: 128, chance: 0.25 },
  ] as { size: 64 | 96 | 128; chance: number }[],
  /** ふくざつさ: 階 1 つの 横穴・横穴 1 本の えだ道（本数）・えだ道の 上限・迷路の わりあいと ます数・本道の 長さ（歩数） */
  level: [
    { id: 'yasashii', chance: 0.3, sides: [0, 1], eda: [0, 1], edaMax: 2, maze: 0, mazeGrid: null, mainLength: [16, 24] },
    { id: 'futsu', chance: 0.45, sides: [1, 2], eda: [0, 1], edaMax: 5, maze: 1 / 3, mazeGrid: 4, mainLength: [16, 32] },
    { id: 'fukuzatsu', chance: 0.25, sides: [1, 3], eda: [0, 2], edaMax: 8, maze: 2 / 3, mazeGrid: 5, mainLength: [24, 40] },
  ] as { id: Level; chance: number; sides: Span; eda: Span; edaMax: number; maze: number; mazeGrid: 4 | 5 | null; mainLength: Span }[],
  /** キャンプあとが ある わりあい */
  camp: 1 / 3,
};

/** 形の 表（§4.2〜§4.8・§4.14） */
export const SHAPE_TABLE = {
  floor: {
    /** いちばん 下の 階の 足の y */
    bottomY: { asai: [98, 110], nakahodo: [56, 66], fukai: [41, 46] } as Record<Depth, Span>,
    /** となりの 階との はなれ（y の 差。さか道 2 本 いじょうで おりる ので 実際は 18 いじょう） */
    gapMin: 16,
    /** いちばん 上の 階は 入口から この 数 以上 下 */
    topBelowEntrance: 12,
    /** ひろば: はば w・おくゆき d・高さ */
    hiroba: { w: 7, d: 5, height: 4 },
    main: { width: 3, height: 4, bendsMax: 1 },
  },
  /** 横穴: 長さ（計画）・長めの 横穴の わりあいと 長さ・長めが 出る 広さ・曲がり */
  side: { length: [12, 40] as Span, longShare: 1 / 4, longLength: [41, 64] as Span, longMinSize: 96, bendsMax: 2 },
  /** えだ道: 長さ・曲がり・口の はなれ（横穴の 口・おわりから／ほかの えだ道の 口から）・むかしの わりあい・くずれた いしの わりあい（むかしの うち）・くずれた いしの 数・たいまつの 場所（口から） */
  eda: { length: [6, 16] as Span, bendsMax: 1, mouthGapSide: 4, mouthGapEda: 6, oldShare: 0.3, rubbleShare: 0.5, rubbleCells: 6, torchFrom: [2, 3] as Span },
  /** ひびの 通り道: はば・高さ・おくゆき・ひびの いしの 数・手前の たいまつの 場所と 本数 */
  hibi: { width: 1, height: 2, depth: [2, 4] as Span, cells: [4, 8] as Span, torchBefore: [2, 3] as Span, torches: 1 },
  /** 行きどまりの へや・かくしべや */
  room: { floor: 5, height: 4 },
  /** 迷路: ますの 道・かべ・高さ・分かれ目／道の 輪の 下限・行きどまり・入口まで 歩く 数の 上限・たいまつの 上限 */
  maze: { cell: 3, wall: 1, height: 4, forks: 3, loops: 1, deadEnds: [2, 4] as Span, walkMax: 60, torchMax: 16 },
  camp: { floor: 5, height: 4, mouth: 3 },
  limit: {
    torchesPerShaft: 320,
    torchesPerCol: 80,
    regionsPerCol: 4,
    workRatio: 4.8,
    newBlockIds: 10,
    totalBlockIds: 256,
    /** 計画の 仕事（ためす 回数）の 上限 */
    tries: { entrance: 400, floors: 120, sides: 1600, eda: 1600, maze: 120 },
  },
};

/** 行きどまりの くじの 表（§4.4） */
export const DEAD_END_TABLE = {
  kinds: [
    { kind: 'oo', chance: 0.1 },
    { kind: 'naka', chance: 0.2 },
    { kind: 'atari', chance: 0.4 },
    { kind: 'hazure', chance: 0.15 },
    { kind: 'hibi_naka', chance: 0.1 },
    { kind: 'hibi_oo', chance: 0.05 },
  ] as { kind: DeadEndKind; chance: number }[],
  /** あたりで 見える 鉱石の 数 */
  atariCount: [2, 4] as Span,
  /** 迷路の いちばん おくの 行きどまり: 大当たり／中あたり の わりあい */
  mazeFarthest: { oo: 1 / 3, naka: 2 / 3 },
  /** 層ごとの 鉱石: naka ＝ きらきらの へやで 見える 数（以上）・atari ＝ あたりの 鉱石の 候補・bottom ＝ いちばん 下の へやの かべ（以上） */
  ores: {
    asai: { naka: { iron_ore: 6, nendo: 4 }, atari: ['coal_ore', 'iron_ore'], bottom: { iron_ore: 8, nendo: 6 } },
    nakahodo: { naka: { iron_ore: 6, hotaruishi: 3, sekkaiseki: 3 }, atari: ['iron_ore', 'sekkaiseki'], bottom: { iron_ore: 8, hotaruishi: 4, sekkaiseki: 4 } },
    fukai: { naka: { kin_ore: 6, suisho_ore: 3 }, atari: ['iron_ore'], bottom: { kin_ore: 8, iron_ore: 4 } },
  } as Record<Depth, { naka: Record<string, number>; atari: string[]; bottom: Record<string, number> }>,
};

/** キャンプの たんすの 表（§4.8）。`drop` の items は 妖怪の ふつうの 落とし物から 作る（mineBokenCamp.ts） */
export const CAMP_TABLE = {
  rows: [
    { kind: 'pan', chance: 1, count: [1, 3] },
    { kind: 'pickaxe', chance: 0.6, count: [1, 1] },
    { kind: 'drop', chance: 0.7, count: [1, 3] },
    { kind: 'ore', chance: 0.4, count: [2, 4] },
    { kind: 'torch', chance: 0.5, count: [2, 4] },
  ] as { kind: 'pan' | 'pickaxe' | 'drop' | 'ore' | 'torch'; chance: number; count: Span }[],
  /** つるはしの のこりの たいきゅう（0〜1） */
  wear: [0.2, 0.6] as Span,
  pickaxe: { asai: 'stone_pickaxe', nakahodo: 'stone_pickaxe', fukai: 'iron_pickaxe' } as Record<Depth, string>,
  /** ほると 出る 物と 数（ふかい は きんの いし 1） */
  ores: {
    asai: [{ item: 'coal_ore', count: [2, 4] as Span }, { item: 'iron_ore', count: [2, 4] as Span }],
    nakahodo: [{ item: 'iron_ore', count: [2, 4] as Span }, { item: 'sekkaiseki', count: [2, 4] as Span }],
    fukai: [{ item: 'kin_ore', count: [1, 1] as Span }, { item: 'iron_ore', count: [2, 4] as Span }],
  } as Record<Depth, { item: string; count: Span }[]>,
};

/** つくりかたの 数（テストには 見せない。計画の 試行・間かく・たいまつ） */
export const BOKEN_TUNING = {
  /** 1 つの 入口で 計画を つくりなおす 回数 */
  attempts: 8,
  /** 1 区画で 入口の 計画に つかう 回数の 上限（c と 同じ） */
  budget: 150,
  /** 階の y を 引く 回数の 上限（1 回の 計画） */
  floorYTries: 24,
  /** さか道の 段の 数（1C と 同じ） */
  stepsMin: 8,
  stepsMax: 12,
  /** さか道の たいまつの 間かく（マス） */
  rampTorchEvery: 8,
  /** 本道・横穴の わくの 間かく（マス） */
  frameEvery: 6,
  /** わくが こわれた わく に なる わりあい（1E の 坑道の さか道・本道・横穴）・むかしの えだ道 */
  brokenFrameShare: 0.1,
  brokenFrameShareOld: 0.6,
  /** 本道から 出る 口と 口の あいだ（マス） */
  mouthGap: 6,
  /** 本道の 角・ひろばの はしから 口までの 下限（マス） */
  mouthEdge: 3,
  /** えだ道 1 本を 場所を かえて ためす 回数 */
  edaTries: 8,
  /** 本道の 出る 向きを ためす 回数・迷路／キャンプの 置き場所を ためす 回数 */
  roadTries: 6,
  roomTries: 8,
};
