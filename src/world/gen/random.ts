/** シード付き乱数と、格子ノイズ。 */

export type Rng = () => number;

/** mulberry32。0 以上 1 未満 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

function hash2(seed: number, x: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 0〜1 のなめらかな 2D ノイズ。scale は格子の大きさ（マス） */
export function valueNoise(seed: number, x: number, z: number, scale: number): number {
  const fx = x / scale;
  const fz = z / scale;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(seed, ix, iz);
  const b = hash2(seed, ix + 1, iz);
  const c = hash2(seed, ix, iz + 1);
  const d = hash2(seed, ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

/** 整数 4 つまでと seed から、32 ビットの符号なしの乱数を作る（同じ入力 → 同じ値。負の座標でも動く） */
export function hashInts(seed: number, a: number, b: number, c = 0, d = 0): number {
  let h = seed | 0;
  h = Math.imul(h ^ a, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ b, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h ^ c, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h ^ d, 0x165667b1);
  h ^= h >>> 13;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** hashInts を 0 以上 1 未満にしたもの */
export function hash01(seed: number, a: number, b: number, c = 0, d = 0): number {
  return hashInts(seed, a, b, c, d) / 4294967296;
}

/** 別の用途のノイズ・乱数に別の seed を作る（tag ごとに独立） */
export function subSeed(seed: number, tag: number): number {
  return (seed ^ Math.imul(tag + 1, 0x9e3779b1)) | 0;
}

/** 0〜1 のなめらかな 3D ノイズ。格子の大きさ (sx, sy, sz) ブロック */
export function valueNoise3(seed: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx): number {
  const fx = x / sx;
  const fy = y / sy;
  const fz = z / sz;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const ty = fy - iy;
  const tz = fz - iz;
  const ux = tx * tx * (3 - 2 * tx);
  const uy = ty * ty * (3 - 2 * ty);
  const uz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number, c: number) => hashInts(seed, a, b, c) / 4294967296;
  const c000 = h(ix, iy, iz);
  const c100 = h(ix + 1, iy, iz);
  const c010 = h(ix, iy + 1, iz);
  const c110 = h(ix + 1, iy + 1, iz);
  const c001 = h(ix, iy, iz + 1);
  const c101 = h(ix + 1, iy, iz + 1);
  const c011 = h(ix, iy + 1, iz + 1);
  const c111 = h(ix + 1, iy + 1, iz + 1);
  const x00 = c000 + (c100 - c000) * ux;
  const x10 = c010 + (c110 - c010) * ux;
  const x01 = c001 + (c101 - c001) * ux;
  const x11 = c011 + (c111 - c011) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}
