import type { MineLayerId } from './mineConfig';

/**
 * ほらあなの 種類（MINE-1D。docs/design/MINE-1.md §4.7）の 数の 表。ここだけで 変えられる ように する（#304）。
 * 長さの 単位は ブロック（マス）。【PO 案】の 数は オーナー確認で 直して よい。
 */

export type CaveKind = 'hiroi' | 'shonyudo' | 'chiteiko' | 'hotaru' | 'suisho';
export const CAVE_KIND_LIST = ['hiroi', 'shonyudo', 'chiteiko', 'hotaru', 'suisho'] as const satisfies readonly CaveKind[];
export const CAVE_LAYERS = ['asai', 'nakahodo', 'fukai'] as const satisfies readonly MineLayerId[];

type Span = readonly [number, number];
export interface CaveKindSpec {
  /** この 種類が 出る 層 */
  layers: readonly MineLayerId[];
  /** 計画の 箱の 横 × 横 × 高さ（マス） */
  x: Span;
  z: Span;
  y: Span;
}

export const CAVE_CONFIG = {
  /** 区画の 1 辺（マス）と、部屋が 区画の ふちから あける ゆとり（マス） */
  region: 64,
  edge: 4,
  /** 区画 × 層の 抽選（わりあい 0〜1。§4.7.1） */
  rolls: {
    asai: { hiroi: 0.2, chiteiko: 0.15 },
    nakahodo: { hiroi: 0.15, shonyudo: 0.15, hotaru: 0.15 },
    fukai: { suisho: 0.04 },
  } satisfies Record<MineLayerId, Partial<Record<CaveKind, number>>>,
  /** 坑道の 横穴 1 本ごとの つなぐ 表（§4.7.5）。chance ＝ 当たる わりあい、kinds ＝ 当たりの 中の 比、minPlaced ＝ 当たりの うち 部屋が 入って 'heya' に なる わりあいの 下限（0〜1。D14） */
  link: {
    asai: { chance: 1 / 4, kinds: { hiroi: 4 / 7, chiteiko: 3 / 7 }, minPlaced: 0.7 },
    nakahodo: { chance: 1 / 4, kinds: { hiroi: 1 / 3, shonyudo: 1 / 3, hotaru: 1 / 3 }, minPlaced: 0.7 },
    fukai: { chance: 1 / 20, kinds: { suisho: 1 }, minPlaced: 0.7 },
  } satisfies Record<MineLayerId, { chance: number; kinds: Partial<Record<CaveKind, number>>; minPlaced: number }>,
  /** 種類ごとの 層と 大きさ（§4.7.2） */
  kinds: {
    // y は 2 つの 層を あわせた はんい。層ごとの 高さは hiroiTable().layers〔1 か所〕
    hiroi: { layers: ['asai', 'nakahodo'], x: [24, 36], z: [24, 36], y: [10, 18] },
    shonyudo: { layers: ['nakahodo'], x: [16, 24], z: [16, 24], y: [7, 10] },
    chiteiko: { layers: ['asai'], x: [20, 28], z: [20, 28], y: [6, 9] },
    hotaru: { layers: ['nakahodo'], x: [14, 20], z: [14, 20], y: [5, 7] },
    suisho: { layers: ['fukai'], x: [10, 16], z: [10, 16], y: [6, 9] },
  } satisfies Record<CaveKind, CaveKindSpec>,
  /** 中身の きまり（§4.7.2 の 表。【PO 案】の 数） */
  rules: {
    hiroi: { wallOreTimes: 2, ironMin: 10 },
    shonyudo: { tsuraraMin: 12, sekkaisekiShare: 0.4 },
    chiteiko: { pondWidth: [10, 16] as Span, pondDepth: [1, 2] as Span, nendoMin: 30 },
    hotaru: { visible: [24, 32] as Span },
    suisho: { visible: [16, 24] as Span },
  },
  /** 天井から 地面まで あける マス（地上・海の 下。§4.7.3 の 3） */
  roof: { ground: 8, sea: 10 },
  /** 部屋の 空気の ふちの 天井の 高さの 下限（マス。立てる マスの 足から 上 4 マス ＋ 1） */
  edgeCeil: 5,
  /** しょうにゅうどう: つららの 数（こ）。下限 12 に ゆとり */
  tsuraraCount: [14, 20] as Span,
  /** しょうにゅうどう: かべ・天井の せっかいせきの わりあい（0〜1）。下限 0.4 に ゆとり */
  sekkaisekiShare: 0.62,
  /** ちていこ: 池の まわりの 岸の はば（マス）の 下限 */
  bankMin: 2,
  /** 部屋の 場所を ためす 回数（回）。出口の ある 場所を 先に さがす */
  placeTries: 30,
  /** 出口の 外を 歩ける 歩数（歩）の 下限（§4.7.3 の 5） */
  exitOutside: 4,
  /** 出口の 外を さがす 打ちきり（マス数） */
  walkLimit: 150,
  /** 陸の わりあいを はかる 点の 数（1 辺） */
  landSamples: 8,
  /** ほかの 物（坑道・同じ 区画の 別の 層の 部屋）と あける きょり（マス） */
  gap: 6,
  /** 区画の 計画を おぼえる 数の 上限（区画） */
  regionCap: 600,
} as const;
