import { SEA_Y } from '../../contracts';
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
  /** みきの高さ 4〜5 */
  trunk: number;
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
  if (h < SEA_Y + C.strata.landFrom || h >= SEA_Y + C.strata.stoneTopFrom) return -1;
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
  const trees = picked.map((c) => ({ x: c.x, z: c.z, y: c.g, trunk: c.trunk }));
  const keys = new Set(picked.map((c) => plotKey(c.a, c.b)));
  const info = { trees, keys };
  starters.set(T, info);
  return info;
}

/** x,z の木になる割合（バイオームで変わる） */
function treeChance(T: Terrain, x: number, z: number): number {
  const t = T.biome(x, z).forest;
  const g = C.biomes.grassland.trees;
  return g + (C.biomes.forest.trees - g) * t;
}

/** みきの列が [x0, x1] × [z0, z1] の中にある木（区画の順） */
export function treesInRect(T: Terrain, x0: number, z0: number, x1: number, z1: number): Tree[] {
  const sT = subSeed(T.seed, 401);
  const forced = startInfo(T).keys;
  const out: Tree[] = [];
  const a0 = Math.floor((x0 - 1) / PLOT);
  const a1 = Math.floor((x1 - 1) / PLOT);
  const b0 = Math.floor((z0 - 1) / PLOT);
  const b1 = Math.floor((z1 - 1) / PLOT);
  for (let b = b0; b <= b1; b++) {
    for (let a = a0; a <= a1; a++) {
      const p = plotPoint(sT, a, b);
      if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
      if (!forced.has(plotKey(a, b)) && hash01(sT, a, b, 2) >= treeChance(T, p.x, p.z)) continue;
      const g = treeGround(T, p.x, p.z);
      if (g < 0) continue;
      out.push({ x: p.x, z: p.z, y: g, trunk: p.trunk });
    }
  }
  return out;
}
