import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { GEN_CONFIG as C } from './config';
import { subSeed, valueNoise3 } from './random';
import type { Terrain } from './terrain';

/**
 * ふつうの ほらあな（3D ノイズの 細い 道。chunk.ts の carveCaves）の 空気を、列を 作らずに 1 マス ずつ 答える（MINE-1C）。
 * 坑道の 横穴が ほらあなに つながるか 見る ために 使う（仕様 §4.5.2。「ほかの 列の ブロックを 読まない」C10 を まもる ため、ブロックでは なく 計算で 見る）。
 *
 * carveCaves と 同じ 式: 4 ブロックおきの 格子の 値（Float32）を 三重一次補間し、2 本の ノイズが 0.5 から 半径 r の 円の 中なら 空気。
 * y は minY〜（地面の 高さ − topGap〔海の 列は seaGap〕）。そのあと 縦に 空気が 1 マスだけの 所を 石で うめる（C2）。
 * 同じ 式を 2 つ 書いて いる ので、`mineCaveAir.test.ts` が 実際の 列と 1 マス ずつ くらべて 見張る。
 */

const K = C.caves;
/** 格子の y の 数（k は 0〜これ） */
const NK = WORLD_HEIGHT / 4 + 1;
/** 1 つの 格子の 点で 覚える 最大数（列の 組）。古い 物から すてる */
const NODE_CAP = 6000;
const COL_CAP = 6000;

interface Node {
  a: Float32Array;
  b: Float32Array;
  /** 計算ずみの k（0 → まだ） */
  done: Uint8Array;
}

export class CaveAir {
  private readonly sA: number;
  private readonly sB: number;
  private readonly nodes = new Map<number, Node>();
  private readonly heights = new Map<number, number>();

  constructor(private readonly T: Terrain) {
    this.sA = subSeed(T.seed, 501);
    this.sB = subSeed(T.seed, 502);
  }

  /** 地面の 高さ（Terrain.height の おぼえ） */
  height(x: number, z: number): number {
    const k = (x + 65536) * 131072 + (z + 65536);
    let h = this.heights.get(k);
    if (h === undefined) {
      if (this.heights.size > 200000) this.heights.clear();
      h = this.T.height(x, z);
      this.heights.set(k, h);
    }
    return h;
  }

  /** 洞くつの 上限（この y まで 空気に して よい） */
  limit(x: number, z: number): number {
    const h = this.height(x, z);
    return h <= SEA_Y - 1 ? h - K.seaGap : h - K.topGap;
  }

  /** 格子の 点（ix, iz）の 値の 入れもの。k の 値は 初めて 聞かれた とき 計算する */
  private node(ix: number, iz: number, k: number): Node {
    const key = (ix + 20000) * 40000 + (iz + 20000);
    let n = this.nodes.get(key);
    if (!n) {
      if (this.nodes.size >= NODE_CAP) this.nodes.clear();
      n = { a: new Float32Array(NK + 1), b: new Float32Array(NK + 1), done: new Uint8Array(NK + 1) };
      this.nodes.set(key, n);
    }
    if (n.done[k] === 0) {
      const [ax, ay, az] = K.scaleA as [number, number, number];
      const [bx, by, bz] = K.scaleB as [number, number, number];
      n.a[k] = valueNoise3(this.sA, ix * 4, k * 4, iz * 4, ax, ay, az);
      n.b[k] = valueNoise3(this.sB, ix * 4, k * 4, iz * 4, bx, by, bz);
      n.done[k] = 1;
    }
    return n;
  }

  /** 縦 8 マスずつ 覚える（y の 窓）。窓が ない／空気が 1 つも ない ときは null */
  private readonly wins = new Map<number, Uint8Array | null>();
  private readonly raw = new Uint8Array(10);

  /** ノイズだけで 見た 空気（C2 の うめ前） */
  private rawAir(x: number, y: number, z: number): boolean {
    const ix = x >> 2;
    const iz = z >> 2;
    const k = y >> 2;
    const fx = (x & 3) / 4;
    const fy = (y & 3) / 4;
    const fz = (z & 3) / 4;
    const r2 = K.radius * K.radius;
    const a0 = this.node(ix, iz, k);
    const a1 = this.node(ix + 1, iz, k);
    const a2 = this.node(ix, iz + 1, k);
    const a3 = this.node(ix + 1, iz + 1, k);
    const b0 = this.node(ix, iz, k + 1);
    const b1 = this.node(ix + 1, iz, k + 1);
    const b2 = this.node(ix, iz + 1, k + 1);
    const b3 = this.node(ix + 1, iz + 1, k + 1);
    const d1 = tri(a0.a[k]!, a1.a[k]!, a2.a[k]!, a3.a[k]!, b0.a[k + 1]!, b1.a[k + 1]!, b2.a[k + 1]!, b3.a[k + 1]!, fx, fy, fz) - 0.5;
    if (d1 * d1 >= r2) return false;
    const d2 = tri(a0.b[k]!, a1.b[k]!, a2.b[k]!, a3.b[k]!, b0.b[k + 1]!, b1.b[k + 1]!, b2.b[k + 1]!, b3.b[k + 1]!, fx, fy, fz) - 0.5;
    return d1 * d1 + d2 * d2 < r2;
  }

  private computeWin(x: number, z: number, w: number): Uint8Array | null {
    const lim = this.limit(x, z);
    if (lim < K.minY) return null;
    const base = w * 8 - 1;
    const lo = Math.max(K.minY, base);
    const hi = Math.min(lim, w * 8 + 8);
    if (lo > hi) return null;
    const raw = this.raw;
    raw.fill(0);
    for (let y = lo; y <= hi; y++) raw[y - base] = this.rawAir(x, y, z) ? 1 : 0;
    let out: Uint8Array | null = null;
    for (let y = Math.max(K.minY, w * 8); y <= Math.min(lim, w * 8 + 7); y++) {
      if (raw[y - base] !== 1) continue;
      // C2: たてに 空気が 1 マスだけの 所は いしで うめる
      const below = y === K.minY || raw[y - 1 - base] !== 1;
      const above = y === lim || raw[y + 1 - base] !== 1;
      if (below && above) continue;
      (out ??= new Uint8Array(8))[y & 7] = 1;
    }
    return out;
  }

  /** (x, y, z) は ほらあなの 空気か */
  airAt(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= WORLD_HEIGHT) return false;
    const w = y >> 3;
    const key = ((x + 65536) * 131072 + (z + 65536)) * 64 + w;
    let win = this.wins.get(key);
    if (win === undefined) {
      if (this.wins.size >= COL_CAP * 8) this.wins.clear();
      win = this.computeWin(x, z, w);
      this.wins.set(key, win);
    }
    return win !== null && win[y & 7] === 1;
  }
}

/** carveCaves の tri と 同じ 並び・同じ 式（8 つの 角: 下の 層〔x0z0・x1z0・x0z1・x1z1〕→ 上の 層） */
function tri(c0: number, c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number, fx: number, fy: number, fz: number): number {
  const x00 = c0 + (c1 - c0) * fx;
  const x10 = c2 + (c3 - c2) * fx;
  const x01 = c4 + (c5 - c4) * fx;
  const x11 = c6 + (c7 - c6) * fx;
  const z0 = x00 + (x10 - x00) * fz;
  const z1 = x01 + (x11 - x01) * fz;
  return z0 + (z1 - z0) * fy;
}

const cavesFor = new WeakMap<Terrain, CaveAir>();
export function caveAirFor(T: Terrain): CaveAir {
  let c = cavesFor.get(T);
  if (!c) cavesFor.set(T, (c = new CaveAir(T)));
  return c;
}
