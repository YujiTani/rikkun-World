import { drawPixels } from './itemIcon';
import type { Rgba } from '../world/blocks/textures';

/**
 * 宝石の印（M6 §3.5 (7)）。16×16 のドット絵。めずらしさで形がちがう:
 * 0 ふつう = まる（白）、1 すこし = ひしがた（みどり）、2 めずらしい = 六角（あお）、3 とても = 星（むらさき）。
 * 色は めずらしさの色（--rk-rarity-N と同じ）、1 ドットのふちは --rk-bg-900。
 */
export type GemShape = 'circle' | 'diamond' | 'hexagon' | 'star';
export const GEM_SHAPES: readonly GemShape[] = ['circle', 'diamond', 'hexagon', 'star'];

const FILL: readonly Rgba[] = [
  [0xff, 0xff, 0xff, 255],
  [0x8f, 0xe0, 0x8f, 255],
  [0x7f, 0xb8, 0xff, 255],
  [0xc7, 0x9b, 0xff, 255],
];
const INK: Rgba = [0x10, 0x14, 0x1f, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const N = 16;

export function gemShape(rarity: number): GemShape {
  return GEM_SHAPES[Math.min(3, Math.max(0, rarity | 0))];
}

type Pt = readonly [number, number];

function inPoly(poly: readonly Pt[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function starPoly(): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6.6 : 2.9;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([8 + Math.cos(a) * r, 8.6 + Math.sin(a) * r]);
  }
  return pts;
}

const POLYS: Record<Exclude<GemShape, 'circle'>, Pt[]> = {
  diamond: [
    [8, 1.2],
    [14.2, 8],
    [8, 14.8],
    [1.8, 8],
  ],
  hexagon: [
    [8, 1.2],
    [13.9, 4.6],
    [13.9, 11.4],
    [8, 14.8],
    [2.1, 11.4],
    [2.1, 4.6],
  ],
  star: starPoly(),
};

function mask(shape: GemShape): boolean[] {
  const m: boolean[] = new Array<boolean>(N * N).fill(false);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      m[y * N + x] = shape === 'circle' ? (px - 8) ** 2 + (py - 8) ** 2 <= 5.6 ** 2 : inPoly(POLYS[shape], px, py);
    }
  }
  return m;
}

/** 宝石の 16×16（y = 0 が上）。めずらしさ 0〜3 */
export function gemPixels(rarity: number): Rgba[] {
  const idx = Math.min(3, Math.max(0, rarity | 0));
  const m = mask(GEM_SHAPES[idx]);
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x];
  const out: Rgba[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (at(x, y)) out.push(FILL[idx]);
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) out.push(INK);
      else out.push(CLEAR);
    }
  }
  return out;
}

const urls: string[] = [];

/** 宝石の絵の data URL（使いまわす。DOM のある所でだけ呼ぶ） */
export function gemUrl(rarity: number): string {
  const idx = Math.min(3, Math.max(0, rarity | 0));
  let u = urls[idx];
  if (!u) {
    const c = document.createElement('canvas');
    drawPixels(c, gemPixels(idx));
    u = c.toDataURL();
    urls[idx] = u;
  }
  return u;
}
