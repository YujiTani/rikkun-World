import type { GemShape } from '../contracts';
import { RARITY_TIERS } from '../drops/rarityTable';
import { drawPixels } from './itemIcon';
import type { Rgba } from '../world/blocks/textures';

/**
 * 宝石の印（M6 §3.5 (7)、RARITY-7）。16×16 のドット絵。めずらしさ 7 段で形がちがう（形・色は src/drops/rarityTable.ts の表）:
 * まる・ひしがた・六角・星・みかづき・ほのお・かんむり。
 * 色は めずらしさの色（--rk-rarity-N と同じ）、1 ドットのふちは --rk-bg-900。
 */
export type { GemShape };
export const GEM_SHAPES: readonly GemShape[] = RARITY_TIERS.map((t) => t.gem);

const hexRgba = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
const FILL: readonly Rgba[] = RARITY_TIERS.map((t) => hexRgba(t.color));
const RAINBOW: readonly Rgba[] = ['#ff5a5f', '#ffa040', '#ffd23f', '#3ddc84', '#4fc3f7', '#7f8cff', '#c79bff'].map((h) => hexRgba(parseInt(h.slice(1), 16)));
const mix = (c: Rgba, to: number, k: number): Rgba => [Math.round(c[0] + (to - c[0]) * k), Math.round(c[1] + (to - c[1]) * k), Math.round(c[2] + (to - c[2]) * k), 255];
const INK: Rgba = [0x10, 0x14, 0x1f, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const N = 16;
const LAST = RARITY_TIERS.length - 1;

export function gemShape(rarity: number): GemShape {
  return GEM_SHAPES[Math.min(LAST, Math.max(0, rarity | 0))];
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

const FLAME_TIP: Pt[] = [[8.6, 0.8], [12.6, 8], [4.2, 8]];
const FLAME_SIDE: Pt[] = [[3.6, 3.6], [6.6, 8.4], [3.2, 9.2]];
const CROWN: Pt[] = [[1.5, 13.8], [1.5, 4.2], [4.8, 8.4], [8, 2.0], [11.2, 8.4], [14.5, 4.2], [14.5, 13.8]];
const circ = (cx: number, cy: number, r: number, x: number, y: number): boolean => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const POLYS: Partial<Record<GemShape, Pt[]>> = {
  crown: CROWN,
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

function inShape(shape: GemShape, px: number, py: number): boolean {
  switch (shape) {
    case 'circle':
      return circ(8, 8, 5.6, px, py);
    case 'moon':
      return circ(8, 8, 6.6, px, py) && !circ(11.2, 5.6, 5.2, px, py);
    case 'flame':
      return circ(8.4, 10.6, 4.4, px, py) || inPoly(FLAME_TIP, px, py) || inPoly(FLAME_SIDE, px, py);
    default:
      return inPoly(POLYS[shape]!, px, py);
  }
}

function mask(shape: GemShape): boolean[] {
  const m: boolean[] = new Array<boolean>(N * N).fill(false);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      m[y * N + x] = inShape(shape, px, py);
    }
  }
  return m;
}

/** 宝石の 16×16（y = 0 が上）。めずらしさ 0〜6 */
export function gemPixels(rarity: number): Rgba[] {
  const idx = Math.min(LAST, Math.max(0, rarity | 0));
  const m = mask(GEM_SHAPES[idx]);
  const at = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x];
  const out: Rgba[] = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (at(x, y)) {
        // 案 A: 上・左が とぎれる ドットは 明るい 1 段、下・右は かげ 1 段。7 段目は にじ色のぬり
        const base = idx === LAST ? RAINBOW[Math.min(RAINBOW.length - 1, Math.floor(((x + y) / 30) * RAINBOW.length))] : FILL[idx];
        if (!at(x - 1, y - 1) || !at(x, y - 1)) out.push(mix(base, 255, 0.55));
        else if (!at(x + 1, y + 1) || !at(x, y + 1)) out.push(mix(base, 0, 0.28));
        else out.push(base);
      }
      else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) out.push(INK);
      else out.push(CLEAR);
    }
  }
  return out;
}

const urls: string[] = [];

/** 宝石の絵の data URL（使いまわす。DOM のある所でだけ呼ぶ） */
export function gemUrl(rarity: number): string {
  const idx = Math.min(LAST, Math.max(0, rarity | 0));
  let u = urls[idx];
  if (!u) {
    const c = document.createElement('canvas');
    drawPixels(c, gemPixels(idx));
    u = c.toDataURL();
    urls[idx] = u;
  }
  return u;
}
