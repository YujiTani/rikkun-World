import { TOWN_BLOCK_DEFS, type TownBlockId, type TownPattern } from './townBlocks';

/**
 * TOWN-1 1B-1: 街の ブロックの 絵（16×16。見本 CA4-blocks.png に 合わせた 近い 色。あとで アートが 直す）。
 * 表は townBlocks.ts の `art`（模様の 名前・地の 色・足す 色）。ここは 模様の かき方 だけ。
 */
const SIZE = 16;
type Px = readonly [number, number, number, number];
export type TownTile = Px[];

function hex(c: string, a = 255): Px {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** 絵ごとに 同じ 並びの 疑似乱数 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const idx = (x: number, y: number): number => y * SIZE + x;

/** 地の 色に こまかい つぶを まぜる（むら） */
function mottle(base: string, acc: readonly string[], seed: number, count = 44): TownTile {
  const t: TownTile = new Array<Px>(SIZE * SIZE).fill(hex(base));
  const r = lcg(seed);
  for (let i = 0; i < count; i++) t[idx(Math.floor(r() * SIZE), Math.floor(r() * SIZE))] = hex(acc[i % acc.length]!);
  return t;
}

function rows(t: TownTile, y0: number, y1: number, c: Px): void {
  for (let y = y0; y < y1; y++) for (let x = 0; x < SIZE; x++) t[idx(x, y)] = c;
}
function cols(t: TownTile, x0: number, x1: number, c: Px): void {
  for (let x = x0; x < x1; x++) for (let y = 0; y < SIZE; y++) t[idx(x, y)] = c;
}

/** パターンごとの かき方。acc[0] ＝ 目地・線の 色、acc[1] ＝ 明るい 色、acc[2] ＝ そのほか */
const PAINT: Record<TownPattern, (base: string, acc: readonly string[], seed: number) => TownTile> = {
  mottle: (b, a, s) => mottle(b, a, s),
  // れんが・石づみ: 4 だんの 段、1 だんごとに 半分 ずらす。目地は acc[0]、まん中の つぶは acc[1]
  brick: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b], s, 18);
    const mortar = hex(a[0] ?? b);
    for (let row = 0; row < 4; row++) {
      rows(t, row * 4 + 3, row * 4 + 4, mortar);
      const off = row % 2 === 0 ? 0 : 4;
      for (let x = off; x < SIZE; x += 8) for (let y = row * 4; y < row * 4 + 3; y++) t[idx(x, y)] = mortar;
    }
    return t;
  },
  // 石だたみ: 8×8 の 大きな 石 4 まい（目地 acc[0]、つぶ acc[1]）
  paving: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b, b], s, 30);
    const mortar = hex(a[0] ?? b);
    rows(t, 0, 1, mortar);
    rows(t, 8, 9, mortar);
    cols(t, 0, 1, mortar);
    cols(t, 8, 9, mortar);
    return t;
  },
  // たての 板（板ばり・柱）: 4 ドットごとに 暗い すじ（acc[0]）、ときどき 明るい すじ（acc[1]）
  plank: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b], s, 14);
    for (let x = 0; x < SIZE; x += 4) cols(t, x, x + 1, hex(a[0] ?? b));
    return t;
  },
  // よこの 板（ゆか・いたぶき・かやぶき・たたみ）
  plankH: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b], s, 14);
    for (let y = 3; y < SIZE; y += 4) rows(t, y, y + 1, hex(a[0] ?? b));
    if (a[2]) {
      cols(t, 0, 1, hex(a[2]));
      cols(t, SIZE - 1, SIZE, hex(a[2]));
    }
    return t;
  },
  // かわら: 4 だんの 段。段の 下の ふちに 暗い 線（acc[0]）、1 まいごとに 明るさを かえる（acc[1]）
  scale: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b, b], s, 24);
    for (let row = 0; row < 4; row++) {
      rows(t, row * 4 + 3, row * 4 + 4, hex(a[0] ?? b));
      const off = row % 2 === 0 ? 0 : 4;
      for (let x = off; x < SIZE; x += 8) for (let y = row * 4; y < row * 4 + 3; y++) t[idx(x, y)] = hex(a[0] ?? b);
    }
    return t;
  },
  // こうし（すきま あり）: わく 2 ドット ＋ たての 棒 3 本。中は とうめい
  bars: (b, a, s) => {
    const t: TownTile = new Array<Px>(SIZE * SIZE).fill(hex(b, 0));
    const frame = hex(b);
    const dark = hex(a[0] ?? b);
    rows(t, 0, 2, frame);
    rows(t, SIZE - 2, SIZE, frame);
    cols(t, 0, 2, frame);
    cols(t, SIZE - 2, SIZE, frame);
    for (const x of [4, 7, 10, 13]) cols(t, x, x + 1, dark);
    void s;
    return t;
  },
  // 縞（しまひさし）: たてに 4 ドットずつ 2 色
  stripe: (b, a, s) => {
    const t = mottle(b, [b], s, 0);
    for (let x = 0; x < SIZE; x++) if (Math.floor(x / 4) % 2 === 1) cols(t, x, x + 1, hex(a[0] ?? b));
    rows(t, SIZE - 2, SIZE, hex(a[1] ?? a[0] ?? b));
    return t;
  },
  // あみめ（なまこかべ）: 黒地に 白い ななめの 線
  weave: (b, a, s) => {
    const t = mottle(b, [b], s, 0);
    for (let i = 0; i < SIZE; i++) {
      t[idx(i, i)] = hex(a[0] ?? b);
      t[idx(SIZE - 1 - i, i)] = hex(a[0] ?? b);
    }
    return t;
  },
  // わく つきの 板（かんばん・のれん・くらかべ）: 地の 色 ＋ ふち acc[2] ＋ まん中の しるし acc[0]
  plate: (b, a, s) => {
    const t = mottle(b, [b], s, 0);
    const edge = hex(a[2] ?? a[0] ?? b);
    rows(t, 0, 1, edge);
    rows(t, SIZE - 1, SIZE, edge);
    cols(t, 0, 1, edge);
    cols(t, SIZE - 1, SIZE, edge);
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) t[idx(x, y)] = hex(a[0] ?? b);
    for (let y = 7; y < 9; y++) for (let x = 7; x < 9; x++) t[idx(x, y)] = hex(a[1] ?? b);
    return t;
  },
  // しょうじ: 白い 紙に 木の こうし（4×4 の 目）
  lattice: (b, a, s) => {
    const t = mottle(b, [b], s, 0);
    const wood = hex(a[0] ?? b);
    for (const p of [0, 5, 10, 15]) {
      rows(t, p, p + 1, wood);
      cols(t, p, p + 1, wood);
    }
    return t;
  },
  // あんどん: 光る 黄色い 箱 ＋ 木の わく
  glowbox: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b], s, 10);
    const wood = hex(a[0] ?? b);
    rows(t, 0, 2, wood);
    rows(t, SIZE - 2, SIZE, wood);
    cols(t, 0, 2, wood);
    cols(t, SIZE - 2, SIZE, wood);
    cols(t, 7, 9, wood);
    rows(t, 7, 9, wood);
    return t;
  },
  // たけ: たてに 長い 緑、4 ドットごとに ふし
  pole: (b, a, s) => {
    const t = mottle(b, [a[2] ?? b], s, 14);
    for (let y = 4; y < SIZE; y += 5) rows(t, y, y + 1, hex(a[0] ?? b));
    cols(t, 0, 1, hex(a[0] ?? b));
    cols(t, 8, 9, hex(a[0] ?? b));
    return t;
  },
  // たる: たての 板 ＋ よこの 金わ（上と 下）
  barrel: (b, a, s) => {
    const t = mottle(b, [a[1] ?? b], s, 12);
    for (let x = 0; x < SIZE; x += 4) cols(t, x, x + 1, hex('#6E4528'));
    rows(t, 3, 5, hex(a[0] ?? b));
    rows(t, 11, 13, hex(a[0] ?? b));
    return t;
  },
  // はちうえ: 下半分は 赤茶の はち、上は とうめい ＋ 緑の 葉
  pot: (b, a, s) => {
    const t: TownTile = new Array<Px>(SIZE * SIZE).fill(hex(b, 0));
    for (let y = 9; y < SIZE; y++) for (let x = 3; x < 13; x++) t[idx(x, y)] = hex(b);
    rows(t, 9, 10, hex('#8E4528'));
    const r = lcg(s);
    for (let y = 2; y < 9; y++) for (let x = 4; x < 12; x++) if (r() < 0.7) t[idx(x, y)] = hex(a[r() < 0.5 ? 0 : 1] ?? '#4CA332');
    return t;
  },
};

/** 絵の 表（id → 色・模様）。townBlocks.ts の `art` を そのまま 読む */
const ART: ReadonlyMap<string, (typeof TOWN_BLOCK_DEFS)[number]['art']> = new Map(TOWN_BLOCK_DEFS.map((d) => [d.id, d.art]));

/** 街の ブロックの 絵 1 まい（y = 0 が 絵の 上）。id ごとに いつも 同じ 絵 */
export function paintTownTile(id: TownBlockId): TownTile {
  const art = ART.get(id)!;
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = (Math.imul(seed, 31) + id.charCodeAt(i)) >>> 0;
  return PAINT[art.pat](art.base, art.acc, seed);
}
