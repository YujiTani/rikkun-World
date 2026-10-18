import { GEN_CONFIG as C } from './config';
import { hash01, subSeed, valueNoise } from './random';
import { startTrees, type Tree } from './trees';
import type { Terrain } from './terrain';
import { terrainFor } from './terrain';

/**
 * 間隔のきまり（FLORA-75 §5）の「場所ごとの 段」「あき地」「むら」「順番」。
 * どれも (シード, 位置) だけで決まる純粋な計算 → 列を作る順に関係しない。
 * 木・草花を 間引く本体は trees.ts／plants.ts／flora.ts が ここの関数を使う。
 */

export type SpacingLevel = 'wide' | 'normal' | 'narrow';
export interface SpacingShare {
  wide: number;
  normal: number;
  narrow: number;
}

const K = C.spacing;
/** ふだんの割合（config の 1 か所） */
export const SPACING_SHARE: Readonly<SpacingShare> = K.share;

let share: Readonly<SpacingShare> = SPACING_SHARE;
let epoch = 0;

/** テスト用: fn の間だけ 段の割合を かえる（覚えている答えは 切りかえのたびに すてる） */
export function withSpacingShare<R>(s: SpacingShare, fn: () => R): R {
  const prev = share;
  share = s;
  epoch++;
  try {
    return fn();
  } finally {
    share = prev;
    epoch++;
  }
}

/** 割合を かえるたびに 変わる番号。割合に よって かわる答えを おぼえている所は これで すてる */
export function spacingEpoch(): number {
  return epoch;
}

/** 割合に よって かわる答えの入れもの（Terrain ごと・割合が かわったら 空にする） */
export function epochCache<V>(store: WeakMap<Terrain, { epoch: number; map: Map<number, V> }>, T: Terrain): Map<number, V> {
  let e = store.get(T);
  if (!e || e.epoch !== epoch) {
    e = { epoch, map: new Map() };
    store.set(T, e);
  }
  return e.map;
}

// ------------------------------------------------------------------ ノイズの順位（0〜1）

const tables = new Map<number, Float32Array>();
/** 値ノイズ（格子 scale）の値 → 0〜1 の順位。シードで かえない表（VOX-I §3.1 と同じ作り方） */
function rankOfNoise(v: number, scale: number): number {
  let t = tables.get(scale);
  if (t === undefined) {
    const n = 256;
    t = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) t[j * n + i] = valueNoise(7771, i * scale * 0.431, j * scale * 0.397, scale);
    t.sort();
    tables.set(scale, t);
  }
  let lo = 0;
  let hi = t.length;
  while (hi > lo) {
    const mid = (lo + hi) >> 1;
    if (t[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return Math.min(lo / t.length, 0.999999);
}

// ------------------------------------------------------------------ 段

/** 位置 (x, z) の 順位 v（スタートの まわりは ひろい に 寄せたあと） */
function rankAt(T: Terrain, x: number, z: number): number {
  const v = rankOfNoise(valueNoise(subSeed(T.seed, 1404), x, z, K.noiseScale), K.noiseScale);
  const sp = T.spawn();
  const d = Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z));
  if (d <= K.startWide) return 0;
  if (d >= K.startRamp) return v;
  return v * ((d - K.startWide) / (K.startRamp - K.startWide));
}

function levelOfRank(v: number): SpacingLevel {
  if (v < share.wide) return 'wide';
  if (v < share.wide + share.normal) return 'normal';
  return 'narrow';
}

export function levelAt(T: Terrain, x: number, z: number): SpacingLevel {
  return levelOfRank(rankAt(T, x, z));
}

/** window.__rikkun.biome.spacing: その場所の 段と 順位 v */
export function spacingAt(seed: number, x: number, z: number): { level: SpacingLevel; v: number } {
  const T = terrainFor(seed);
  const v = rankAt(T, x, z);
  return { level: levelOfRank(v), v };
}

// ------------------------------------------------------------------ 最小の間

const FOREST_KINDS: ReadonlySet<string> = new Set(['mori', 'ookina', 'momiji']);
const G_FOREST: Record<SpacingLevel, number> = { wide: 1, normal: 0, narrow: -1 };
const G_OTHER: Record<SpacingLevel, number> = { wide: 2, normal: 1, narrow: 0 };
/** 板の物（はな・すすき・くさ・のばな）の あき マス a */
export const GAP_SQUARE: Record<SpacingLevel, number> = { wide: 2, normal: 1, narrow: 0 };
/** たけ の あき マス a */
export const GAP_TAKE: Record<SpacingLevel, number> = { wide: 1, normal: 1, narrow: 0 };

/** はっぱの広がり（みき から）: ふつう・もみじ 2、まつ・大木 3 */
export const leafReach = (t: Tree): number => (t.big === true || t.leaves === 'matsu_leaves' ? 3 : 2);

/** 木 t（遅い方）の位置の国と段で決まる g（あき列。−1 は 1 列 かさなってよい） */
export function treeGap(T: Terrain, t: Tree): number {
  const forest = FOREST_KINDS.has(T.biome(t.x, t.z).kind);
  return (forest ? G_FOREST : G_OTHER)[levelAt(T, t.x, t.z)];
}

/** 2 本の みきの間（チェビシェフ）が これ未満なら 近すぎる: 広がり ＋ 広がり ＋（大木が いれば 2、なければ 1）＋ g */
export function treeMinTrunkGap(a: Tree, b: Tree, g: number): number {
  return leafReach(a) + leafReach(b) + (a.big === true || b.big === true ? 2 : 1) + g;
}

// ------------------------------------------------------------------ 順番

const startKeys = new WeakMap<Terrain, Set<number>>();
const pkey = (x: number, z: number): number => x * 100003 + z;

function isStartTree(T: Terrain, t: { x: number; z: number }): boolean {
  let s = startKeys.get(T);
  if (!s) {
    s = new Set(startTrees(T).map((q) => pkey(q.x, q.z)));
    startKeys.set(T, s);
  }
  return s.has(pkey(t.x, t.z));
}

/** 木の順番（小さい方が 早い。スタートの木は いちばん早い）。位置と シードだけで決まる */
export function treeOrder(T: Terrain, t: { x: number; z: number }): number {
  return isStartTree(T, t) ? -1 : hash01(subSeed(T.seed, 1402), t.x, t.z, 7);
}

/** a は b より 早いか（同じ数なら x が小さい方、それも同じなら z が小さい方が 早い） */
export function treeEarlier(seed: number, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const T = terrainFor(seed);
  const oa = treeOrder(T, a);
  const ob = treeOrder(T, b);
  return oa !== ob ? oa < ob : a.x !== b.x ? a.x < b.x : a.z < b.z;
}

export const plantOrder = (T: Terrain, p: { x: number; z: number }): number => hash01(subSeed(T.seed, 1403), p.x, p.z, 3);

export function plantEarlier(seed: number, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const T = terrainFor(seed);
  const oa = plantOrder(T, a);
  const ob = plantOrder(T, b);
  return oa !== ob ? oa < ob : a.x !== b.x ? a.x < b.x : a.z < b.z;
}

// ------------------------------------------------------------------ あき地

export interface Clearing {
  x: number;
  z: number;
  r: number;
}

/** 区 (kx, kz)（32×32）の あき地。まん中は 区のふちから 6 以上 内がわ（段に 関係なく 同じ場所）。半径は 区の中心のマスの段 */
const clearStore = new WeakMap<Terrain, { epoch: number; map: Map<number, Clearing> }>();

export function clearingOfCell(T: Terrain, kx: number, kz: number): Clearing {
  const memo = epochCache(clearStore, T);
  const key = (kx + 40000) * 80021 + (kz + 40000);
  const hit = memo.get(key);
  if (hit) return hit;
  const c = clearingOfCellRaw(T, kx, kz);
  if (memo.size > 20000) memo.clear();
  memo.set(key, c);
  return c;
}

function clearingOfCellRaw(T: Terrain, kx: number, kz: number): Clearing {
  const cell = K.clearing.cell;
  const span = cell - 2 * K.clearing.edge;
  const s = subSeed(T.seed, 1401);
  const x = kx * cell + K.clearing.edge + Math.floor(hash01(s, kx, kz, 1) * span);
  const z = kz * cell + K.clearing.edge + Math.floor(hash01(s, kx, kz, 2) * span);
  return { x, z, r: K.clearing.radius[levelAt(T, kx * cell + cell / 2, kz * cell + cell / 2)] };
}

/** (x, z) が あき地の まん中から rad + extra 以内か（まわりの 区 3×3 を 見る）。extra は 木の はっぱの広がり */
export function inClearing(T: Terrain, x: number, z: number, extra = 0): boolean {
  const cell = K.clearing.cell;
  const kx = Math.floor(x / cell);
  const kz = Math.floor(z / cell);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = clearingOfCell(T, kx + dx, kz + dz);
      const rr = c.r + extra;
      if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) <= rr * rr) return true;
    }
  }
  return false;
}

/** 四角 [x0, x1] × [z0, z1] に まん中が ある あき地 */
export function clearingsInRect(seed: number, x0: number, z0: number, x1: number, z1: number): Clearing[] {
  const T = terrainFor(seed);
  const cell = K.clearing.cell;
  const out: Clearing[] = [];
  for (let kz = Math.floor(z0 / cell); kz <= Math.floor(z1 / cell); kz++) {
    for (let kx = Math.floor(x0 / cell); kx <= Math.floor(x1 / cell); kx++) {
      const c = clearingOfCell(T, kx, kz);
      if (c.x >= x0 && c.x <= x1 && c.z >= z0 && c.z <= z1) out.push(c);
    }
  }
  return out;
}

// ------------------------------------------------------------------ むら

/** むら: (x, z) が「うすい所」に 入って 置かない（同じ位置なら いつも 同じ）。木には かけない */
export function thinned(T: Terrain, x: number, z: number, isTake: boolean): boolean {
  const lv = levelAt(T, x, z);
  if (lv === 'narrow') return false;
  if (lv === 'normal' && isTake) return false;
  const sM = subSeed(T.seed, 1405);
  const rank = rankOfNoise(valueNoise(sM, x, z, K.patchScale), K.patchScale);
  if (lv === 'wide') return rank < 0.5;
  // ふつう: うすい所（下 4 割）は 3 割だけ のこす
  return rank < 0.4 && hash01(sM, x, z, 5) >= 0.3;
}
