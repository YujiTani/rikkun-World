import { SEA_Y } from '../../contracts';
import type { Geo } from './mineShaftSite';

/** 地図の 入れもの。a ＝ 0 岩・1 空気・2 水。b ＝ 置く ブロック（0 ＝ 自然のまま）。s ＝ 1 部屋の となり・2 床の 下の 追加 */
export class Grid {
  readonly a: Uint8Array;
  readonly b: Uint8Array;
  readonly s: Uint8Array;
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly z0: number,
    readonly gx: number,
    readonly gy: number,
    readonly gz: number,
  ) {
    const n = gx * gy * gz;
    this.a = new Uint8Array(n);
    this.b = new Uint8Array(n);
    this.s = new Uint8Array(n);
  }
  inside(x: number, y: number, z: number): boolean {
    const i = x - this.x0;
    const j = y - this.y0;
    const k = z - this.z0;
    return i >= 0 && j >= 0 && k >= 0 && i < this.gx && j < this.gy && k < this.gz;
  }
  idx(x: number, y: number, z: number): number {
    return ((y - this.y0) * this.gz + (z - this.z0)) * this.gx + (x - this.x0);
  }
}

export const SIX: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const FOUR: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const NONE = -0x7fffffff;

/** 部屋と 自然の 世界を あわせて 答える（穴の しらべ用） */
export class Combined {
  /** 自然の 空気か（0 ＝ まだ・1 ＝ 空気・2 ＝ 岩）。地図の 中だけ おぼえる */
  private readonly nat: Int8Array;
  private readonly heights: Int32Array;
  private readonly far = new Map<number, number>();
  constructor(
    private readonly g: Grid,
    private readonly G: Geo,
  ) {
    this.nat = new Int8Array(g.gx * g.gy * g.gz);
    this.heights = new Int32Array(g.gx * g.gz).fill(NONE);
  }
  /** 地面の 高さ（列ごとに おぼえる） */
  private h(x: number, z: number): number {
    const i = x - this.g.x0;
    const k = z - this.g.z0;
    if (i >= 0 && k >= 0 && i < this.g.gx && k < this.g.gz) {
      const j = k * this.g.gx + i;
      let v = this.heights[j]!;
      if (v === NONE) this.heights[j] = v = this.G.h(x, z);
      return v;
    }
    const key = x * 4194304 + z;
    let v = this.far.get(key);
    if (v === undefined) this.far.set(key, (v = this.G.h(x, z)));
    return v;
  }
  natAir(x: number, y: number, z: number): boolean {
    if (y <= 0) return false;
    if (this.g.inside(x, y, z)) {
      const i = this.g.idx(x, y, z);
      let v = this.nat[i]!;
      if (v === 0) this.nat[i] = v = y <= this.h(x, z) && this.G.cave.airAt(x, y, z) ? 1 : 2;
      return v === 1;
    }
    return y <= this.h(x, z) && this.G.cave.airAt(x, y, z);
  }
  natSolid(x: number, y: number, z: number): boolean {
    if (y <= 0) return true;
    if (y > this.h(x, z)) return false;
    return !this.natAir(x, y, z);
  }
  solid(x: number, y: number, z: number): boolean {
    if (this.g.inside(x, y, z)) {
      const i = this.g.idx(x, y, z);
      if (this.g.a[i]) return false;
      if (this.g.b[i]) return true;
    }
    return this.natSolid(x, y, z);
  }
  body(x: number, y: number, z: number): boolean {
    if (this.g.inside(x, y, z)) {
      const i = this.g.idx(x, y, z);
      if (this.g.a[i]) return this.g.a[i] === 1;
      if (this.g.b[i]) return false;
    }
    return !this.natSolid(x, y, z) && !(y <= SEA_Y && y > this.h(x, z));
  }
  standable(x: number, y: number, z: number): boolean {
    return this.body(x, y, z) && this.body(x, y + 1, z) && this.solid(x, y - 1, z);
  }
  /** 東西南北 1 歩（仕様 §6.1 の 歩ける きまり） */
  step(x: number, y: number, z: number, dx: number, dz: number): { x: number; y: number; z: number } | null {
    const nx = x + dx;
    const nz = z + dz;
    if (this.standable(nx, y, nz)) return { x: nx, y, z: nz };
    if (this.standable(nx, y - 1, nz) && this.body(nx, y + 1, nz)) return { x: nx, y: y - 1, z: nz };
    if (this.standable(nx, y + 1, nz) && this.body(x, y + 2, z) && this.body(x, y + 3, z)) return { x: nx, y: y + 1, z: nz };
    return null;
  }
  isRoomAir(x: number, y: number, z: number): boolean {
    return this.g.inside(x, y, z) && this.g.a[this.g.idx(x, y, z)] === 1;
  }
}

