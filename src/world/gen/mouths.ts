import { SEA_Y } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { hash01, hashInts, subSeed } from './random';
import type { Terrain } from './terrain';

/**
 * 洞くつの口（C4）。歩いて入って歩いて出られる さか道（はば 3・高さ 3・1 マスに 1 段下がる）と、奥の へや。
 * 位置は列ごとの hash だけで決まり、高さ H だけで調べるので、作る順に関係ない。
 */

/** dir = yaw 0/90/180/270（北・東・南・西）の向き */
export const DIR_X = [0, 1, 0, -1] as const;
export const DIR_Z = [-1, 0, 1, 0] as const;

export interface Mouth {
  /** 口を決めた列 */
  mcx: number;
  mcz: number;
  /** 入り口の列（地面の高さ h0。立つのは h0 + 1） */
  x: number;
  z: number;
  h0: number;
  dir: 0 | 1 | 2 | 3;
  /** へやの まん中の 床で立てる所 */
  room: { x: number; y: number; z: number };
}

const caches = new WeakMap<Terrain, Map<number, Mouth | null>>();

function cacheOf(T: Terrain): Map<number, Mouth | null> {
  let m = caches.get(T);
  if (!m) {
    m = new Map();
    caches.set(T, m);
  }
  return m;
}

const mkey = (cx: number, cz: number): number => (cx + 70000) * 140009 + (cz + 70000);

/** さか道の k 番目（0〜rampLength−1）の足もと（立つ空気のマス）の y */
export const rampFloor = (h0: number, k: number): number => h0 + 1 - k;
/** へやの 足もとの y */
export const roomFloor = (h0: number): number => h0 + 1 - C.caves.rampLength;

function tryMouth(T: Terrain, mcx: number, mcz: number, tryNo: number): Mouth | null {
  const K = C.caves;
  const s = subSeed(T.seed, 301);
  const x = mcx * 16 + (hashInts(s, mcx, mcz, 10 + tryNo) & 15);
  const z = mcz * 16 + ((hashInts(s, mcx, mcz, 20 + tryNo) >>> 4) & 15);
  const dir = (hashInts(s, mcx, mcz, 30 + tryNo) >>> 8) & 3;
  const sp = T.spawn();
  if (Math.max(Math.abs(x - sp.x), Math.abs(z - sp.z)) <= K.mouthFarFromStart) return null;
  const h0 = T.height(x, z);
  if (h0 < SEA_Y + K.mouthLandFrom) return null;
  const dx = DIR_X[dir]!;
  const dz = DIR_Z[dir]!;
  const px = -dz;
  const pz = dx;
  // さか道: 中心線は 足もとの下に 地面があり、よこの列も 陸（水を掘りぬかない）
  for (let k = 0; k < K.rampLength; k++) {
    const cx = x + k * dx;
    const cz = z + k * dz;
    const hc = T.height(cx, cz);
    if (hc < h0 - k || hc < SEA_Y + 2) return null;
    for (const l of [-1, 1]) {
      if (T.height(cx + l * px, cz + l * pz) < SEA_Y + 2) return null;
    }
  }
  // へや: 屋根の ぶんの 地面があり、陸
  const half = (K.roomSize - 1) / 2;
  for (let k = K.rampLength; k < K.rampLength + K.roomSize; k++) {
    for (let l = -half; l <= half; l++) {
      const hh = T.height(x + k * dx + l * px, z + k * dz + l * pz);
      if (hh < h0 - 7 || hh < SEA_Y + 2) return null;
    }
  }
  const mid = K.rampLength + half;
  return {
    mcx,
    mcz,
    x,
    z,
    h0,
    dir: dir as 0 | 1 | 2 | 3,
    room: { x: x + mid * dx, y: roomFloor(h0), z: z + mid * dz },
  };
}

/**
 * 重なりをさけるための「もとの口」（重なりを見る前の、列で決めた口）。順番が先の列の もとの口と重なる口は やめる。
 * 「もとの口」どうしで比べるので 再帰しない（やめた口を 比べに使うことがあるが、順番は決まっているので 作る順に関係ない）。
 * 2 つの口が 残っていれば、先の列の口は 比べたとおり もとの口なので かさならない。
 */
function baseMouth(T: Terrain, mcx: number, mcz: number): Mouth | null {
  const cache = baseCacheOf(T);
  const key = mkey(mcx, mcz);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let m: Mouth | null = null;
  if (hash01(subSeed(T.seed, 300), mcx, mcz, 1) < C.caves.mouthChance) {
    for (let t = 0; t < C.caves.mouthTries && m === null; t++) m = tryMouth(T, mcx, mcz, t);
  }
  if (cache.size > 20000) cache.clear();
  cache.set(key, m);
  return m;
}

const baseCaches = new WeakMap<Terrain, Map<number, Mouth | null>>();
function baseCacheOf(T: Terrain): Map<number, Mouth | null> {
  let m = baseCaches.get(T);
  if (!m) {
    m = new Map();
    baseCaches.set(T, m);
  }
  return m;
}

function overlapsEarlier(T: Terrain, m: Mouth): boolean {
  const K = C.caves;
  const reach = 3;
  const half = (K.roomSize - 1) / 2;
  const dx = DIR_X[m.dir]!;
  const dz = DIR_Z[m.dir]!;
  for (let cz = m.mcz - reach; cz <= m.mcz; cz++) {
    for (let cx = m.mcx - reach; cx <= m.mcx + reach; cx++) {
      if (cz === m.mcz && cx >= m.mcx) break;
      const o = baseMouth(T, cx, cz);
      if (o === null) continue;
      for (let k = 0; k < K.rampLength + K.roomSize; k++) {
        const l = k < K.rampLength ? (K.rampWidth - 1) / 2 : half;
        for (let s = -l; s <= l; s++) if (inMouthFootprint(o, m.x + k * dx + s * -dz, m.z + k * dz + s * dx, 2)) return true;
      }
    }
  }
  return false;
}

/** 列 (mcx, mcz) で決めた 口（なければ null）。4 列に 1 つ */
export function mouthOfChunk(T: Terrain, mcx: number, mcz: number): Mouth | null {
  const cache = cacheOf(T);
  const key = mkey(mcx, mcz);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let m = baseMouth(T, mcx, mcz);
  if (m !== null && overlapsEarlier(T, m)) m = null;
  if (cache.size > 20000) cache.clear();
  cache.set(key, m);
  return m;
}

/** 口の さか道・へやが とどく 列のはんい（入り口の列から ±range） */
export const MOUTH_REACH_CHUNKS = 2;

/** 列 (cx, cz) に かかるかもしれない 口たち（まわり 5×5 列で決めた口） */
export function mouthsNear(T: Terrain, cx: number, cz: number, range = MOUTH_REACH_CHUNKS): Mouth[] {
  const out: Mouth[] = [];
  for (let dz = -range; dz <= range; dz++) {
    for (let dx = -range; dx <= range; dx++) {
      const m = mouthOfChunk(T, cx + dx, cz + dz);
      if (m) out.push(m);
    }
  }
  return out;
}

/** 口の 外わく（さか道とへや）に (x,z) が margin ブロックの内側で入っているか */
export function inMouthFootprint(m: Mouth, x: number, z: number, margin = 0): boolean {
  const K = C.caves;
  const dx = DIR_X[m.dir]!;
  const dz = DIR_Z[m.dir]!;
  // 向きの軸（k）と よこ（l）の座標
  const k = (x - m.x) * dx + (z - m.z) * dz;
  const l = (x - m.x) * -dz + (z - m.z) * dx;
  const half = (K.roomSize - 1) / 2;
  return k >= -margin && k <= K.rampLength + K.roomSize - 1 + margin && Math.abs(l) <= half + margin;
}

/** (x,z) に かかる 口があるか */
export function nearMouth(T: Terrain, x: number, z: number, margin: number): boolean {
  const cx = x >> 4;
  const cz = z >> 4;
  for (const m of mouthsNear(T, cx, cz)) if (inMouthFootprint(m, x, z, margin)) return true;
  return false;
}

/**
 * 口が 空気にするマス (x, z) の y のはんい（なければ null）。
 * さか道: 足もと rampFloor(k) から 3 マス（はば 3）。へや: 足もと roomFloor から 3 マス（5×5）。
 */
export function mouthAirRange(m: Mouth, x: number, z: number): [number, number] | null {
  const K = C.caves;
  const dx = DIR_X[m.dir]!;
  const dz = DIR_Z[m.dir]!;
  const k = (x - m.x) * dx + (z - m.z) * dz;
  const l = Math.abs((x - m.x) * -dz + (z - m.z) * dx);
  if (k < 0) return null;
  if (k < K.rampLength) {
    if (l > (K.rampWidth - 1) / 2) return null;
    const y0 = rampFloor(m.h0, k);
    return [y0, y0 + K.rampHeight - 1];
  }
  if (k < K.rampLength + K.roomSize) {
    if (l > (K.roomSize - 1) / 2) return null;
    const y0 = roomFloor(m.h0);
    return [y0, y0 + K.roomHeight - 1];
  }
  return null;
}
