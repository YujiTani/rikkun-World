import { CHUNK_SIZE, SECTION_SIZE, type BlockId } from '../contracts';
import { BLOCK_TYPES } from './blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from './sections';
import type { Column } from './voxelColumn';

/** 世界の中身を 数える・まとめる（ChunkedVoxelWorld から分けた。4-7） */

/** ハッシュが 世界から 読むもの */
interface HashSource {
  readonly size: { readonly y: number };
  getIndex(x: number, y: number, z: number): number;
  colAt(cx: number, cz: number): Column | null;
}

/**
 * 原点から (sx, size.y, sz) の四角の全ブロック番号を、平らな番号 (y * sz + z) * sx + x で out に写す
 * （テスト用。保存は VOX-F から さわった列だけを書くので、これは使わない。読みこんでいない所は書きかえない）
 */
export function fillFlat(columns: ReadonlyMap<number, Column>, sizeY: number, out: Uint8Array, sx: number, sz: number): void {
  for (const c of columns.values()) {
    const bx = c.cx * CHUNK_SIZE;
    const bz = c.cz * CHUNK_SIZE;
    if (bx < 0 || bz < 0 || bx >= sx || bz >= sz) continue;
    const w = Math.min(CHUNK_SIZE, sx - bx);
    for (let sy = 0; sy < c.sections.length; sy++) {
      const arr = sectionToArray(c.sections[sy]);
      for (let ly = 0; ly < SECTION_SIZE; ly++) {
        const y = sy * SECTION_SIZE + ly;
        if (y >= sizeY) break;
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const z = bz + lz;
          if (z >= sz) break;
          const o = (ly * 16 + lz) * 16;
          out.set(arr.subarray(o, o + w), (y * sz + z) * sx + bx);
        }
      }
    }
  }
}

/** 種類ごとの個数（0 個の種類もふくむ） */
export function countBlocks(columns: ReadonlyMap<number, Column>): Record<BlockId, number> {
  const counts = new Array<number>(BLOCK_TYPES.length).fill(0);
  for (const c of columns.values()) {
    for (const s of c.sections) {
      if (s.kind === 'uniform') counts[s.block] += SECTION_VOLUME;
      else {
        const arr = sectionToArray(s);
        for (let i = 0; i < SECTION_VOLUME; i++) counts[arr[i]]++;
      }
    }
  }
  const out = {} as Record<BlockId, number>;
  BLOCK_TYPES.forEach((t, i) => {
    out[t.id] = counts[i];
  });
  return out;
}

/** 読みこんだ範囲の全ブロックから作った文字列（FNV-1a。順は y, z, x）。同じ世界なら同じ */
export function hashWorld(columns: ReadonlyMap<number, Column>, w: HashSource): string {
  const list = [...columns.values()].sort((a, b) => a.cz - b.cz || a.cx - b.cx);
  let h = 0x811c9dc5;
  let n = 0;
  for (const c of list) {
    const ox = c.cx * CHUNK_SIZE;
    const oz = c.cz * CHUNK_SIZE;
    for (let y = 0; y < w.size.y; y++) {
      for (let z = oz; z < oz + CHUNK_SIZE; z++) {
        for (let x = ox; x < ox + CHUNK_SIZE; x++) {
          h ^= w.getIndex(x, y, z);
          h = Math.imul(h, 0x01000193);
          n++;
        }
      }
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0') + `-${n}`;
}

/** 1 列だけのハッシュ（FNV-1a。順は y, z, x）。読みこんでいなければ 'none' */
export function hashColumn(w: HashSource, cx: number, cz: number): string {
  if (w.colAt(cx, cz) === null) return 'none';
  let h = 0x811c9dc5;
  for (let y = 0; y < w.size.y; y++)
    for (let z = cz * 16; z < cz * 16 + 16; z++)
      for (let x = cx * 16; x < cx * 16 + 16; x++) {
        h ^= w.getIndex(x, y, z);
        h = Math.imul(h, 0x01000193);
      }
  return (h >>> 0).toString(16).padStart(8, '0');
}
