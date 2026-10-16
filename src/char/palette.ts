// CHAR-1 の色見本（art/CHAR-1-v2/palette.json の 20 色を 0〜255 に丸めたもの。PNG のドットと同じ値）。
// 色番号 0 = とうめい、1〜20 = この表の 0〜19 番。

export const PALETTE_RGB: readonly (readonly [number, number, number])[] = [
  [102, 7, 52],
  [194, 60, 133],
  [176, 169, 181],
  [245, 45, 157],
  [182, 10, 102],
  [143, 134, 142],
  [218, 215, 224],
  [234, 166, 176],
  [253, 26, 150],
  [247, 209, 212],
  [248, 242, 246],
  [101, 93, 99],
  [21, 14, 19],
  [232, 16, 132],
  [208, 9, 116],
  [139, 44, 94],
  [58, 54, 59],
  [238, 232, 237],
  [253, 251, 253],
  [200, 195, 207],
];

export const PALETTE_SIZE = PALETTE_RGB.length;

const pack = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;
const EXACT = new Map<number, number>();
PALETTE_RGB.forEach((c, i) => EXACT.set(pack(c[0], c[1], c[2]), i + 1));

/** 1 ドットの色を 色番号（1〜20）にする。ぴったりの色がなければ いちばん近い色 */
export function nearestIndex(r: number, g: number, b: number): number {
  const hit = EXACT.get(pack(r, g, b));
  if (hit !== undefined) return hit;
  let best = 1;
  let bestD = Infinity;
  for (let i = 0; i < PALETTE_RGB.length; i++) {
    const c = PALETTE_RGB[i]!;
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i + 1;
    }
  }
  return best;
}

/** RGBA のドットを 色番号 1 バイトにする（alpha が 128 未満はとうめい = 0）。半とうめいは作らない */
export function quantizeRgba(data: ArrayLike<number>, width: number, height: number): Uint8Array {
  const n = width * height;
  const out = new Uint8Array(n);
  let lastKey = -1;
  let lastIdx = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (data[o + 3]! < 128) continue;
    const key = pack(data[o]!, data[o + 1]!, data[o + 2]!);
    if (key !== lastKey) {
      lastKey = key;
      lastIdx = nearestIndex(data[o]!, data[o + 1]!, data[o + 2]!);
    }
    out[i] = lastIdx;
  }
  return out;
}
