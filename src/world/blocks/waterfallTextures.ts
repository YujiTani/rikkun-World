/**
 * WATERFALL-1: わきみず・たきつぼ・こくようせき・マグマの わきみず・マグマの 16×16 絵（docs/art/waterfall-1/ の 案 A）。乱数なし（座標の まぜあわせ）。
 * マグマは 光る（opacity.ts の EMISSION）。色は 明るい だいだい〜きいろ の すじ。
 */
import { MAGMA_IDS, MAGMA_RESERVED_IDS } from './magma';

/** 煮えたぎる マグマの 4 コマ（アトラスの 1 だんの 左から。textures.ts が 位置を 確かめる） */
export const BOIL_NAMES = ['magma_boil_0', 'magma_boil_1', 'magma_boil_2', 'magma_boil_3'] as const;
export const WATERFALL_TILE_NAMES = ['wakimizu_top', 'wakimizu_side', 'takitsubo', 'kokuyouseki', 'magma_wakimizu_top', 'magma_wakimizu_side', 'magma', ...BOIL_NAMES, 'kogeta'] as const;
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
/** 冷えた 地殻の ひび（ボロノイの さかい）。タイルの はしで つながる（16 で まわる）。返り値 = さかいまでの 近さ（0 = さかいの 上） */
const CELLS: readonly (readonly [number, number])[] = [[2, 3], [9, 1], [14, 6], [6, 8], [11, 12], [3, 13], [15, 15], [7, 14]];
function crack(x: number, y: number): number {
  let d1 = 1e9;
  let d2 = 1e9;
  for (const [cx, cy] of CELLS) {
    for (let ox = -16; ox <= 16; ox += 16) {
      for (let oy = -16; oy <= 16; oy += 16) {
        const d = Math.hypot(x + 0.5 - cx - ox, y + 0.5 - cy - oy);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
  }
  return d2 - d1;
}
/** 版 2（yuzu の 見本「2 枚目」）: 黒〜すみ色の 冷えた 地殻に、あみめの ひびから 赤 → だいだい → きいろ に 光る 溶岩。ひびの まん中ほど きいろ〜白 */
function lavaPixel(x: number, y: number, hot: number): string {
  const c = crack(x, y) - hot;
  if (c < 0.35) return '#FFF3B0';
  if (c < 0.9) return '#FFC43A';
  if (c < 1.5) return '#FF7A1A';
  if (c < 2.1) return '#C8240E';
  const r = noise(x, y, 9);
  return r < 0.18 ? '#3A2A26' : r > 0.8 ? '#140F0E' : '#241B19';
}
const magma = (): Rgba[] => fill((x, y) => lavaPixel(x, y, 0));

/** 煮えたぎる マグマの コマ数（アトラスの 1 だんに ならべる。shader が 時間で 横に ずらす） */
export const MAGMA_BOIL_FRAMES = 4;
/** 煮えたぎる マグマ: ひびが ひろく 光り（地殻が とけかけ）、あわが 2 つ ふくらんで はじけ、きいろい つぶが とぶ。f = 0〜3 */
function magmaBoil(f: number): Rgba[] {
  const bubbles: readonly (readonly [number, number, number])[] = [[5, 5, 0], [11, 10, 2]]; // [x, y, ずれた コマ]
  return fill((x, y) => {
    for (const [bx, by, o] of bubbles) {
      const k = (f + o) % MAGMA_BOIL_FRAMES; // 0 小 → 1 中 → 2 大 → 3 はじける
      const d = Math.hypot(x - bx, y - by);
      if (k < 3) {
        const r = [1.2, 2.2, 3.2][k];
        if (d < r) return d < r * 0.45 && x <= bx && y <= by ? '#FFF8D0' : k === 2 ? '#FFB02E' : '#FF8A1F';
        if (d < r + 0.8) return '#9E1A0A';
      } else {
        // はじけた: 中は 白く 光り、まわりに きいろい つぶ
        if (d < 1.2) return '#FFF3B0';
        const sp = [[-3, -2], [3, -3], [-2, 3], [4, 2], [0, -4]];
        for (const [sx, sy] of sp) if (x === bx + sx && y === by + sy) return '#FFE36B';
      }
    }
    return lavaPixel(x, y, 0.8);
  });
}
/** 版 2: こげた ブロック。石の もようを まっ黒に こがし、ひびに 赤い 火種が ちらつく（火種は 動かない） */
const kogeta = (): Rgba[] => fill((x, y) => {
  const c = crack(x, y);
  if (c < 0.5 && noise(x, y, 11) < 0.45) return noise(x, y, 12) < 0.4 ? '#FFB02E' : '#E0401A';
  if (c < 0.9) return '#4A1A10';
  const r = noise(x, y, 10);
  return r < 0.2 ? '#2E2826' : r > 0.85 ? '#0E0B0A' : '#1C1715';
});

const PAINT: Record<WaterfallTileName, () => Rgba[]> = {
  wakimizu_top: wakimizuTop,
  wakimizu_side: wakimizuSide,
  takitsubo,
  kokuyouseki,
  magma_wakimizu_top: magmaWakimizuTop,
  magma_wakimizu_side: magmaWakimizuSide,
  magma,
  magma_boil_0: () => magmaBoil(0),
  magma_boil_1: () => magmaBoil(1),
  magma_boil_2: () => magmaBoil(2),
  magma_boil_3: () => magmaBoil(3),
  kogeta,
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
  kogeta: ['kogeta', 'kogeta', 'kogeta'],
  magma_wakimizu: ['magma_wakimizu_top', 'magma_wakimizu_side', 'magma_wakimizu_side'],
  ...Object.fromEntries(MAGMA_IDS.map((id) => [id, ['magma', 'magma', 'magma'] as const])),
  // 予約（世界に 置かない）は 水の 予約と 同じく 石の 絵（ここでは マグマの わきみずの 横で 代わり）
  ...Object.fromEntries(MAGMA_RESERVED_IDS.map((id) => [id, ['magma_wakimizu_side', 'magma_wakimizu_side', 'magma_wakimizu_side'] as const])),
} as Readonly<Record<string, readonly [WaterfallTileName, WaterfallTileName, WaterfallTileName]>>;
