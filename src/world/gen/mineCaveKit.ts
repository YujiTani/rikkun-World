import { createMineHook } from './mineHook';
import {
  GenCols,
  SEEDS_20,
  ptKey,
  standable,
  stepTo,
  type Layer,
  type Pt,
  type Shaft,
} from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1D（docs/design/MINE-1.md §4.7・§6.1・受け入れ基準 D1〜D14）の テスト用の 道具。ゲームの 外〔テスト〕だけで 使う。
 *
 *   ・窓口 `mine.caves`・`findCave`・`caveRolls`・`caveAt`・`caveStats`・`heyaLinkTable`・`hiroiPlan`・`hiroiTable` の 型〔仕様 §6.1 の とおり〕
 *   ・部屋 1 つを ブロックで しらべる `reportRoom`〔D2〜D5〕と、しらべる ための 道さがし
 *
 * 【自分で 決めた 名前・約束】 developer は これに 合わせる〔ちがう 形に した ときは、ここ 1 か所を 直す〕:
 *   ・`Cave.box` ＝ 計画の 箱〔仕様 §4.7.2・§6.1。どの 種類も。両はし ふくむ。y0 ＝ 0 段目〕。部屋の 空気〔水を ふくむ〕は ぜんぶ この 中。`Cave.size` は この 箱の 大きさ
 *       〔x1 − x0 + 1, y1 − y0 + 1, z1 − z0 + 1〕。`center` ＝ 箱の まん中〔小数で よい〕。柱の 所の 石も 箱の 中に ある〔空気でない マスが まざる〕。空気だけの 箱では ない
 *   ・`caveAt(x, y, z)` は 部屋の **空気・水の マス**〔と 柱・こぶなど 部屋の 形の 中の 石〕で その 種類。出口の 横穴の マスは 部屋でない〔坑道の へやは 'kodo'・抽選の 部屋は null でも よい〕
 *   ・`caveTable()` → `{ layer; kinds: Partial<Record<CaveKind, number>> }[]` ＝ 区画 × 層の 抽選の 表〔§4.7.1。わりあいは 0〜1。`heyaLinkTable` の となり〕
 *   ・`caveRolls` の 各行に `land`〔区画の 陸の わりあい 0〜1。`shaftRolls` と 同じ〕を 足す
 *   ・`caveSpec()` → `CaveSpecTable` ＝ 種類ごとの 層・大きさと 【PO 案】の 中身の 数〔つらら 12・せっかいせき 4 割・池・ねんど・ほたるいし・すいしょう・てつ・かべの 2 倍〕。テストの `CAVE_SPEC`・`CAVE_RULES` は 窓口が あれば これで 上書き〔#311〕
 *   ・`hiroiPlan(id)` の 座標の きまりは 仕様 §6.1〔`origin` ＋ 部屋の 中の 座標〕。出口の 前は 部屋の 穴から ブロックで 読む〔D15〕
 *   ・`hiroiTries`・`hiroiTry`・`hiroiScene`〔§6.1。D15・D16〕は 仕様の とおり
 *   ・`work(cx, cz).caveRegions` ＝ 列 1 つを 作る ときに 見る ほらあなの 区画の 数〔§4.9。1 つ まで〕
 *   ・`caveStats(id).wall` ＝ 空気か 水に ふれた 石の 数〔`columnOres` の `wall` と 同じ 数え方〕
 *   ・YokaiManagerOptions に `noSpawnAt?: (x, y, z) => boolean` 〔妖怪の 床の マス〔足の y〕を わたして、true なら そこには 出ない〕。つなぎ込みは `caveAt(...) === 'hotaru'` を わたす
 *   ・`AchievementSystem.feedMine` の 出来事に `{ type: 'cave', tick, kind }` を 足す
 *   ・ブロックの id ＝ `tsurara`〔仕様 §4.4〕
 */

// ------------------------------------------------------------------ 窓口の 型〔仕様 §6.1〕

export type CaveKind = 'hiroi' | 'shonyudo' | 'chiteiko' | 'hotaru' | 'suisho';
export const CAVE_KINDS: readonly CaveKind[] = ['hiroi', 'shonyudo', 'chiteiko', 'hotaru', 'suisho'];

interface CaveBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}
export interface Cave {
  id: string;
  kind: CaveKind;
  layer: Layer;
  center: Pt;
  size: Pt;
  box: CaveBox;
  linked: boolean;
  shaft: string | null;
}
export interface CaveRoll {
  rx: number;
  rz: number;
  layer: Layer;
  kind: CaveKind | null;
  land: number;
  placed: boolean;
}
interface CaveTableRow {
  layer: Layer;
  kinds: Partial<Record<CaveKind, number>>;
}
interface HeyaLinkRow {
  layer: Layer;
  chance: number;
  kinds: Partial<Record<CaveKind, number>>;
  /** 当たりの うち 部屋が 入って end が 'heya' に なる わりあいの 下の 限り〔7 割〕 */
  minPlaced: number;
}
interface CaveStats {
  wall: number;
  visible: Record<string, number>;
  tsurara: number;
  pondDepth: number;
  floor: number;
  holesUnder: number;
  openings: number;
  roofToGround: number;
  floorStep: number;
  floorOre: number;
  torches: number;
}
interface HiroiWork {
  pillarCells: number;
  pillarPacks: number;
  knobTries: number;
  layouts: number;
  tips: number;
}
export interface HiroiPlan {
  origin: Pt;
  size: { x: number; z: number; h: number };
  eggs: { cx: number; cz: number; rx: number; rz: number }[];
  pillars: { x: number; z: number; ceil: number; widths: number[] }[];
  knobs: { x: number; z: number; r: number; drop: number }[];
  bumps: { x: number; z: number }[];
  work: HiroiWork;
}
type Range = [number, number];
export interface HiroiTable {
  eggs: 2;
  ceilSpread: number;
  knobs: [number, number];
  knobMinSmall: number;
  knobDeepMin: number;
  bumpShare: [number, number];
  /** 層ごとの 高さ〔計画の 箱〕と 柱の 立つ 天井〔yuzu 2026-11-06。あさい 10〜14・8／なかほど 12〜18・10〕 */
  layers: Record<'asai' | 'nakahodo', { height: Range; minCeil: number }>;
  floorPerPillar: number;
  pillars: [number, number];
  work: HiroiWork;
  aim: { small: { skirtSmall: Range; unplaced: Range }; large: { skirtSmall: Range; unplaced: Range }; unplaced: Range };
  pillar: { skirt: number[]; skirtSmall: number[]; mid: number; crown: number[]; skirtMax: number; tries: number; smallMin: number };
  oreZone: { baseRows: number; ceilFrom: number; share: number };
}
export interface HiroiTryRow {
  rx: number;
  rz: number;
  layer: Layer;
  shaft: string | null;
  cave: string | null;
  placed: boolean;
  small: boolean;
  work: HiroiWork;
}
export interface HiroiTry {
  size: { x: number; z: number };
  small: boolean;
  work: HiroiWork;
  plan: HiroiPlan | null;
}

/** 仕様 §6.1 の 1D の 窓口。型には まだ 無いので 文字で 読む〔赤の 間も 型が 通る ように〕 */
export interface MineHook1D {
  caves(x0: number, z0: number, x1: number, z1: number): Cave[];
  findCave(kind: CaveKind, from?: { x: number; z: number }): Cave | null;
  caveRolls(x0: number, z0: number, x1: number, z1: number): CaveRoll[];
  caveTable(): CaveTableRow[];
  heyaLinkTable(): HeyaLinkRow[];
  hiroiTable(): HiroiTable;
  caveSpec(): CaveSpecTable;
  hiroiPlan(id: string): HiroiPlan | null;
  hiroiTries(x0: number, z0: number, x1: number, z1: number): HiroiTryRow[];
  hiroiTry(seed: number, layer?: 'asai' | 'nakahodo'): HiroiTry;
  hiroiScene(o: { seed: number; plain?: boolean }): { caveId: string; size: { x: number; z: number }; stand: { x: number; y: number; z: number; facing: 'n' } };
  caveStats(id: string): CaveStats;
  caveAt(x: number, y: number, z: number): CaveKind | 'kodo' | null;
  layers(): { id: Layer; minY: number; maxY: number | null }[];
  shafts(x0: number, z0: number, x1: number, z1: number): Shaft[];
  startShaft(): Shaft;
  shaftPath(id: string): { x: number; y: number; z: number; part: string }[];
  saveGens(): { current: number; meta: number; kodo: number | null; heya: number | null };
  oldCols(kind: 'kodo' | 'heya'): number;
  isOld(kind: 'kodo' | 'heya', cx: number, cz: number): boolean;
  work(cx: number, cz: number): { shaftRegions: number; caveRegions: number; emitters: number };
  columnOres(cx: number, cz: number): { normal: boolean; layers: Record<Layer, { stone: number; wall: number; ores: Record<string, { all: number; visible: number } | undefined> }> };
}

/** 窓口を 作る。`oldCols` は 古い 保存を 開いた とき の 一覧。`world` は いきている 世界 */
export function hookCave(seed: number, o: { oldCols?: unknown; world?: unknown; metaGen?: () => number | null } = {}): MineHook1D {
  const h = createMineHook({ seed, ...(o.oldCols ? { oldCols: o.oldCols } : {}), ...(o.world ? { world: o.world } : {}), ...(o.metaGen ? { metaGen: o.metaGen } : {}) } as never) as unknown as MineHook1D;
  // 窓口の 表が あれば、その 数で 下書きを 上書きする〔#311〕
  if (typeof (h as { caveSpec?: unknown }).caveSpec === 'function') {
    const t = h.caveSpec();
    Object.assign(CAVE_SPEC, t.kinds);
    for (const k of ['hiroi', 'shonyudo', 'chiteiko', 'hotaru', 'suisho'] as const) Object.assign(CAVE_RULES[k], t.rules[k]);
  }
  return h;
}

/** 窓口が ある〔ない うちは 赤〕ことを 先に 見て、ない 名前を ぜんぶ 言って 落とす */
export function needCaveHook(h: MineHook1D, names: readonly (keyof MineHook1D)[]): void {
  const missing = names.filter((n) => typeof (h as unknown as Record<string, unknown>)[n] !== 'function');
  if (missing.length > 0) throw new Error(`__rikkun.mine の 窓口〔1D〕が まだ ない: ${missing.join('・')}`);
}

// ------------------------------------------------------------------ 数〔テストの 表。仕様 §4.7.2 の 表の 写し。オーナー確認で かわったら ここ 1 か所〕

/** シード 3 つ〔D1〜D5・D12・D15〕。20 シードの はじめの 3 つ */
export const SEEDS_3: readonly number[] = SEEDS_20.slice(0, 3);

/** 種類ごとの 層・大きさ〔横 × 横 × 高さ〕の はんい〔§4.7.2 の 表〕 */
type Span = readonly [number, number];
export interface CaveSpecRow {
  layers: readonly Layer[];
  x: Span;
  z: Span;
  y: Span;
}
/** 【PO 案】の 数の 窓口 `caveSpec()` の 形〔#311。自分で 決めた 名前。オーナー確認で かわる 数は 実装の 表 1 か所から 読む〕 */
interface CaveSpecTable {
  kinds: Record<CaveKind, CaveSpecRow>;
  rules: {
    hiroi: { wallOreTimes: number; ironMin: number };
    shonyudo: { tsuraraMin: number; sekkaisekiShare: number };
    chiteiko: { pondWidth: Span; pondDepth: Span; nendoMin: number };
    hotaru: { visible: Span };
    suisho: { visible: Span };
  };
}

/**
 * 種類ごとの 層・大きさ〔横 × 横 × 高さ。計画の 箱〕の はんい。**実装の 前の 下書き**〔§4.7.2 の 表の 写し〕: `hookCave` が 窓口 `caveSpec()` を 見つけたら
 * 窓口の 数で 上書きする〔つまり 実装の あとは 表から 読む。#311〕。
 */
export const CAVE_SPEC: Record<CaveKind, CaveSpecRow> = {
  hiroi: { layers: ['asai', 'nakahodo'], x: [24, 36], z: [24, 36], y: [10, 18] }, // 高さは 層ごとの 表 `hiroiTable().layers` で 見る
  shonyudo: { layers: ['nakahodo'], x: [16, 24], z: [16, 24], y: [7, 10] },
  chiteiko: { layers: ['asai'], x: [20, 28], z: [20, 28], y: [6, 9] },
  hotaru: { layers: ['nakahodo'], x: [14, 20], z: [14, 20], y: [5, 7] },
  suisho: { layers: ['fukai'], x: [10, 16], z: [10, 16], y: [6, 9] },
};

/**
 * 中身の きまり。【PO 案】の 数〔hiroi・shonyudo・chiteiko・hotaru・suisho〕は 下書き → `caveSpec().rules` で 上書き。
 * 下は 受け入れ基準の 数〔D1・D4・D5。オーナー確認では かわらない〕。
 */
export const CAVE_RULES = {
  hiroi: { wallOreTimes: 2, ironMin: 10 },
  shonyudo: { tsuraraMin: 12, sekkaisekiShare: 0.4 },
  chiteiko: { pondWidth: [10, 16] as Span, pondDepth: [1, 2] as Span, nendoMin: 30 },
  hotaru: { visible: [24, 32] as Span },
  suisho: { visible: [16, 24] as Span },
  /** 地面〔海の 下は 海の 底〕から 天井まで〔§4.7.3 の 3。D4〕 */
  roof: { ground: 8, sea: 10 },
  /** 歩いて 出られる 部屋の 下限〔D5〕 */
  exitShare: 0.9,
  /** 外へ 4 マス 以上 すすめる〔D5〕 */
  exitOutside: 4,
  /** 区画の ふちから 内がわ〔D1〕 */
  edge: 4,
  /** 区画の 大きさ〔マス〕 */
  region: 64,
};

// ------------------------------------------------------------------ 道さがし〔歩ける きまり。mineShaftKit の stepTo を 使う〕

/** 四角の はんいの 立てる マスの つながり〔辺は stepTo。行き〔fwd〕と 帰り〔rev〕〕 */
export class Walk {
  readonly nodes = new Map<string, Pt>();
  private readonly fwd = new Map<string, string[]>();
  private readonly rev = new Map<string, string[]>();
  constructor(
    readonly g: GenCols,
    readonly b: CaveBox,
  ) {
    for (let x = b.x0; x <= b.x1; x++) {
      for (let z = b.z0; z <= b.z1; z++) {
        for (let y = b.y0; y <= b.y1; y++) if (standable(g, x, y, z)) this.nodes.set(ptKey({ x, y, z }), { x, y, z });
      }
    }
    for (const a of this.nodes.values()) {
      const ka = ptKey(a);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const c = stepTo(g, a, dx, dz);
        if (!c) continue;
        const kc = ptKey(c);
        if (!this.nodes.has(kc)) continue;
        (this.fwd.get(ka) ?? this.fwd.set(ka, []).get(ka)!).push(kc);
        (this.rev.get(kc) ?? this.rev.set(kc, []).get(kc)!).push(ka);
      }
    }
  }
  /** 行ける マス〔行き。rev ＝ true なら 帰り ＝ そこへ 行ける マス〕と 歩数 */
  reach(from: Pt, rev = false): Map<string, number> {
    const adj = rev ? this.rev : this.fwd;
    const dist = new Map<string, number>([[ptKey(from), 0]]);
    let frontier = [ptKey(from)];
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const k of frontier) {
        for (const n of adj.get(k) ?? []) {
          if (dist.has(n)) continue;
          dist.set(n, dist.get(k)! + 1);
          next.push(n);
        }
      }
      frontier = next;
    }
    return dist;
  }
}

/** 部屋の まわり margin マスまで ふくむ はんい〔道さがしの 範囲〕 */

// ------------------------------------------------------------------ 部屋を あつめる

/** 世界の ブロック座標で 区画 N × N 〔スタートの まわり〕の はんい */
export function areaAround(seed: number, regions: number): { x0: number; z0: number; x1: number; z1: number } {
  const sp = spawnOf(seed);
  const R = CAVE_RULES.region;
  const rx = Math.floor(sp.x / R) - Math.floor(regions / 2);
  const rz = Math.floor(sp.z / R) - Math.floor(regions / 2);
  return { x0: rx * R, z0: rz * R, x1: (rx + regions) * R - 1, z1: (rz + regions) * R - 1 };
}

/** 抽選の 部屋〔坑道の へやでない〕 */
export const lotteryCaves = (h: MineHook1D, a: { x0: number; z0: number; x1: number; z1: number }): Cave[] => h.caves(a.x0, a.z0, a.x1, a.z1).filter((c) => c.shaft === null);


