import { CHUNK_SIZE } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { DIR_X, DIR_Z, mouthOfChunk, type Mouth } from './mouths';
import { spawnOf, terrainFor } from './terrain';

/**
 * 仮の regions・置きもの・洞くつの口を決める四角 R（VOX-D G1）。
 * 世界は列ごとにどこまでも続く。R は「スタートのまわり 128×128」で、ブロックを読みこまずに高さだけで調べる範囲。
 * 読みこんでいる列・テレポートに関係なく、同じシードなら同じ四角。
 */

export interface Bounds {
  x0: number;
  z0: number;
  /** ふくまない（x0 + 128） */
  x1: number;
  z1: number;
}

/** R の はば（ブロック） */
export const REGION_SIZE = 128;

const rects = new Map<number, Bounds>();

/** G1: スタートのマス (sx, sz) から x = sx−64 〜 sx+63、z = sz−64 〜 sz+63 の 128×128（x1・z1 はふくまない） */
export function regionRect(seed: number): Bounds {
  const hit = rects.get(seed);
  if (hit) return { ...hit };
  const sp = spawnOf(seed);
  const b: Bounds = { x0: sp.x - REGION_SIZE / 2, z0: sp.z - REGION_SIZE / 2, x1: sp.x + REGION_SIZE / 2, z1: sp.z + REGION_SIZE / 2 };
  if (rects.size >= 8) rects.delete(rects.keys().next().value as number);
  rects.set(seed, b);
  return { ...b };
}

export interface MouthInfo {
  x: number;
  y: number;
  z: number;
  dir: 0 | 1 | 2 | 3;
  room: { x: number; y: number; z: number };
}

/**
 * R の中の 洞くつの口（G5）。さか道とへやが 全部 R の中にあるものだけ。
 * y は 入り口で立つ所（足もとの空気のマス = 下が固い）。
 */
export function mouthsInRegion(seed: number, b: Bounds = regionRect(seed)): MouthInfo[] {
  const T = terrainFor(seed);
  const K = C.caves;
  const out: MouthInfo[] = [];
  const half = (K.roomSize - 1) / 2;
  const cx0 = Math.floor(b.x0 / CHUNK_SIZE) - 2;
  const cx1 = Math.floor((b.x1 - 1) / CHUNK_SIZE) + 2;
  const cz0 = Math.floor(b.z0 / CHUNK_SIZE) - 2;
  const cz1 = Math.floor((b.z1 - 1) / CHUNK_SIZE) + 2;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const m: Mouth | null = mouthOfChunk(T, cx, cz);
      if (m === null) continue;
      if (!mouthInside(m, b, half)) continue;
      out.push({ x: m.x, y: m.h0 + 1, z: m.z, dir: m.dir, room: { ...m.room } });
    }
  }
  return out;
}

function mouthInside(m: Mouth, b: Bounds, half: number): boolean {
  const K = C.caves;
  const dx = DIR_X[m.dir]!;
  const dz = DIR_Z[m.dir]!;
  const px = -dz;
  const pz = dx;
  for (let k = 0; k < K.rampLength + K.roomSize; k++) {
    const l = k < K.rampLength ? (K.rampWidth - 1) / 2 : half;
    for (let s = -l; s <= l; s++) {
      const x = m.x + k * dx + s * px;
      const z = m.z + k * dz + s * pz;
      if (x < b.x0 || z < b.z0 || x >= b.x1 || z >= b.z1) return false;
    }
  }
  return true;
}
