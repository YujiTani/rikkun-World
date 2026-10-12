import type { BlockId, VoxelWorld } from '../contracts';
import { BLOCK_TYPES, blockIdFromIndex, blockIndexOf, isSolidIndex } from './blocks/blockTypes';

export const WORLD_SIZE = { x: 64, y: 32, z: 64 } as const;
/** チャンクの横の大きさ（高さは世界ぜんぶ） */
export const CHUNK_SIZE = 16;

/** 配列でブロックを持つ VoxelWorld。変わったチャンクを覚えておく（描画側が takeDirtyChunks で受け取る） */
export class ArrayVoxelWorld implements VoxelWorld {
  readonly size: { x: number; y: number; z: number };
  readonly chunksX: number;
  readonly chunksZ: number;
  private readonly data: Uint8Array;
  private readonly dirty = new Set<number>();

  constructor(size: { x: number; y: number; z: number } = WORLD_SIZE) {
    this.size = { ...size };
    this.chunksX = Math.ceil(size.x / CHUNK_SIZE);
    this.chunksZ = Math.ceil(size.z / CHUNK_SIZE);
    this.data = new Uint8Array(size.x * size.y * size.z);
    this.markAllDirty();
  }

  private inRange(x: number, y: number, z: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      Number.isInteger(z) &&
      x >= 0 &&
      x < this.size.x &&
      y >= 0 &&
      y < this.size.y &&
      z >= 0 &&
      z < this.size.z
    );
  }

  private index(x: number, y: number, z: number): number {
    return (y * this.size.z + z) * this.size.x + x;
  }

  /** ブロックの番号（BLOCK_TYPES の順）。範囲外は -1。描画の高速な読み出し用 */
  getIndex(x: number, y: number, z: number): number {
    if (!this.inRange(x, y, z)) return -1;
    return this.data[this.index(x, y, z)];
  }

  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    const i = this.getIndex(x, y, z);
    return i < 0 ? 'outside' : blockIdFromIndex(i);
  }

  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    const b = blockIndexOf(id);
    if (b < 0 || !this.inRange(x, y, z)) return false;
    const i = this.index(x, y, z);
    if (this.data[i] === b) return true;
    this.data[i] = b;
    this.markDirty(x, z);
    return true;
  }

  isSolid(x: number, y: number, z: number): boolean {
    const i = this.getIndex(x, y, z);
    return i >= 0 && isSolidIndex(i);
  }

  /** 2 つの角をふくむ箱の中をすべて id にする。変えたブロックの数を返す（範囲外は変えない） */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number {
    const b = blockIndexOf(id);
    if (b < 0) return 0;
    const lo = (a: number, c: number) => Math.max(0, Math.ceil(Math.min(a, c)));
    const xa = lo(x0, x1);
    const ya = lo(y0, y1);
    const za = lo(z0, z1);
    const xb = Math.min(this.size.x - 1, Math.floor(Math.max(x0, x1)));
    const yb = Math.min(this.size.y - 1, Math.floor(Math.max(y0, y1)));
    const zb = Math.min(this.size.z - 1, Math.floor(Math.max(z0, z1)));
    let changed = 0;
    for (let y = ya; y <= yb; y++) {
      for (let z = za; z <= zb; z++) {
        for (let x = xa; x <= xb; x++) {
          const i = this.index(x, y, z);
          if (this.data[i] !== b) {
            this.data[i] = b;
            changed++;
            this.markDirty(x, z);
          }
        }
      }
    }
    return changed;
  }

  /** 種類ごとの個数（0 個の種類もふくむ） */
  countBlocks(): Record<BlockId, number> {
    const counts = new Array<number>(BLOCK_TYPES.length).fill(0);
    for (let i = 0; i < this.data.length; i++) counts[this.data[i]]++;
    const out = {} as Record<BlockId, number>;
    BLOCK_TYPES.forEach((t, i) => {
      out[t.id] = counts[i];
    });
    return out;
  }

  /** 全ブロックから作った文字列（FNV-1a）。同じ世界なら同じ */
  hash(): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.data.length; i++) {
      h ^= this.data[i];
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0') + `-${this.data.length}`;
  }

  chunkIndex(cx: number, cz: number): number {
    return cz * this.chunksX + cx;
  }

  private markAllDirty(): void {
    for (let i = 0; i < this.chunksX * this.chunksZ; i++) this.dirty.add(i);
  }

  /** (x, z) の列が変わった。チャンクの端なら、となりのチャンクの面も変わる */
  private markDirty(x: number, z: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.dirty.add(this.chunkIndex(cx, cz));
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    if (lx === 0 && cx > 0) this.dirty.add(this.chunkIndex(cx - 1, cz));
    if (lx === CHUNK_SIZE - 1 && cx < this.chunksX - 1) this.dirty.add(this.chunkIndex(cx + 1, cz));
    if (lz === 0 && cz > 0) this.dirty.add(this.chunkIndex(cx, cz - 1));
    if (lz === CHUNK_SIZE - 1 && cz < this.chunksZ - 1) this.dirty.add(this.chunkIndex(cx, cz + 1));
  }

  /** 変わったチャンクの番号を渡して、覚えているのを空にする */
  takeDirtyChunks(): number[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }

  hasDirtyChunks(): boolean {
    return this.dirty.size > 0;
  }
}

