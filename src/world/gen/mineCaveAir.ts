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
/** 高さの おぼえの 数（2 の H_BITS 乗 か所） */
const H_BITS = 16;
/** 窓の おぼえの 列の 数（2 の W_BITS 乗 列） */
const W_BITS = 15;
/** 1 列の 窓の 数（縦 8 マスずつ） */
const NW = WORLD_HEIGHT / 8;

/** (x, z) から おぼえの 位置を きめる（まぜて 下の bits だけ 使う） */
function slotOf(x: number, z: number, bits: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> (32 - bits);
}

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
  /** 高さの おぼえ（場所から きめる 位置に 1 つ。-1 ＝ 空き） */
  private readonly hKeys = new Float64Array(1 << H_BITS).fill(-1);
  private readonly hVals = new Float64Array(1 << H_BITS);
  /** 窓の おぼえ（列の 位置に 1 つ。wKeys ＝ 列の 番号、wDone ＝ 窓ごとの 計算ずみ、wAir ＝ 空気） */
  private readonly wKeys = new Float64Array(1 << W_BITS).fill(-1);
  private readonly wDone = new Uint8Array(NW << W_BITS);
  private readonly wAir = new Uint8Array(WORLD_HEIGHT << W_BITS);

  constructor(private readonly T: Terrain) {
    this.sA = subSeed(T.seed, 501);
    this.sB = subSeed(T.seed, 502);
  }

  /** 地面の 高さ（Terrain.height の おぼえ。ぶつかったら 古い 方を 上書き＝計算は 同じ 結果） */
  height(x: number, z: number): number {
    const key = (x + 65536) * 131072 + (z + 65536);
    const slot = slotOf(x, z, H_BITS);
    if (this.hKeys[slot] === key) return this.hVals[slot]!;
    const h = this.T.height(x, z);
    this.hKeys[slot] = key;
    this.hVals[slot] = h;
    return h;
  }

  /** 洞くつの 上限（この y まで 空気に して よい） */
  limit(x: number, z: number): number {
    const h = this.height(x, z);
    return h <= SEA_Y - 1 ? h - K.seaGap : h - K.topGap;
  }

  /** 格子の 点（ix, iz）の 値の 入れもの（なければ 作る。値は fill で 入れる） */
  private node(ix: number, iz: number): Node {
    const key = (ix + 20000) * 40000 + (iz + 20000);
    let n = this.nodes.get(key);
    if (!n) {
      if (this.nodes.size >= NODE_CAP) this.nodes.clear();
      n = { a: new Float32Array(NK + 1), b: new Float32Array(NK + 1), done: new Uint8Array(NK + 1) };
      this.nodes.set(key, n);
    }
    return n;
  }

  /** 入れものの k の 値は 初めて 聞かれた とき 計算する */
  private fill(n: Node, ix: number, iz: number, k: number): void {
    if (n.done[k] !== 0) return;
    n.a[k] = valueNoise3(this.sA, ix * 4, k * 4, iz * 4, K.scaleA[0], K.scaleA[1], K.scaleA[2]);
    n.b[k] = valueNoise3(this.sB, ix * 4, k * 4, iz * 4, K.scaleB[0], K.scaleB[1], K.scaleB[2]);
    n.done[k] = 1;
  }

  /** 縦 8 マスずつ 覚える（y の 窓）。窓が ない／空気が 1 つも ない ときは null */
  private readonly raw = new Uint8Array(10);

  /** ノイズだけで 見た 空気（C2 の うめ前）。n0〜n3 ＝ 格子の 4 つの 点〔(ix, iz)・(ix+1, iz)・(ix, iz+1)・(ix+1, iz+1)〕 */
  private rawAir(x: number, y: number, z: number, n0: Node, n1: Node, n2: Node, n3: Node): boolean {
    const ix = x >> 2;
    const iz = z >> 2;
    const k = y >> 2;
    const fx = (x & 3) / 4;
    const fy = (y & 3) / 4;
    const fz = (z & 3) / 4;
    const r2 = K.radius * K.radius;
    this.fill(n0, ix, iz, k);
    this.fill(n1, ix + 1, iz, k);
    this.fill(n2, ix, iz + 1, k);
    this.fill(n3, ix + 1, iz + 1, k);
    this.fill(n0, ix, iz, k + 1);
    this.fill(n1, ix + 1, iz, k + 1);
    this.fill(n2, ix, iz + 1, k + 1);
    this.fill(n3, ix + 1, iz + 1, k + 1);
    const d1 = tri(n0.a[k]!, n1.a[k]!, n2.a[k]!, n3.a[k]!, n0.a[k + 1]!, n1.a[k + 1]!, n2.a[k + 1]!, n3.a[k + 1]!, fx, fy, fz) - 0.5;
    if (d1 * d1 >= r2) return false;
    const d2 = tri(n0.b[k]!, n1.b[k]!, n2.b[k]!, n3.b[k]!, n0.b[k + 1]!, n1.b[k + 1]!, n2.b[k + 1]!, n3.b[k + 1]!, fx, fy, fz) - 0.5;
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
    const ix = x >> 2;
    const iz = z >> 2;
    const n0 = this.node(ix, iz);
    const n1 = this.node(ix + 1, iz);
    const n2 = this.node(ix, iz + 1);
    const n3 = this.node(ix + 1, iz + 1);
    for (let y = lo; y <= hi; y++) raw[y - base] = this.rawAir(x, y, z, n0, n1, n2, n3) ? 1 : 0;
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
    const key = (x + 65536) * 131072 + (z + 65536);
    const slot = slotOf(x, z, W_BITS);
    if (this.wKeys[slot] !== key) {
      // 別の 列が 使って いた 位置は 作りなおす
      this.wKeys[slot] = key;
      this.wDone.fill(0, slot * NW, slot * NW + NW);
      this.wAir.fill(0, slot * WORLD_HEIGHT, slot * WORLD_HEIGHT + WORLD_HEIGHT);
    }
    if (this.wDone[slot * NW + w] === 0) {
      this.wDone[slot * NW + w] = 1;
      const win = this.computeWin(x, z, w);
      if (win) this.wAir.set(win, slot * WORLD_HEIGHT + w * 8);
    }
    return this.wAir[slot * WORLD_HEIGHT + y] === 1;
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
