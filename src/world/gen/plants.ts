import { CHUNK_SIZE, SEA_Y, type BlockId } from '../../contracts';
import { defOf, newSample, type BiomeSample } from './biome';
import { GEN_CONFIG as C } from './config';
import { nearMouth } from './mouths';
import { hash01, subSeed } from './random';
import { GAP_SQUARE, GAP_TAKE, epochCache, inClearing, levelAt, plantEarlier, thinned } from './spacing';
import { terrainFor, type Terrain } from './terrain';
import { treesOfChunk } from './trees';

/**
 * 国の草の上の物（はな・すすき・たけ）。1 列（16×16）ごとに、シード付きの順で 上限（cap）まで置く。
 * 位置は (seed, x, z) の乱数だけで決まる → 作る順に関係しない。
 */

export interface Plant {
  x: number;
  z: number;
  id: BlockId;
  /** 積む高さ（たけ 4〜7。ほかは 1） */
  height: number;
}

const FLOWERS: readonly BlockId[] = ['flower_y', 'flower_o', 'flower_p'];
let tmpSample: BiomeSample | null = null;

const rawStore = new WeakMap<Terrain, Map<number, Plant[]>>();
const MAX_RAW = 4000;

/** 列 (cx, cz) の はな・すすき・たけ の こうほ（上限をかけた後・間隔のきまりの 前）。同じ (seed, cx, cz) なら いつも同じ */
export function plantsRaw(T: Terrain, cx: number, cz: number): Plant[] {
  let m = rawStore.get(T);
  if (!m) rawStore.set(T, (m = new Map()));
  const key = (cx + 40000) * 80021 + (cz + 40000);
  let v = m.get(key);
  if (!v) {
    v = plantsRawUncached(T, cx, cz);
    if (m.size >= MAX_RAW) m.delete(m.keys().next().value as number);
    m.set(key, v);
  }
  return v;
}

/** 種類の まとまり（はな は 3 色で 1 つ） */
export const plantGroup = (p: Plant): string => (p.id.startsWith('flower_') ? 'flower' : p.id);

/**
 * 間隔のきまり（FLORA-75 §5.2・§5.3）: mine（この列の こうほ）から、あき地の中・うすい所・
 * 同じ種類の 近すぎる 早い物（near = まわり 3×3 列の こうほ。早い物が 別のことで 消えていても やめる）を 外す。
 */
export function spacePlants(T: Terrain, mine: readonly Plant[], near: () => readonly Plant[]): Plant[] {
  const out: Plant[] = [];
  let all: readonly Plant[] | null = null;
  for (const p of mine) {
    if (inClearing(T, p.x, p.z)) continue;
    const take = p.id === 'bamboo';
    const lv = levelAt(T, p.x, p.z);
    if (thinned(T, p.x, p.z, take, lv)) continue;
    const a = (take ? GAP_TAKE : GAP_SQUARE)[lv];
    if (a > 0) {
      const g = plantGroup(p);
      all ??= near();
      let lose = false;
      for (const u of all) {
        if (u === p || plantGroup(u) !== g) continue;
        if (Math.abs(u.x - p.x) > a || Math.abs(u.z - p.z) > a) continue;
        if (plantEarlier(T.seed, u, p)) {
          lose = true;
          break;
        }
      }
      if (lose) continue;
    }
    out.push(p);
  }
  return out;
}

const finalStore = new WeakMap<Terrain, { epoch: number; map: Map<number, Plant[]> }>();

/** 列 (cx, cz) に 置く草の上の物（はな・すすき・たけ）。上限と 間隔のきまりを かけた後。くさ・のばな は flora.ts */
export function plantsOfChunk(T: Terrain, cx: number, cz: number): Plant[] {
  const memo = epochCache(finalStore, T);
  const key = (cx + 40000) * 80021 + (cz + 40000);
  const hit = memo.get(key);
  if (hit) return hit;
  const out = spacePlants(T, plantsRaw(T, cx, cz), () => neighbors(T, cx, cz));
  if (memo.size > 4000) memo.clear();
  memo.set(key, out);
  return out;
}

function neighbors(T: Terrain, cx: number, cz: number): Plant[] {
  const near: Plant[] = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) near.push(...plantsRaw(T, cx + dx, cz + dz));
  return near;
}

function plantsRawUncached(T: Terrain, cx: number, cz: number): Plant[] {
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const sP = subSeed(T.seed, 701);
  const sp = T.spawn();
  const tmp = (tmpSample ??= newSample());
  const found: { p: Plant; r: number; kind: 'flower' | 'susuki' | 'take'; cap: number }[] = [];
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const x = x0 + lx;
      const z = z0 + lz;
      const s = T.map.sampleInto(x, z, tmp);
      const def = defOf(s.kind);
      if (!def.flower && !def.susuki && !def.take) continue;
      const r = hash01(sP, x, z, 1);
      let kind: 'flower' | 'susuki' | 'take';
      if (def.flower && r < def.flower) kind = 'flower';
      else if (def.susuki && r < def.susuki) kind = 'susuki';
      else if (def.take && r < def.take) kind = 'take';
      else continue;
      // スタートのまわりと、4 方向の道の上には 置かない（木と同じ）
      const ax = Math.abs(x - sp.x);
      const az = Math.abs(z - sp.z);
      if (Math.max(ax, az) <= C.trees.startClear) continue;
      if (Math.max(ax, az) <= C.trees.corridorWithin && Math.min(ax, az) < C.trees.corridor) continue;
      if (kind === 'take' && T.map.onTakePath(x, z, s)) continue;
      if (nearMouth(T, x, z, 2)) continue; // 洞くつの口の さか道・へやを ふさがない
      const h = T.height(x, z);
      if (h < SEA_Y + C.strata.landFrom || T.topBlock(x, z, h) !== 'grass' || T.map.pondAt(x, z) !== null) continue;
      // たけ（かたい ブロック）は 横のとなりが 自分の根もとより高い地面だと 小ブロック地形の面と ぶつかる → 平らな所だけ
      if (kind === 'take' && (T.height(x + 1, z) > h || T.height(x - 1, z) > h || T.height(x, z + 1) > h || T.height(x, z - 1) > h)) continue;
      if (kind === 'flower') found.push({ p: { x, z, id: FLOWERS[Math.floor(hash01(sP, x, z, 2) * 3)]!, height: 1 }, r, kind, cap: def.cap?.flower ?? Infinity });
      else if (kind === 'susuki') found.push({ p: { x, z, id: 'susuki', height: 1 }, r, kind, cap: def.cap?.susuki ?? Infinity });
      else found.push({ p: { x, z, id: 'bamboo', height: 4 + Math.floor(hash01(sP, x, z, 3) * 4) }, r, kind, cap: def.cap?.take ?? Infinity });
    }
  }
  // 上限: 乱数の値が小さい順に 上限まで（列のかたよりが出ない）
  const out: Plant[] = [];
  for (const kind of ['flower', 'susuki', 'take'] as const) {
    const list = found.filter((f) => f.kind === kind).sort((u, v) => u.r - v.r);
    for (let k = 0; k < list.length; k++) if (k < list[k]!.cap) out.push(list[k]!.p);
  }
  return out;
}

/** 列 (cx, cz) に ゲームが 置く 木・たけ・はな・すすき の数（trees は 大木をふくむ） */
export function columnCounts(seed: number, cx: number, cz: number): { trees: number; bigTrees: number; take: number; flower: number; susuki: number } {
  const T = terrainFor(seed);
  const trees = treesOfChunk(T, cx, cz);
  const plants = plantsOfChunk(T, cx, cz);
  return {
    trees: trees.length,
    bigTrees: trees.filter((t) => t.big === true).length,
    take: plants.filter((p) => p.id === 'bamboo').length,
    flower: plants.filter((p) => p.id.startsWith('flower_')).length,
    susuki: plants.filter((p) => p.id === 'susuki').length,
  };
}
