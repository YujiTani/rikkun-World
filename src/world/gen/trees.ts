import { CHUNK_SIZE, SEA_Y } from '../../contracts';
import { defOf } from './biome';
import { GEN_CONFIG as C } from './config';
import { nearMouth } from './mouths';
import { hash01, hashInts, subSeed } from './random';
import type { Terrain } from './terrain';

/**
 * 木（T1〜T4）。1 列を 4×4 の 16 区画に分け、区画ごとに 1 点（区画の中の 0〜1 ずらし）。
 * みき どうしは 3 マス以上はなれる。木になる割合はバイオームで変わる。
 * 位置も 形も (seed, 区画) だけで決まるので、作る順に関係ない。
 */

export interface Tree {
  /** みきの列 */
  x: number;
  z: number;
  /** 地面の高さ（みきの いちばん下は y + 1） */
  y: number;
  /** みきの高さ 4〜5（大木は 10〜14） */
  trunk: number;
  /** はっぱのブロック（VOX-I-1: てんぐの やま = まつ、もみじやま = もみじ、ほか = はっぱ） */
  leaves: 'leaves' | 'momiji_leaves' | 'matsu_leaves';
  /** 2×2 の大木（x,z = 北西の みき） */
  big?: boolean;
}

const PLOT = C.trees.plot;

/** 区画 (a, b) の点（区画の左上から 1 + 0〜1） */
function plotPoint(sT: number, a: number, b: number): { x: number; z: number; trunk: number } {
  const h = hashInts(sT, a, b, 1);
  return {
    x: a * PLOT + 1 + (h & 1),
    z: b * PLOT + 1 + ((h >>> 1) & 1),
    trunk: C.trees.trunkMin + ((h >>> 2) % (C.trees.trunkMax - C.trees.trunkMin + 1)),
  };
}

/** T3: ここに 木を置いてよいか（くさ の列・平ら・スタートの広場・岩山・洞くつの口をさける）。置けるなら 地面の高さ、だめなら -1 */
export function treeGround(T: Terrain, x: number, z: number, nearStart = true): number {
  const sp = T.spawn();
  if (nearStart) {
    const ax = Math.abs(x - sp.x);
    const az = Math.abs(z - sp.z);
    if (Math.max(ax, az) <= C.trees.startClear) return -1;
    // スタートの近くでは 4 方向の道（北・東・南・西）の上に 立てない（はっぱ が 道をふさがない）
    if (Math.max(ax, az) <= C.trees.corridorWithin && Math.min(ax, az) < C.trees.corridor) return -1;
  }
  const h = T.height(x, z);
  if (h < SEA_Y + C.strata.landFrom) return -1;
  if (T.topBlock(x, z, h) === 'stone') return -1; // いしの山の上には 立てない
  if (T.map.pondAt(x, z) !== null) return -1;
  if (T.inRock(x, z, 3.5)) return -1;
  const s = C.trees.maxSlope;
  if (Math.abs(T.height(x + 1, z) - h) >= s || Math.abs(T.height(x - 1, z) - h) >= s) return -1;
  if (Math.abs(T.height(x, z + 1) - h) >= s || Math.abs(T.height(x, z - 1) - h) >= s) return -1;
  if (nearMouth(T, x, z, 3)) return -1;
  return h;
}

const starters = new WeakMap<Terrain, { trees: Tree[]; keys: Set<number> }>();
const plotKey = (a: number, b: number): number => (a + 40000) * 80021 + (b + 40000);

/** T4: はじまりの木 3 本（スタートから チェビシェフ 5〜12。うち 1 本は 北 ±45° で 目から 見える） */
export function startTrees(T: Terrain): Tree[] {
  return startInfo(T).trees;
}

function startInfo(T: Terrain): { trees: Tree[]; keys: Set<number> } {
  const hit = starters.get(T);
  if (hit) return hit;
  const sT = subSeed(T.seed, 401);
  const sp = T.spawn();
  const K = C.trees;
  const cand: { a: number; b: number; x: number; z: number; g: number; trunk: number; r: number }[] = [];
  const a0 = Math.floor((sp.x - K.startMax - 1) / PLOT);
  const a1 = Math.floor((sp.x + K.startMax + 1) / PLOT);
  const b0 = Math.floor((sp.z - K.startMax - 1) / PLOT);
  const b1 = Math.floor((sp.z + K.startMax + 1) / PLOT);
  for (let b = b0; b <= b1; b++) {
    for (let a = a0; a <= a1; a++) {
      const p = plotPoint(sT, a, b);
      const r = Math.max(Math.abs(p.x - sp.x), Math.abs(p.z - sp.z));
      if (r < K.startMin || r > K.startMax) continue;
      const g = treeGround(T, p.x, p.z);
      if (g < 0) continue;
      cand.push({ a, b, x: p.x, z: p.z, g, trunk: p.trunk, r });
    }
  }
  cand.sort((u, v) => hash01(sT, u.a, u.b, 9) - hash01(sT, v.a, v.b, 9));
  const eyeX = sp.x + 0.5;
  const eyeY = sp.h + 1 + 1.6;
  const eyeZ = sp.z + 0.5;
  const isNorth = (c: { x: number; z: number }): boolean => {
    const dx = c.x + 0.5 - eyeX;
    const dz = c.z + 0.5 - eyeZ;
    return dz < 0 && Math.abs(dx) <= -dz;
  };
  const hCache = new Map<number, number>();
  const hAt = (x: number, z: number): number => {
    const k = (x + 8192) * 16384 + (z + 8192);
    let v = hCache.get(k);
    if (v === undefined) {
      v = T.height(x, z);
      hCache.set(k, v);
    }
    return v;
  };
  /** 目から みきの どれかのマスの まん中へ 0.25 刻みで 線を引き、最初に当たる固いものが その木のみきなら 見える */
  const visible = (c: { x: number; z: number; g: number; trunk: number }): boolean => {
    for (let k = 0; k < 4; k++) {
      const tx = c.x + 0.5;
      const ty = c.g + 1 + k + 0.5;
      const tz = c.z + 0.5;
      const dx = tx - eyeX;
      const dy = ty - eyeY;
      const dz = tz - eyeZ;
      const n = Math.ceil(Math.hypot(dx, dy, dz) / 0.25);
      for (let i = 1; i <= n; i++) {
        const x = Math.floor(eyeX + (dx * i) / n);
        const y = Math.floor(eyeY + (dy * i) / n);
        const z = Math.floor(eyeZ + (dz * i) / n);
        if (x === c.x && z === c.z && y >= c.g + 1 && y <= c.g + c.trunk) return true;
        if (y <= hAt(x, z)) break; // 地面にさえぎられた
      }
    }
    return false;
  };
  const picked: typeof cand = [];
  const north = cand.find((c) => isNorth(c) && visible(c));
  if (north) picked.push(north);
  for (const c of cand) {
    if (picked.length >= K.startCount) break;
    if (!picked.includes(c)) picked.push(c);
  }
  const trees = picked.map((c): Tree => ({ x: c.x, z: c.z, y: c.g, trunk: c.trunk, leaves: 'leaves' }));
  const keys = new Set(picked.map((c) => plotKey(c.a, c.b)));
  const info = { trees, keys };
  starters.set(T, info);
  return info;
}

/** x,z の木になる割合（国で変わる。境目は まぜる） */
function treeChance(T: Terrain, x: number, z: number): number {
  const b = T.biome(x, z);
  return defOf(b.kind).trees * b.a + defOf(b.kind2).trees * (1 - b.a);
}

const chunkCache = new WeakMap<Terrain, Map<number, Tree[]>>();
const MAX_CHUNKS = 600;

/** 列 (cx, cz) の みきが ある木（上限のかけた後。plot の順 = b, a の順）。同じ (seed, cx, cz) なら いつも同じ */
export function treesOfChunk(T: Terrain, cx: number, cz: number): Tree[] {
  let m = chunkCache.get(T);
  if (!m) {
    m = new Map();
    chunkCache.set(T, m);
  }
  const key = (cx + 40000) * 80021 + (cz + 40000);
  const hit = m.get(key);
  if (hit) return hit;
  const sT = subSeed(T.seed, 401);
  const forced = startInfo(T).keys;
  const per = CHUNK_SIZE / PLOT;
  const cand: { a: number; b: number; p: { x: number; z: number; trunk: number }; g: number; order: number }[] = [];
  for (let b = cz * per; b < cz * per + per; b++) {
    for (let a = cx * per; a < cx * per + per; a++) {
      const p = plotPoint(sT, a, b);
      if (!forced.has(plotKey(a, b)) && hash01(sT, a, b, 2) >= treeChance(T, p.x, p.z)) continue;
      const g = treeGround(T, p.x, p.z);
      if (g < 0) continue;
      cand.push({ a, b, p, g, order: hash01(sT, a, b, 5) });
    }
  }
  // 1 列の上限: シード付きの順に見て、上限に来たら 大木は ふつうの木に、ふつうの木は それより後を置かない
  const byOrder = cand.slice().sort((u, v) => u.order - v.order);
  const keep = new Set<(typeof cand)[number]>();
  const bigOf = new Map<(typeof cand)[number], number>(); // 大木にした候補 → みきの根もとの高さ
  let nTrees = 0;
  let nBig = 0;
  for (const c of byOrder) {
    const b = T.biome(c.p.x, c.p.z);
    const def = defOf(b.kind);
    if (def.cap?.trees !== undefined && nTrees >= def.cap.trees) continue;
    keep.add(c);
    nTrees++;
    if (def.bigTree && hash01(sT, c.a, c.b, 3) < def.bigTree && (def.cap?.bigTrees === undefined || nBig < def.cap.bigTrees)) {
      const g1 = treeGround(T, c.p.x + 1, c.p.z);
      const g2 = treeGround(T, c.p.x, c.p.z + 1);
      const g3 = treeGround(T, c.p.x + 1, c.p.z + 1);
      // 太い みき（2×2）は 4 列の高さが ぴったり同じ所だけ（みきが 地面を つきぬけない）
      if (g1 === c.g && g2 === c.g && g3 === c.g) {
        bigOf.set(c, c.g);
        nBig++;
      }
    }
  }
  const out: Tree[] = [];
  for (const c of cand) {
    if (!keep.has(c)) continue;
    const def = defOf(T.biome(c.p.x, c.p.z).kind);
    const leaves = def.leaves ?? 'leaves';
    const g = bigOf.get(c);
    if (g !== undefined) out.push({ x: c.p.x, z: c.p.z, y: g, trunk: 10 + Math.floor(hash01(sT, c.a, c.b, 4) * 5), leaves, big: true });
    else out.push({ x: c.p.x, z: c.p.z, y: c.g, trunk: c.p.trunk, leaves });
  }
  if (m.size >= MAX_CHUNKS) m.delete(m.keys().next().value as number);
  m.set(key, out);
  return out;
}

/** みきの列が [x0, x1] × [z0, z1] の中にある木（plot の順） */
export function treesInRect(T: Terrain, x0: number, z0: number, x1: number, z1: number): Tree[] {
  const out: Tree[] = [];
  const c0x = Math.floor(x0 / CHUNK_SIZE);
  const c1x = Math.floor(x1 / CHUNK_SIZE);
  const c0z = Math.floor(z0 / CHUNK_SIZE);
  const c1z = Math.floor(z1 / CHUNK_SIZE);
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      for (const t of treesOfChunk(T, cx, cz)) if (t.x >= x0 && t.x <= x1 && t.z >= z0 && t.z <= z1) out.push(t);
    }
  }
  // 木のはっぱが かさなるときの順が どの列から見ても同じになるよう、plot の順にそろえる
  if (c1x > c0x || c1z > c0z) out.sort((u, v) => Math.floor(u.z / PLOT) - Math.floor(v.z / PLOT) || Math.floor(u.x / PLOT) - Math.floor(v.x / PLOT));
  return out;
}
