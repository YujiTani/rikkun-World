/**
 * WATERFALL-1: わきみず・たきつぼ・こくようせき・マグマの わきみず・マグマの 16×16 絵（docs/art/waterfall-1/ の 案 A）。乱数なし（座標の まぜあわせ）。
 * マグマは 光る（opacity.ts の EMISSION）。色は 明るい だいだい〜きいろ の すじ。
 */
import { MAGMA_IDS, MAGMA_RESERVED_IDS } from './magma';

export const WATERFALL_TILE_NAMES = ['wakimizu_top', 'wakimizu_side', 'takitsubo', 'kokuyouseki', 'magma_wakimizu_top', 'magma_wakimizu_side', 'magma'] as const;
export type WaterfallTileName = (typeof WATERFALL_TILE_NAMES)[number];

type Rgba = readonly [number, number, number, number];
const N = 16;
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
/** 座標だけで 決まる 0〜1 */
const noise = (x: number, y: number, s: number): number => {
  let h = Math.imul(x * 374761393 + y * 668265263 + s * 2147483647, 1274126177) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return (Math.imul(h, 1103515245) >>> 0) / 4294967296;
};

function fill(f: (x: number, y: number) => string): Rgba[] {
  const t: Rgba[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t.push(hex(f(x, y)));
  return t;
}

const stone = (x: number, y: number, s: number): string => {
  const r = noise(x, y, s);
  return r < 0.2 ? '#757575' : r > 0.85 ? '#A5A5A5' : '#8E8E8E';
};
const dist = (x: number, y: number): number => Math.hypot(x - 7.5, y - 7.5);

/** わきみずの 上: 石の まん中に 水が わく あな（3 だんの 青） */
const wakimizuTop = (): Rgba[] => fill((x, y) => {
  const d = dist(x, y);
  if (d < 2.5) return '#9FD3FF';
  if (d < 4.2) return (x + y) % 3 === 0 ? '#9FD3FF' : '#4F95E8';
  if (d < 5.2) return '#2F5FA8';
  return stone(x, y, 1);
});
/** わきみずの 横: 石に 青い すじ（水が しみでる） */
const wakimizuSide = (): Rgba[] => fill((x, y) => {
  if ((x === 4 || x === 11) && y > 2 + (x % 3)) return y % 4 === 0 ? '#9FD3FF' : '#4F95E8';
  if (y < 2) return '#4F95E8';
  return stone(x, y, 2);
});
/** たきつぼ: ぬれた 暗い 石の わ と 深い 青の まん中（あわの 白） */
const takitsubo = (): Rgba[] => fill((x, y) => {
  const d = dist(x, y);
  if (d < 4.5) return d > 3.3 && noise(x, y, 3) < 0.55 ? '#E8F4FF' : d < 2.5 ? '#173E78' : '#2A5CA8'; // ふちに あわの わ
  if (d < 6.5) return noise(x, y, 4) < 0.3 ? '#3C4650' : '#4D5966';
  return noise(x, y, 5) < 0.25 ? '#5F6870' : '#6E7A84';
});
/** こくようせき: 黒〜こい むらさき、ところどころ ひかる かけら */
const kokuyouseki = (): Rgba[] => fill((x, y) => {
  const r = noise(x, y, 6);
  if (r < 0.06) return '#B9A6E8';
  if (r < 0.3) return '#2A1F3D';
  if ((x + 2 * y) % 7 === 0) return '#3C2C58';
  return '#17111F';
});
/** マグマの わきみずの 上: 石の まん中に マグマの あな */
const magmaWakimizuTop = (): Rgba[] => fill((x, y) => {
  const d = dist(x, y);
  if (d < 2.5) return '#FFE36B';
  if (d < 4.2) return (x + y) % 3 === 0 ? '#FFE36B' : '#FF8A1F';
  if (d < 5.2) return '#B8320F';
  return stone(x, y, 7);
});
/** マグマの わきみずの 横: 石に だいだいの ひび */
const magmaWakimizuSide = (): Rgba[] => fill((x, y) => {
  if ((x + Math.floor(y / 2)) % 6 === 0 && y > 3) return '#FF8A1F';
  if (y < 2) return '#E0561A';
  return stone(x, y, 8);
});
/** マグマ: こい 赤だいだいの 地に、きいろい すじが うねる（ゆっくり ゆれる 液面） */
const magma = (): Rgba[] => fill((x, y) => {
  const v = Math.sin((x + 2.5 * Math.sin(y * 0.7)) * 0.9);
  if (v > 0.85) return '#FFF07A';
  if (v > 0.45) return '#FFB02E';
  return noise(x, y, 9) < 0.2 ? '#C2300E' : '#E8571A';
});

const PAINT: Record<WaterfallTileName, () => Rgba[]> = {
  wakimizu_top: wakimizuTop,
  wakimizu_side: wakimizuSide,
  takitsubo,
  kokuyouseki,
  magma_wakimizu_top: magmaWakimizuTop,
  magma_wakimizu_side: magmaWakimizuSide,
  magma,
};

export function isWaterfallTile(name: string): name is WaterfallTileName {
  return (WATERFALL_TILE_NAMES as readonly string[]).includes(name);
}

export function paintWaterfallTile(name: WaterfallTileName): Rgba[] {
  return PAINT[name]();
}

/** ブロックの [上, 下, 横] */
export const WATERFALL_BLOCK_TILES = {
  wakimizu: ['wakimizu_top', 'wakimizu_side', 'wakimizu_side'],
  takitsubo: ['takitsubo', 'takitsubo', 'takitsubo'],
  kokuyouseki: ['kokuyouseki', 'kokuyouseki', 'kokuyouseki'],
  magma_wakimizu: ['magma_wakimizu_top', 'magma_wakimizu_side', 'magma_wakimizu_side'],
  ...Object.fromEntries(MAGMA_IDS.map((id) => [id, ['magma', 'magma', 'magma'] as const])),
  // 予約（世界に 置かない）は 水の 予約と 同じく 石の 絵（ここでは マグマの わきみずの 横で 代わり）
  ...Object.fromEntries(MAGMA_RESERVED_IDS.map((id) => [id, ['magma_wakimizu_side', 'magma_wakimizu_side', 'magma_wakimizu_side'] as const])),
} as Readonly<Record<string, readonly [WaterfallTileName, WaterfallTileName, WaterfallTileName]>>;
