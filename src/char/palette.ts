// CHAR-1 の色見本（art/CHAR-1-v2/palette.json の 22 色を 0〜255 に丸めたもの。PNG のドットと同じ値）。
// 色番号 0 = とうめい、1〜22 = この表の 0〜21 番。表の 20・21 番（色番号 21・22）は CHAR-4 の刀の刃の 2 色。

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
  [218, 215, 225], // 20: 刀の刃の地（CHAR-4。武器ごとの色にぬりかえる）
  [253, 251, 252], // 21: 刀の刃のふちの光（CHAR-4。武器ごとの色にぬりかえる）
];

export const PALETTE_SIZE = PALETTE_RGB.length;

export type PaletteRgb = readonly (readonly [number, number, number])[];

const pack = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b;
// 色見本ごとの「ぴったりの色 -> 色番号」の表（CHAR-5: キャラごとの色見本）
const EXACT_BY = new WeakMap<object, Map<number, number>>();
const exactOf = (palette: PaletteRgb): Map<number, number> => {
  let m = EXACT_BY.get(palette);
  if (!m) {
    m = new Map<number, number>();
    palette.forEach((c, i) => m!.set(pack(c[0], c[1], c[2]), i + 1));
    EXACT_BY.set(palette, m);
  }
  return m;
};

/** 1 ドットの色を 色番号（1〜22）にする。ぴったりの色がなければ いちばん近い色。palette がなければ 女の子の色見本 */
export function nearestIndex(r: number, g: number, b: number, palette: PaletteRgb = PALETTE_RGB): number {
  const hit = exactOf(palette).get(pack(r, g, b));
  if (hit !== undefined) return hit;
  let best = 1;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i]!;
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i + 1;
    }
  }
  return best;
}

/** RGBA のドットを 色番号 1 バイトにする（alpha が 128 未満はとうめい = 0）。半とうめいは作らない */
export function quantizeRgba(data: ArrayLike<number>, width: number, height: number, palette: PaletteRgb = PALETTE_RGB): Uint8Array {
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
      lastIdx = nearestIndex(data[o]!, data[o + 1]!, data[o + 2]!, palette);
    }
    out[i] = lastIdx;
  }
  return out;
}
