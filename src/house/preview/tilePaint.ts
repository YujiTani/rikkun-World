// HOUSE-1B 試作: 16×16 の 絵を コードで 描く 小さな 道具（docs/art/house-1/proto/houseA.ts.txt と 同じ）。
export type Px = number[]; // 16×16 = 256 の 0xRRGGBB（上の 行 から）

export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const H = (s: string): number => parseInt(s.replace('#', ''), 16);

export function speck(base: string, others: string[], seed: number, rate = 0.25): Px {
  const r = rng(seed);
  return Array.from({ length: 256 }, () => (r() < rate ? H(others[Math.floor(r() * others.length)]!) : H(base)));
}

export function rect(t: Px, x: number, y: number, w: number, h: number, c: string): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < 16 && j < 16) t[j * 16 + i] = H(c);
}

/** 木目（横 か たての 線 4 本）。ループの 形は この まま（条件の 中で r() を よぶ ので 線の 長さが 決まる） */
export function grain(base: string, dark: string, light: string, seed: number, vertical = false): Px {
  const t = speck(base, [light], seed, 0.12);
  const r = rng(seed + 7);
  for (let k = 0; k < 4; k++) {
    const p = Math.floor(r() * 16);
    const s = Math.floor(r() * 12);
    for (let q = s; q < Math.min(16, s + 4 + Math.floor(r() * 8)); q++) {
      const [x, y] = vertical ? [p, q] : [q, p];
      t[y * 16 + x] = H(dark);
    }
  }
  return t;
}

export function solid(c: string): Px {
  return new Array<number>(256).fill(H(c));
}
