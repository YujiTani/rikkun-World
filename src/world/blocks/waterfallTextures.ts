/**
 * WATERFALL-1: わきどころ・たきつぼ・こくようせき・マグマの わきどころ・マグマの 16×16 絵（docs/art/waterfall-1/ の 案 A）。乱数なし（座標の まぜあわせ）。
 * マグマは 光る（opacity.ts の EMISSION）。色は 明るい だいだい〜きいろ の すじ。
 */
import { MAGMA_IDS, MAGMA_RESERVED_IDS } from './magma';

/** 煮えたぎる マグマの 4 コマ（アトラスの 1 だんの 左から。textures.ts が 位置を 確かめる） */
export const BOIL_NAMES = ['magma_boil_0', 'magma_boil_1', 'magma_boil_2', 'magma_boil_3'] as const;
/** WAKIDOKORO §3: わきどころの 渦の コマ（連番。小ブロックの shader が 時間で 0〜3 を 足す） */
export const SWIRL_FRAMES = 4;
/** 渦の コマの 速さ（コマ / 秒。ゆっくり） */
export const SWIRL_FPS = 3;
const WAKIDOKORO_NAMES = ['wakidokoro_0', 'wakidokoro_1', 'wakidokoro_2', 'wakidokoro_3'] as const;
const MAGMA_WAKIDOKORO_NAMES = ['magma_wakidokoro_0', 'magma_wakidokoro_1', 'magma_wakidokoro_2', 'magma_wakidokoro_3'] as const;
export const WATERFALL_TILE_NAMES = [
  'wakimizu_top', 'wakimizu_side', 'takitsubo', 'kokuyouseki', 'magma_wakimizu_top', 'magma_wakimizu_side', 'magma', ...BOIL_NAMES, 'kogeta',
  // WAKIDOKORO（うしろに 足す。今の 絵の 位置は かわらない）: たきつぼの 横・マグマの たきつぼ の 上・わきどころ 2 つの 渦 4 コマずつ
  'takitsubo_side', 'magma_takitsubo', ...WAKIDOKORO_NAMES, ...MAGMA_WAKIDOKORO_NAMES,
] as const;
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

/** わきどころの 上: 石の まん中に 水が わく あな（3 だんの 青） */
const wakimizuTop = (): Rgba[] => fill((x, y) => {
  const d = dist(x, y);
  if (d < 2.5) return '#9FD3FF';
  if (d < 4.2) return (x + y) % 3 === 0 ? '#9FD3FF' : '#4F95E8';
  if (d < 5.2) return '#2F5FA8';
  return stone(x, y, 1);
});
/** わきどころの 横: 石に 青い すじ（水が しみでる） */
const wakimizuSide = (): Rgba[] => fill((x, y) => {
  if ((x === 4 || x === 11) && y > 2 + (x % 3)) return y % 4 === 0 ? '#9FD3FF' : '#4F95E8';
  if (y < 2) return '#4F95E8';
  return stone(x, y, 2);
});
/**
 * WAKIDOKORO §3: たきつぼの 上。いしの ブロックの まん中が くぼんで（内がわの ふちが 暗い かげ）、そこに 水（マグマ）が 入って いる。
 * liquid = 中身の 色（[ふち, 中, 光る 点]）
 */
const takitsuboTop = (liquid: readonly [string, string, string], seed: number): Rgba[] => fill((x, y) => {
  const inX = x >= 3 && x <= 12;
  const inY = y >= 3 && y <= 12;
  if (inX && inY) {
    if (y === 3 || x === 3) return '#3C4046'; // くぼみの 奥の かげ（左上）
    if (y === 12 || x === 12) return '#B4B4B4'; // くぼみの ふちの 光（右下）
    if (x === 4 || y === 4 || x === 11 || y === 11) return liquid[0];
    return noise(x, y, seed) < 0.12 ? liquid[2] : liquid[1];
  }
  if ((x === 2 || x === 13) && y >= 2 && y <= 13) return '#6E6E6E';
  if ((y === 2 || y === 13) && x >= 2 && x <= 13) return '#6E6E6E';
  return stone(x, y, seed + 1);
});
const takitsubo = (): Rgba[] => takitsuboTop(['#2A5CA8', '#3A7BD5', '#E8F4FF'], 3);
const magmaTakitsubo = (): Rgba[] => takitsuboTop(['#B8200C', '#FF8A1F', '#FFE36B'], 14);
/** たきつぼの 横・下: いし（上の ふちに 1 だん うすい かげ） */
const takitsuboSide = (): Rgba[] => fill((x, y) => (y === 0 ? '#A5A5A5' : stone(x, y, 4)));
/**
 * WAKIDOKORO §3: 渦の 明るさ（0〜1）。まん中から 2 本の うでが のびる 渦。f コマ目は 45° ずつ 回す（2 本うで なので 4 コマで ひとまわり に 見える）
 */
function swirl(x: number, y: number, f: number): number {
  const dx = x + 0.5 - 8;
  const dy = y + 0.5 - 8;
  const r = Math.hypot(dx, dy);
  if (r > 7.6) return 0;
  const th = Math.atan2(dy, dx) + (f * Math.PI) / 4;
  const v = Math.cos(2 * th - r * 0.85);
  return v * (1 - r / 9);
}
/** わきどころ（水）: ふつうの 水の 青を 土台に、白い あわの 渦 */
function wakidokoro(f: number): Rgba[] {
  return fill((x, y) => {
    const s = swirl(x, y, f);
    const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (r < 1.3) return '#E8F4FF';
    if (s > 0.55) return noise(x, y, 20 + f) < 0.7 ? '#E8F4FF' : '#BFE3FF'; // あわ
    if (s > 0.35) return '#7FB6F0';
    const n = noise(x, y, 21);
    return n < 0.15 ? '#3270C8' : n > 0.88 ? '#4A8ADE' : '#3A7BD5';
  });
}
/** マグマの わきどころ: マグマの 絵を 土台に、きいろ〜白の 渦 */
function magmaWakidokoro(f: number): Rgba[] {
  return fill((x, y) => {
    const s = swirl(x, y, f);
    const r = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (r < 1.3) return '#FFF3B0';
    if (s > 0.55) return noise(x, y, 22 + f) < 0.6 ? '#FFE36B' : '#FFF3B0';
    if (s > 0.35) return '#FF8A1F';
    return lavaPixel(x, y, 0.2);
  });
}
/** こくようせき: 黒〜こい むらさき、ところどころ ひかる かけら */
const kokuyouseki = (): Rgba[] => fill((x, y) => {
  const r = noise(x, y, 6);
  if (r < 0.06) return '#B9A6E8';
  if (r < 0.3) return '#2A1F3D';
  if ((x + 2 * y) % 7 === 0) return '#3C2C58';
  return '#17111F';
});
/** マグマの わきどころの 上: 石の まん中に マグマの あな */
const magmaWakimizuTop = (): Rgba[] => fill((x, y) => {
  const d = dist(x, y);
  if (d < 2.5) return '#FFE36B';
  if (d < 4.2) return (x + y) % 3 === 0 ? '#FFE36B' : '#FF8A1F';
  if (d < 5.2) return '#B8320F';
  return stone(x, y, 7);
});
/** マグマの わきどころの 横: 石に だいだいの ひび */
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
  if (c < 0.45) return noise(x, y, 13) < 0.35 ? '#FFF3B0' : '#FFD54A';
  if (c < 0.95) return '#FF8A1F';
  if (c < 1.4) return '#B8200C';
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
    return lavaPixel(x, y, 0.3);
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
  takitsubo_side: takitsuboSide,
  magma_takitsubo: magmaTakitsubo,
  wakidokoro_0: () => wakidokoro(0),
  wakidokoro_1: () => wakidokoro(1),
  wakidokoro_2: () => wakidokoro(2),
  wakidokoro_3: () => wakidokoro(3),
  magma_wakidokoro_0: () => magmaWakidokoro(0),
  magma_wakidokoro_1: () => magmaWakidokoro(1),
  magma_wakidokoro_2: () => magmaWakidokoro(2),
  magma_wakidokoro_3: () => magmaWakidokoro(3),
};

export function isWaterfallTile(name: string): name is WaterfallTileName {
  return (WATERFALL_TILE_NAMES as readonly string[]).includes(name);
}

export function paintWaterfallTile(name: WaterfallTileName): Rgba[] {
  return PAINT[name]();
}

/** ブロックの [上, 下, 横] */
export const WATERFALL_BLOCK_TILES = {
  // WAKIDOKORO §3: わきどころは 6 面 同じ 渦（1 コマ目。shader が コマを すすめる）
  wakimizu: ['wakidokoro_0', 'wakidokoro_0', 'wakidokoro_0'],
  takitsubo: ['takitsubo', 'takitsubo_side', 'takitsubo_side'],
  magma_takitsubo: ['magma_takitsubo', 'takitsubo_side', 'takitsubo_side'],
  kokuyouseki: ['kokuyouseki', 'kokuyouseki', 'kokuyouseki'],
  kogeta: ['kogeta', 'kogeta', 'kogeta'],
  magma_wakimizu: ['magma_wakidokoro_0', 'magma_wakidokoro_0', 'magma_wakidokoro_0'],
  ...Object.fromEntries(MAGMA_IDS.map((id) => [id, ['magma', 'magma', 'magma'] as const])),
  // 予約（世界に 置かない）は 水の 予約と 同じく 石の 絵（ここでは マグマの わきどころの 横で 代わり）
  ...Object.fromEntries(MAGMA_RESERVED_IDS.map((id) => [id, ['magma_wakimizu_side', 'magma_wakimizu_side', 'magma_wakimizu_side'] as const])),
} as Readonly<Record<string, readonly [WaterfallTileName, WaterfallTileName, WaterfallTileName]>>;
