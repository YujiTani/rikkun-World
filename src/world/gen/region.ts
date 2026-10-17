import { CHUNK_SIZE, SEA_Y, WORLD_HEIGHT, type ChunkColumn } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { HW, LAYER, buildBlocks, toSections, writeStrata } from './chunk';
import { GEN_CONFIG as C } from './config';
import { DIR_X, DIR_Z, mouthOfChunk, type Mouth } from './mouths';
import { terrainFor } from './terrain';

/**
 * 読みこむ範囲（VOX-B では 8×8 列に固定。VOX-D で動かす）の作りかたと、仮の海のふち（S6）。
 * 仮の海のふちは 読みこむところでかける。`generateChunk` の中ではかけない（無限の世界の本物の形のまま）。
 */

export interface Bounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** 読みこむ範囲: cx, cz = 0〜7 の 64 列（x・z = 0〜127） */
export const LOAD_BOUNDS: Bounds = { x0: 0, z0: 0, x1: 128, z1: 128 };

const AIR = BLOCK_INDEX.air;
const STONE = BLOCK_INDEX.stone;

/** S6: はしからの距離 e（いちばん外の列 = 0）の列の高さ。e ≤ 3 は 深さ 4 の海、そこから 1 マスに 1 段 */
export function edgeHeight(h: number, e: number): number {
  return Math.min(h, SEA_Y - C.edge.deep + Math.max(0, e - C.edge.flat));
}

/** (x, z) の はし（Bounds）からの距離 e */
export function edgeDistance(b: Bounds, x: number, z: number): number {
  return Math.min(x - b.x0, z - b.z0, b.x1 - 1 - x, b.z1 - 1 - z);
}

/** ブロックの並びに 仮の海のふちをかける。heights（18×18）も その列の高さに直す */
export function applyEdgeSea(blocks: Uint8Array, heights: Int16Array, cx: number, cz: number, b: Bounds, seed: number): void {
  const T = terrainFor(seed);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  // どの列も ふちから 50 より内側なら 何もしない（高さは 270 まで ＝ e ≤ 3 + 270 − 140）
  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const e = edgeDistance(b, x0 + lx, z0 + lz);
      const hi = (lz + 1) * HW + lx + 1;
      const h = heights[hi]!;
      const cut = edgeHeight(h, e);
      if (cut >= h) continue;
      const base = lz * CHUNK_SIZE + lx;
      // H' より上の物（木・岩・はっぱ・たけ）は消す。大木は みき 14 ＋ はっぱ 2 まで
      const top = Math.min(WORLD_HEIGHT - 1, Math.max(h + 20, SEA_Y));
      for (let y = cut + 1; y <= top; y++) blocks[y * LAYER + base] = AIR;
      // 下の 洞くつは 海の底にあなをあけない（H'−10〜H'−2 は いしでうめる）
      for (let y = Math.max(1, cut - 10); y <= cut - 2; y++) if (blocks[y * LAYER + base] === AIR) blocks[y * LAYER + base] = STONE;
      writeStrata(blocks, lx, lz, cut, false, Math.max(1, cut - 12), T.topBlock(x0 + lx, z0 + lz, cut));
      heights[hi] = cut;
    }
  }
}

/** 列を 1 つ作り、仮の海のふちをかける（読みこむ用） */
export function generateLoaded(seed: number, cx: number, cz: number, bounds: Bounds = LOAD_BOUNDS): { column: ChunkColumn; heights: Int16Array } {
  const built = buildBlocks(seed, cx, cz);
  applyEdgeSea(built.blocks, built.heights, cx, cz, bounds, seed);
  return { column: { cx, cz, sections: toSections(built.blocks) }, heights: built.heights };
}

export interface MouthInfo {
  x: number;
  y: number;
  z: number;
  dir: 0 | 1 | 2 | 3;
  room: { x: number; y: number; z: number };
}

/**
 * 読みこむ範囲の 洞くつの口。さか道とへやが 全部 範囲の中で、仮の海のふちに かからないものだけ。
 * y は 入り口で立つ所（足もとの空気のマス = 下が固い）。
 */
export function mouthsInBounds(seed: number, b: Bounds = LOAD_BOUNDS): MouthInfo[] {
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
      if (!mouthInside(T, m, b, half)) continue;
      out.push({ x: m.x, y: m.h0 + 1, z: m.z, dir: m.dir, room: { ...m.room } });
    }
  }
  return out;
}

function mouthInside(T: ReturnType<typeof terrainFor>, m: Mouth, b: Bounds, half: number): boolean {
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
      const h = T.height(x, z);
      if (edgeHeight(h, edgeDistance(b, x, z)) < h) return false;
    }
  }
  return true;
}
