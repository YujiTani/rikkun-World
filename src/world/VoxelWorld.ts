import { WORLD_SIZE, type BlockId, type VoxelWorld } from '../contracts';
import { BLOCK_TYPES, blockIdFromIndex, blockIndexOf, isSolidIndex } from './blocks/blockTypes';

export { WORLD_SIZE };
/** チャンクの横の大きさ（高さは世界ぜんぶ） */
export const CHUNK_SIZE = 16;

/** 配列でブロックを持つ VoxelWorld。変わったチャンクを覚えておく（描画側が takeDirtyChunks で受け取る） */
export class ArrayVoxelWorld implements VoxelWorld {
  readonly size: { x: number; y: number; z: number };
  readonly chunksX: number;
  readonly chunksZ: number;
  private readonly data: Uint8Array;
  private readonly dirty = new Set<number>();
  /** 光の計算し直し用: 前回の takeChangeBox() からあとに変わったマスをふくむ箱（無ければ null） */
  private changeBox: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null = null;

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
    this.noteChange(x, y, z, x, y, z);
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
    if (changed > 0) this.noteChange(xa, ya, za, xb, yb, zb);
    return changed;
  }

  private noteChange(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const b = this.changeBox;
    if (!b) {
      this.changeBox = { x0, y0, z0, x1, y1, z1 };
      return;
    }
    if (x0 < b.x0) b.x0 = x0;
    if (y0 < b.y0) b.y0 = y0;
    if (z0 < b.z0) b.z0 = z0;
    if (x1 > b.x1) b.x1 = x1;
    if (y1 > b.y1) b.y1 = y1;
    if (z1 > b.z1) b.z1 = z1;
  }

  /** 変わったマスをふくむ箱を渡して、覚えているのを空にする（光の計算し直し用） */
  takeChangeBox(): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number } | null {
    const b = this.changeBox;
    this.changeBox = null;
    return b;
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

  /**
   * (x, z) の列が変わった。チャンクの端なら、となりのチャンクの面も変わる。
   * reach: ふちから何マスまで となりに伝えるか（ブロックの変化は 1。光は面の角が 2 マス先まで読むので 2）
   */
  markDirty(x: number, z: number, reach = 1): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    this.dirty.add(this.chunkIndex(cx, cz));
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const dx = lx < reach && cx > 0 ? -1 : lx >= CHUNK_SIZE - reach && cx < this.chunksX - 1 ? 1 : 0;
    const dz = lz < reach && cz > 0 ? -1 : lz >= CHUNK_SIZE - reach && cz < this.chunksZ - 1 ? 1 : 0;
    if (dx !== 0) this.dirty.add(this.chunkIndex(cx + dx, cz));
    if (dz !== 0) this.dirty.add(this.chunkIndex(cx, cz + dz));
    if (dx !== 0 && dz !== 0 && reach > 1) this.dirty.add(this.chunkIndex(cx + dx, cz + dz));
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

