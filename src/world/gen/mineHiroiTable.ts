import { CAVE_CONFIG } from './mineCaveConfig';

/**
 * 炭鉱 1D ひろい ほらあな B「いしの 木」の 数（docs/design/MINE-1.md §4.7.2 の B の きまり・§6.1 `hiroiTable`）。
 * ここだけで 変えられる ように する（#304: 1 つの データは 1 か所）。長さの 単位は ブロック（マス）。
 * 【PO 案: 数】は ゲームに 入れた 試作で 直して よい。「段」＝ 部屋の ひくい 床の 上の 空気の いちばん 下を 0 段目 と した 高さ。
 */

/** ためす 回数（試作の 計画 1 つで 数える。時間は はからない。§4.7.2 の B の きまり 4） */
export interface HiroiWork {
  /** 柱を 置けるか しらべた 中心の マスの のべ 数（すその はば ごと・やりなおし ごと） */
  pillarCells: number;
  /** 柱の ならべを ためした 回数の 合計（本数・すその ちがいを ぜんぶ あわせて） */
  pillarPacks: number;
  /** 天井の こぶの 場所を ためした 回数の 合計（深い こぶも ふくむ） */
  knobTries: number;
  /** 柱と こぶの ならべを やりなおした 回数 */
  layouts: number;
  /** 天井の 1 マスの とがりを ならした マスの のべ 数（ほった 形で 数える。§4.7.2 の B の きまり 2） */
  tips: number;
}

/** ひろい ほらあなの 層 */
export type HiroiLayer = 'asai' | 'nakahodo';

/** 見こみの はんい [下, 上]（0〜1） */
type Range = [number, number];

export interface HiroiTable {
  /** 床の 面で 見た たまご（楕円）の 数 */
  eggs: 2;
  /** 内がわの 床で、天井の 高さ（床から）の いちばん 高い 所と ひくい 所の 差（段）の 下限 */
  ceilSpread: number;
  /** 天井の こぶの 数（こ）の はんい */
  knobs: [number, number];
  /** 小さい 部屋の こぶの 数の 下の 限り（こ）。深い こぶ 1 こは かならず（ceilSpread の ため） */
  knobMinSmall: number;
  /** 内がわの こぶの 1 つ 以上が さがる 量（段）の 下限 ＝ その こぶの はば（マス）の 下限 */
  knobDeepMin: number;
  /** 床の こぶ（1 段 たかい マス）の わりあい（柱の 根もとの まるを のぞく 床に 対して。0〜1） */
  bumpShare: [number, number];
  /** 柱 1 本あたりの 床の ひろさ（マス）。本数 ＝ 床の マスの 数 ÷ これ を 四捨五入 */
  floorPerPillar: number;
  /** 柱の 本数（本）の はんい */
  pillars: [number, number];
  /** 層ごとの 高さ（マス。部屋の 大きさの 高さ）と、柱の 中心の 列の 天井の 高さ（床から。段）の 下限〔yuzu 2026-11-06: あさい 層は 地面が ちかく 低く する〕 */
  layers: Record<HiroiLayer, { height: [number, number]; minCeil: number }>;
  /** ためす 回数の 上の 限り。どれかに とどいたら その 部屋は 置けない */
  work: HiroiWork;
  /** すそ 1 段の わりあい（置けた 部屋の 中）と 置けない わりあい（ためした 部屋の 中）の 見こみ。small ＝ 小さい 部屋（まるめた 本数が pillars の 下の 限り 以下） */
  aim: { small: { skirtSmall: Range; unplaced: Range }; large: { skirtSmall: Range; unplaced: Range }; unplaced: Range };
  pillar: {
    /** すその 段ごとの はば（マス。下から）。1 段 ごとに 2 以上 へる */
    skirt: number[];
    /** 置けない ときの すそ（マス） */
    skirtSmall: number[];
    /** まん中の はば（マス） */
    mid: number;
    /** 天井の 2 段 下・すぐ 下の はば（マス） */
    crown: number[];
    /** すその 段の 数（段）の 上限。落ちても ハートが へらない 高さ（safeFallHeight）より 小さい */
    skirtMax: number;
    /** 1 つの 本数・すそで 柱の ならべを ためす 回数（回） */
    tries: number;
    /** 小さい 部屋の 本数の 下の 限り（本） */
    smallMin: number;
  };
  oreZone: {
    /** 柱の すその すぐ 上の みき（段の 数） */
    baseRows: number;
    /** いちばん 高い 天井（床から）の この わりあい より 上が 天井がわ */
    ceilFrom: number;
    /** 見える せきたん＋てつの この わりあい（0〜1）以上が 根もと か 天井がわ */
    share: number;
  };
}

/** 部屋の 大きさ（横 × 横。マス）の はんい。§4.7.2 の 表。高さは 層ごと〔`hiroiTable().layers`〕 */
export const HIROI_SIZE = {
  x: CAVE_CONFIG.kinds.hiroi.x,
  z: CAVE_CONFIG.kinds.hiroi.z,
} as const;

/** 試作が 使う そのほかの 数（表に ない 物。単位は 書いた とおり） */
export const HIROI_SHAPE = {
  /** 天井の 高さ（床から）の 下限（段）。たまごの ふちでも これ（立てる マスの 足から 上 4 マス ＋ 1） */
  edgeCeil: 5,
  /** 天井の こぶの はんい: 半径（マス）・さがる 量（段） */
  knobRadius: [1.8, 3.0] as readonly [number, number],
  knobDrop: [2, 4] as readonly [number, number],
  /** 内がわの こぶ（さがる 量 knobDeepMin）の 半径（マス）。はば ＝ 半径 × 2 ≥ knobDeepMin */
  knobDeepRadius: [2.4, 3.0] as readonly [number, number],
  /** こぶを つづけて この 回数 置けなかったら、それ いじょう 置かない（回数。上の 限りの 手前で 打ちきる） */
  knobGiveUp: 60,
  /** こぶの 下に のこす 空気（足から 上。段） */
  knobAirMin: 4,
  /** 柱の かんむり（いちばん 上の まる）の 半径（マス）。こぶとの きょりに つかう */
  crownHalf: 3.5,
  /** 出口: 横穴の はば・高さ・長さ（マス） */
  exitWidth: 3,
  exitHeight: 4,
  exitLength: 8,
  /** 出口の 前に 床の こぶ・柱を 置かない きょり（マス） */
  exitFront: 4,
  /** 試作の 鉱石: ほかの 面に ちらばる わりあい（0〜1）。柱の 根もと・天井がわ いがい */
  oreScatter: 0.012,
  /** 試作の 鉱石: かたまりの 区の 1 辺（マス）と、区が 鉱石に なる わりあい・せきたんの わりあい（0〜1） */
  oreCell: 3,
  oreCellShare: 0.34,
  oreCoalShare: 0.55,
  /** 柱の 根もとの みきは 細い ので、区を 小さく（マス）・当たりを 多く（0〜1）する */
  oreBaseCell: 2,
  oreBaseShare: 0.6,
} as const;

const TABLE: HiroiTable = {
  eggs: 2,
  ceilSpread: 4,
  knobs: [4, 10],
  knobMinSmall: 2,
  knobDeepMin: 4,
  bumpShare: [0.02, 0.2],
  floorPerPillar: 110,
  pillars: [4, 7],
  layers: { asai: { height: [10, 14], minCeil: 8 }, nakahodo: { height: [12, 18], minCeil: 10 } },
  work: { pillarCells: 4096, pillarPacks: 600, knobTries: 1500, layouts: 8, tips: 256 },
  aim: {
    // 仮（designer が きめる まで）: 小さい 部屋の すそ 1 段 45%・ほか 10%・置けない 全体 5%
    small: { skirtSmall: [0, 0.45], unplaced: [0, 0.05] },
    large: { skirtSmall: [0, 0.1], unplaced: [0, 0.05] },
    unplaced: [0, 0.05],
  },
  pillar: {
    skirt: [7, 5],
    skirtSmall: [5],
    mid: 3,
    crown: [5, 7],
    skirtMax: 2,
    tries: 40,
    smallMin: 3,
  },
  oreZone: { baseRows: 3, ceilFrom: 2 / 3, share: 0.7 },
};

/** 数の 表（1 か所。テストは ここから 読む） */
export function hiroiTable(): HiroiTable {
  return TABLE;
}
