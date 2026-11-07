import { createMineHook } from './mineHook';
import {
  GenCols,
  SEEDS_20,
  type Layer,
  type OldCols,
  type PathCell,
  type Pt,
  type Shaft,
  type Tier,
} from './mineShaftKit';
import { spawnOf } from './terrain';

/**
 * MINE-1E（docs/design/MINE-1E.md §4・§6.1・受け入れ基準 E1〜E19）の テスト用の 道具。ゲームの 外〔テスト〕だけで 使う。
 *
 *   ・窓口 `Shaft` の 足し〔`gen`・`style`・`floors`・`branches`・`maze`・`camp`・`sides[].floor`〕と 表 4 つ〔`shaftStyleTable`・`shaftShapeTable`・`deadEndTable`・`campTable`〕・
 *     `campPreview` の 型〔仕様 §6.1 の とおり〕
 *   ・1E の 坑道を あつめる `eSample`・`bigSample`、表を 読む `tablesOf`
 *
 * 【自分で 決めた 名前・約束】 developer は これに 合わせる〔ちがう 形に した ときは、この 1 か所を 直す〕:
 *   ・**古い 列の 一覧**: `OldCols.boken`〔1E の 一覧。colKey の 集まり〕。保存の 版の 名前は `SaveManager.BOKEN_GEN`〔7〕。`StreamRestore.oldCols.boken`・
 *     窓口 `oldCols('boken')`・`isOld('boken', cx, cz)`・`saveGens().boken`〔`mine1eSave.test.ts`〕。meta の 書き方は developer の もの〔E16: 一覧が いくつ あっても 列 1 つ 12 バイト 以下〕
 *     ＝ テストは meta の 配列を 直接 読まず、開きなおして `StreamRestore.oldCols` の 集まりで くらべる
 *   ・`Shaft.gen`・`style`〔1C・1D の 坑道は `'c'`・null〕。`Shaft.floors[].main` ＝ 本道の まん中の 列〔はば 1〕の 足の マス。上り口の まん中から 下り口の まん中まで
 *       1 マスずつ〔両はし ふくむ。いちばん 下の 階は いちばん 下の へやの 入口の 前まで〕。**本道の 長さ ＝ `main.length − 1`**〔歩数〕
 *   ・`Shaft.work` ＝ 計画の 仕事〔ためした 回数。E19〕: `{ entrance; floors; sides; eda; maze }`〔どれも 整数〕。上の 限りは `shaftShapeTable().limit.tries`
 *   ・`DeadEnd.room` ＝ たからの へや・きらきらの へや〔かくしべや〕の 床の はんい〔足の y〕。あたり・はずれは null。`DeadEnd.at` ＝ つきあたりの 手前の 足の マス
 *       〔へやが あれば へやの 入口の 足の マス〕。`hibi` ＝ ひびの いしの マス〔足と 頭。はば 1・高さ 2・おく 2〜4 ＝ 4〜8 こ〕
 *   ・`maze.box` ＝ 外がわの かべを ふくむ 四角〔横 `4 × grid + 1`〕。ます i の まん中 ＝ `box.x0 + 2 + 4 i`・`box.z0 + 2 + 4 j`。ますの あいだの かべの まん中 ＝ ます i の まん中 ＋ 2
 *   ・`shaftPath` の `part`: `'hiroba'`・`'main'`・`'eda'`・`'end'`〔行きどまりの へや〕・`'hibi'`〔ひびの 通り道の 足の マス〕・`'kakushi'`・`'maze'`・`'camp'`〔仕様 §6.1〕。
 *       道の 足の マスは 空気の マス〔ひびの いし・くずれた いしの マスも 足の マスに 入る ＝「ほった あと」で 見る〕
 *   ・ブロックの id: `hibi_ishi`・`kuzure_ishi`・`furui_rail_x`／`_z`・`kowareta_waku`・`taoreta_hashigo_x`／`_z`・`takibi_ato`・アイテム `kabita_pan`〔仕様 §4.9〕
 *   ・キャンプの たんす〔E11〕: `createMineHook({ tansuHas })`〔その マスの たんすの 記録が すでに あるか〕・`StorageSystem.has(x, y, z)`〔記録が あるか〕・
 *       `StorageDeps.firstFill?(x, y, z): ItemStack[] | null`〔記録が まだ ない たんすを はじめて あける とき／あける 前に こわす とき だけ 呼ぶ。`placed` では 呼ばない〕
 *   ・実績: `AchievementSystem.feedMine` の 出来事に `{ type: 'area', tick, kind: 'kakushi' | 'mukashi' | 'meiro' | 'camp' }`〔E17〕。「かびた パンを たべた」は 今の `feedFarm` の `eat`
 *   ・ログ: `eatLogLine(item)`〔`src/ui/pickupLogModel.ts`〕＝ かびた パンなら「うぇ〜 かびてる…」・ほかは null〔E13〕
 *   ・距離は 横〔x・z〕。座標・向きは 窓口に 聞く
 */

// ------------------------------------------------------------------ 窓口の 型〔仕様 §6.1〕

export type Depth = 'asai' | 'nakahodo' | 'fukai';
export type Level = 'yasashii' | 'futsu' | 'fukuzatsu';
export type DeadEndKind = 'oo' | 'naka' | 'atari' | 'hazure' | 'hibi_naka' | 'hibi_oo';
export const DEAD_END_KINDS: readonly DeadEndKind[] = ['oo', 'naka', 'atari', 'hazure', 'hibi_naka', 'hibi_oo'];
export const DEPTHS: readonly Depth[] = ['asai', 'nakahodo', 'fukai'];
export const LEVELS: readonly Level[] = ['yasashii', 'futsu', 'fukuzatsu'];
export type Span = readonly [number, number];

interface Style {
  depth: Depth;
  floors: number;
  size: 64 | 96 | 128;
  level: Level;
  camp: boolean;
  maze: boolean;
}
interface Floor {
  y: number;
  up: Pt;
  down: Pt | null;
  main: Pt[];
  bends: number;
}
interface Room {
  x0: number;
  y: number;
  z0: number;
  x1: number;
  z1: number;
}
export interface DeadEnd {
  at: Pt;
  kind: DeadEndKind;
  hibi: Pt[];
  room: Room | null;
  chest: { x: number; y: number; z: number; cells: Pt[]; front: 'n' | 'e' | 's' | 'w'; tier: Tier } | null;
  ores: Record<string, number>;
}
interface Branch {
  side: number;
  from: Pt;
  to: Pt;
  length: number;
  bends: number;
  old: boolean;
  rubble: Pt[];
  end: DeadEnd;
}
interface Maze {
  box: { x0: number; z0: number; x1: number; z1: number };
  y: number;
  grid: 4 | 5;
  entrance: Pt;
  deadEnds: DeadEnd[];
  farthest: number;
}
interface Camp {
  room: Room;
  tansu: Pt;
  lantern: Pt;
  futon: Pt[];
  takibi: Pt;
}
interface PlanWork {
  entrance: number;
  floors: number;
  sides: number;
  eda: number;
  maze: number;
}
/** 1E の 足しを ふくむ 坑道。1E の 前は 足しが 無いので ぜんぶ 省略可〔型が 通る ように〕 */
export interface BokenShaft extends Omit<Shaft, 'sides'> {
  sides: (Shaft['sides'][number] & { floor?: number })[];
  gen?: 'c' | 'e';
  style?: Style | null;
  floors?: Floor[];
  branches?: Branch[];
  maze?: Maze | null;
  camp?: Camp | null;
  work?: PlanWork;
}

/** 性格の 表〔§4.1〕。数は 実装の 表 1 か所〔#311〕 */
interface StyleTable {
  depth: { id: Depth; chance: number; floors: Span }[];
  size: { size: 64 | 96 | 128; chance: number }[];
  level: { id: Level; chance: number; sides: Span; eda: Span; edaMax: number; maze: number; mazeGrid: 4 | 5 | null; mainLength: Span }[];
  camp: number;
}
/** 形の 表〔§4.2〜§4.8・§4.14〕 */
interface ShapeTable {
  floor: {
    /** いちばん 下の 階の 足の y */
    bottomY: Record<Depth, Span>;
    gapMin: number;
    topBelowEntrance: number;
    hiroba: { w: number; d: number; height: number };
    main: { width: number; height: number; bendsMax: number };
  };
  side: { length: Span; longShare: number; longLength: Span; longMinSize: number; bendsMax: number };
  eda: { length: Span; bendsMax: number; mouthGapSide: number; mouthGapEda: number; oldShare: number; rubbleShare: number; rubbleCells: number; torchFrom: Span };
  hibi: { width: number; height: number; depth: Span; cells: Span; torchBefore: Span; torches: number };
  room: { floor: number; height: number };
  maze: { cell: number; wall: number; height: number; forks: number; loops: number; deadEnds: Span; walkMax: number; torchMax: number };
  camp: { floor: number; height: number; mouth: number };
  limit: { torchesPerShaft: number; torchesPerCol: number; regionsPerCol: number; workRatio: number; newBlockIds: number; totalBlockIds: number; tries: PlanWork };
}
/** 行きどまりの くじの 表〔§4.4〕 */
interface DeadEndTable {
  kinds: { kind: DeadEndKind; chance: number }[];
  atariCount: Span;
  mazeFarthest: { oo: number; naka: number };
  /** 層ごとの 鉱石〔ブロック id〕: naka ＝ きらきらの へやで 見える 数〔以上〕・atari ＝ あたりの 鉱石の 候補・bottom ＝ いちばん 下の へやの かべ〔以上〕 */
  ores: Record<Depth, { naka: Record<string, number>; atari: string[]; bottom: Record<string, number> }>;
}
/** キャンプの たんすの 表〔§4.8〕 */
interface CampTable {
  rows: { kind: 'pan' | 'pickaxe' | 'drop' | 'ore' | 'torch'; chance: number; count: Span; items?: string[] }[];
  wear: Span;
  pickaxe: Record<Depth, string>;
}
export interface CampItem {
  item: string;
  count: number;
  wear?: number;
}

/** 仕様 §6.1 の 1E の 窓口。型には まだ 無いので 文字で 読む〔赤の 間も 型が 通る ように〕 */
export interface MineHookE {
  shafts(x0: number, z0: number, x1: number, z1: number): BokenShaft[];
  startShaft(): BokenShaft;
  shaftPath(id: string): PathCell[];
  shaftStyleTable(): StyleTable;
  shaftShapeTable(): ShapeTable;
  deadEndTable(): DeadEndTable;
  campTable(): CampTable;
  campPreview(x: number, y: number, z: number): CampItem[] | null;
  caveAt(x: number, y: number, z: number): string | null;
  layers(): { id: Layer; minY: number; maxY: number | null }[];
  work(cx: number, cz: number): { shaftRegions: number; caveRegions: number; emitters: number };
  saveGens(): { current: number; meta: number; kodo: number | null; heya: number | null; boken?: number | null };
  oldCols(kind: 'kodo' | 'heya' | 'boken'): number;
  isOld(kind: 'kodo' | 'heya' | 'boken', cx: number, cz: number): boolean;
  chestTable(name: string): import('./mineShaftKit').ChestTable;
  chestAt(x: number, y: number, z: number): { table: string; tier: Tier; opened: boolean; main: Pt; cells: Pt[]; front: string } | null;
  chestPreview(x: number, y: number, z: number): { tier: Tier; items: { item: string; count: number }[] } | null;
}

export interface HookOptions {
  oldCols?: OldCols;
  world?: unknown;
  metaGen?: () => number | null;
  tansuHas?: (x: number, y: number, z: number) => boolean;
}
/** 窓口を 作る。`oldCols` は 古い 保存を 開いた とき〔`boken` を ふくむ〕の 一覧 */
export function hookE(seed: number, o: HookOptions = {}): MineHookE {
  return createMineHook({ seed, ...(o.oldCols ? { oldCols: o.oldCols } : {}), ...(o.world ? { world: o.world } : {}), ...(o.metaGen ? { metaGen: o.metaGen } : {}), ...(o.tansuHas ? { tansuHas: o.tansuHas } : {}) } as never) as unknown as MineHookE;
}

/** 窓口が ある〔ない うちは 赤〕ことを 先に 見て、ない 名前を ぜんぶ 言って 落とす */
export function needBokenHook(h: MineHookE, names: readonly (keyof MineHookE)[]): void {
  const missing = names.filter((n) => typeof (h as unknown as Record<string, unknown>)[n] !== 'function');
  if (missing.length > 0) throw new Error(`__rikkun.mine の 窓口〔1E〕が まだ ない: ${missing.join('・')}`);
}

/** 1E の 坑道か〔`gen: 'e'`。1E の 前は いつも false ＝ 標本が 空で 赤〕 */
const isE = (s: BokenShaft): boolean => s.gen === 'e';

// ------------------------------------------------------------------ 表を 読む〔数は ここを 通して 1 か所〕

export interface Tables {
  style: StyleTable;
  shape: ShapeTable;
  dead: DeadEndTable;
  camp: CampTable;
}
const tablesMemo = new Map<number, Tables>();
/** 窓口の 4 つの 表。窓口が まだ 無い ときは「窓口が ない」で 落ちる */
export function tablesOf(seed = SEEDS_20[0]!): Tables {
  const hit = tablesMemo.get(seed);
  if (hit) return hit;
  const h = hookE(seed);
  needBokenHook(h, ['shaftStyleTable', 'shaftShapeTable', 'deadEndTable', 'campTable']);
  const t = { style: h.shaftStyleTable(), shape: h.shaftShapeTable(), dead: h.deadEndTable(), camp: h.campTable() };
  tablesMemo.set(seed, t);
  return t;
}

export const inSpan = (v: number, s: Span): boolean => v >= s[0] && v <= s[1];
export const cheb = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
export const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

// ------------------------------------------------------------------ 標本

/** シードの 並び〔20 シードの あと もっと 足す。必要な 数に なるまで つかう〕 */
export const SEED_POOL: readonly number[] = [...SEEDS_20, ...Array.from({ length: 80 }, (_, i) => 60_000 + i * 7919)];
/** もっと 多くの 標本が いる 確かめ〔キャンプの たんす 2,000 こ など〕用に、シードを 300 まで ふやした 並び */
export const SEED_POOL_BIG: readonly number[] = [...SEED_POOL, ...Array.from({ length: 200 }, (_, i) => 200_000 + i * 6007)];
/** 数える 範囲〔スタートの まわり 横 ± 3,072 マス〕 */
const HALF = 3072;

export interface ESample {
  seed: number;
  shaft: BokenShaft;
}

/**
 * 1E の 坑道〔`gen: 'e'`〕を あつめる〔計画だけ。ブロックは 作らない〕。`enough` が true に なるまで シードを 足す。
 * 窓口が 1E の 前〔`gen` が 無い〕でも 投げず、標本が 空に なる〔使う 側が「1E の 坑道が ない」で 落ちる〕。
 */
export function bigSample(enough: (all: readonly ESample[]) => boolean, pool: readonly number[] = SEED_POOL): { all: ESample[]; seeds: number } {
  const all: ESample[] = [];
  let seeds = 0;
  for (const seed of pool) {
    if (enough(all)) break;
    // 1E の 前〔`gen` が 無い〕は 何シード 見ても 空 → 6 シードで 見きりを つけて 赤にする〔全シードを なめない〕
    if (seeds >= 6 && all.length === 0) break;
    seeds++;
    const h = hookE(seed);
    const sp = spawnOf(seed);
    for (const shaft of h.shafts(sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1)) if (isE(shaft)) all.push({ seed, shaft });
  }
  return { all, seeds };
}

/** シード 1 つで スタートに 近い 順に 1E の 坑道 n こ〔ブロックまで しらべる 標本〕 */
function eNear(seed: number, n: number): { hook: MineHookE; g: GenCols; shafts: BokenShaft[] } {
  const hook = hookE(seed);
  const sp = spawnOf(seed);
  const near = hook
    .shafts(sp.x - HALF, sp.z - HALF, sp.x + HALF - 1, sp.z + HALF - 1)
    .filter(isE)
    .sort((a, b) => Math.hypot(a.entrance.x - sp.x, a.entrance.z - sp.z) - Math.hypot(b.entrance.x - sp.x, b.entrance.z - sp.z))
    .slice(0, n);
  return { hook, g: new GenCols(seed), shafts: near };
}

/**
 * ブロックまで しらべる 標本: シード 1 つで スタートに 近い 1E の 坑道 `near` こ の うち、中身が いちばん ゆたかな 1 つ〔迷路・キャンプ・ひび・くずれた いし〕。
 * 重い ブロックの 確かめで 迷路・キャンプ・かくしべやに 当たる ように する。
 */
export function eRich(seed: number, near = 6): { hook: MineHookE; g: GenCols; shaft: BokenShaft } | null {
  const r = eNear(seed, near);
  const score = (s: BokenShaft): number =>
    (s.maze ? 3 : 0) + (s.camp ? 3 : 0) + (s.branches ?? []).filter((b) => b.end.kind.startsWith('hibi')).length * 2 + (s.branches ?? []).filter((b) => b.rubble.length > 0).length + (s.style?.size ?? 64) / 128;
  const best = [...r.shafts].sort((a, b) => score(b) - score(a))[0];
  return best ? { hook: r.hook, g: r.g, shaft: best } : null;
}

// ------------------------------------------------------------------ ブロックを 読む 小道具

export const ID = {
  hibi: 'hibi_ishi',
  kuzure: 'kuzure_ishi',
  railX: 'furui_rail_x',
  railZ: 'furui_rail_z',
  waku: 'kowareta_waku',
  hashigoX: 'taoreta_hashigo_x',
  hashigoZ: 'taoreta_hashigo_z',
  takibi: 'takibi_ato',
  kodoWaku: 'kodo_waku',
  torch: 'torch',
  lantern: 'lantern',
} as const;

