import { TOWN_BLOCK_DEFS, TOWN_EXTRA_TILE_DEFS, type TownBlockId, type TownExtraTileName, type TownPattern } from './townBlocks';

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

/** 色を 明るく・暗く（amount は -255〜255） */
function shade(c: string, amount: number): string {
  const n = parseInt(c.slice(1), 16);
  const f = (v: number): string => Math.max(0, Math.min(255, v + amount)).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** ひらがなの 字（14×14 の 点。「#」が 金の 線。16×16 の 中の 1 ドット 内がわに おく。字の 形は IPA ゴシックを 14 点に 落とした 物）。字を ふやす ときは ここに 1 つ 足すだけ（ブロックの 絵は 「town_moji_<字>」） */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  yo: [
    '..............',
    '......##......',
    '......##......',
    '......##..#...',
    '......#####...',
    '......####....',
    '......##......',
    '......##......',
    '...#####......',
    '..#########...',
    '..##..######..',
    '..######..#...',
    '...####.......',
    '..............',
  ],
  ro: [
    '..............',
    '.....#####....',
    '...#######....',
    '...######.....',
    '......##......',
    '.....#####....',
    '....########..',
    '...####..###..',
    '..###.....##..',
    '...#......##..',
    '........####..',
    '....#######...',
    '.....###......',
    '..............',
  ],
  zu: [
    '...........#..',
    '.......######.',
    '.......##.###.',
    '.############.',
    '.############.',
    '.....####.....',
    '....#####.....',
    '....##.##.....',
    '....#####.....',
    '....#####.....',
    '......###.....',
    '.....###......',
    '....###.......',
    '.....#........',
  ],
  ya: [
    '..............',
    '......##......',
    '..###.###.....',
    '...##..####...',
    '...##########.',
    '..######...##.',
    '.#####.....##.',
    '....###.#####.',
    '.....#######..',
    '.....##.......',
    '.....###......',
    '......##......',
    '......##......',
    '..............',
  ],
  ka: [
    '..............',
    '.....##.......',
    '.....##.......',
    '....###..##...',
    '..######.###..',
    '.########.##..',
    '...###.##..##.',
    '...##..##..###',
    '...##..##...#.',
    '..###..##.....',
    '..####.##.....',
    '.########.....',
    '..#..###......',
    '..............',
  ],
  ji: [
    '..............',
    '....#.....#...',
    '...###..####..',
    '...###..####..',
    '...###...##...',
    '...###........',
    '...###........',
    '...###........',
    '...###....##..',
    '...###....##..',
    '....##...###..',
    '....#######...',
    '.....####.....',
    '..............',
  ],
  da: [
    '..............',
    '.....##...##..',
    '....###..####.',
    '.############.',
    '.#######..#...',
    '....##..####..',
    '...#########..',
    '...##..#......',
    '...##.........',
    '..##..##......',
    '..##..##......',
    '.###..#######.',
    '.##.....#####.',
    '..............',
  ],
  i: [
    '..............',
    '..............',
    '.###..........',
    '.###....###...',
    '.###.....##...',
    '.###.....###..',
    '..##......##..',
    '..##..#...###.',
    '..##.###...##.',
    '..#####.......',
    '...####.......',
    '....##........',
    '..............',
    '..............',
  ],
  ku: [
    '..............',
    '........##....',
    '.......##.....',
    '......###.....',
    '.....###......',
    '....###.......',
    '...###........',
    '...###........',
    '....###.......',
    '.....###......',
    '......###.....',
    '.......###....',
    '........##....',
    '..............',
  ],
  do: [
    '..............',
    '....##....##..',
    '....##...####.',
    '....###...###.',
    '.....##..###..',
    '.....######...',
    '.....#####....',
    '...####.......',
    '...##.........',
    '..##..........',
    '..###.........',
    '...#########..',
    '....########..',
    '..............',
  ],
  u: [
    '..............',
    '....####......',
    '.....####.....',
    '.......##.....',
    '....######....',
    '..#########...',
    '...##....##...',
    '.........##...',
    '.........##...',
    '........###...',
    '.......###....',
    '.....####.....',
    '.....###......',
    '..............',
  ],
  xyo: [
    '..............',
    '..............',
    '..............',
    '..............',
    '..............',
    '.....##.......',
    '.....##.......',
    '.....#####....',
    '.....#####....',
    '.....##.......',
    '....####......',
    '...##.####....',
    '...#####.##...',
    '....###.......',
  ],
  n: [
    '..............',
    '......##......',
    '......##......',
    '.....###......',
    '.....##.......',
    '....##........',
    '....####......',
    '...######.....',
    '...###.##..##.',
    '..###..##..##.',
    '..##...##.###.',
    '.###...#####..',
    '..#.....###...',
    '..............',
  ],
  go: [
    '..............',
    '...........##.',
    '....##########',
    '...###########',
    '.....#####.#..',
    '......##......',
    '..............',
    '...##.........',
    '..###.........',
    '..##..........',
    '..###.........',
    '...#########..',
    '.....######...',
    '..............',
  ],
  ha: [
    '..............',
    '...#.....#....',
    '..##....##....',
    '..##....####..',
    '..##.########.',
    '..##..#####...',
    '.###....###...',
    '.###.....##...',
    '.####.#####...',
    '.###########..',
    '..##.##.#####.',
    '..##.#####..#.',
    '..#....##.....',
    '..............',
  ],
  ta: [
    '..............',
    '.....##.......',
    '....###.......',
    '.########.....',
    '.#######......',
    '....##..####..',
    '...#########..',
    '...##..#......',
    '...##.........',
    '..##..##......',
    '..##..##......',
    '.###..#######.',
    '.##.....#####.',
    '..............',
  ],
  '': [],
};

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
  // 1 色（かざりの 箱の 絵）: 地の 色 ＋ ふち（暗い）＋ 左上の ハイライト ＋ 右下の 影 ＋ 小さな むら（もよう・ふち・影の 3 色）
  solid: (b, a, s) => {
    void a;
    const t = mottle(b, [shade(b, 10), shade(b, -10)], s, 8);
    const edge = hex(shade(b, -55));
    const light = hex(shade(b, 30));
    const dark = hex(shade(b, -28));
    for (let i = 0; i < SIZE; i++) {
      t[idx(i, 1)] = light;
      t[idx(1, i)] = light;
      t[idx(i, SIZE - 2)] = dark;
      t[idx(SIZE - 2, i)] = dark;
    }
    for (let i = 0; i < SIZE; i++) {
      t[idx(i, 0)] = edge;
      t[idx(i, SIZE - 1)] = edge;
      t[idx(0, i)] = edge;
      t[idx(SIZE - 1, i)] = edge;
    }
    return t;
  },
  // 炉の 火: オレンジの 地に 黄色い ほのお と 赤い かげ
  fire: (b, a, s) => {
    const t = mottle(b, [a[0] ?? b, a[1] ?? b, a[2] ?? b, a[0] ?? b], s, 70);
    return t;
  },
  // のぼり: 地の 色（オレンジ）＋ 黒い かなとこの しるし ＋ 下の 白い 三角
  banner: (b, a, s) => {
    const t = mottle(b, [shade(b, 12), shade(b, -10)], s, 10);
    const ink = hex(a[0] ?? '#2A2A30');
    for (let y = 3; y < 6; y++) for (let x = 3; x < 13; x++) t[idx(x, y)] = ink;
    for (let y = 6; y < 9; y++) for (let x = 6; x < 10; x++) t[idx(x, y)] = ink;
    for (let y = 9; y < 11; y++) for (let x = 4; x < 12; x++) t[idx(x, y)] = ink;
    for (let y = 12; y < 16; y++) for (let x = y - 12; x < 16 - (y - 12); x++) t[idx(x, y)] = hex(a[1] ?? '#F4F2EE');
    cols(t, 0, 1, hex(shade(b, -45)));
    cols(t, SIZE - 1, SIZE, hex(shade(b, -45)));
    return t;
  },
  // たるき: 地の 色に 白い 木口（2 点 × 4 点）が 4 点ごとに ならぶ。上下の 面は 同じ 絵で 細い すじに 見える
  taruki: (b, a, s) => {
    const t = mottle(b, [shade(b, 10), shade(b, -8)], s, 12);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (x % 4 < 2 && y % 8 >= 2 && y % 8 < 6) t[idx(x, y)] = hex(a[0] ?? b);
    return t;
  },
  // かんばんの 字: 地の 色に 金の わく ＋ 字（acc[0] ＝ 字の 色、acc[1] ＝ 字の 名前。空 ＝ 字なし）
  glyph: (b, a, s) => {
    const t = mottle(b, [b], s, 0);
    const gold = hex(a[0] ?? b);
    const edge = hex(a[2] ?? a[0] ?? b);
    rows(t, 0, 1, edge);
    rows(t, SIZE - 1, SIZE, edge);
    if (a[1] !== undefined) {
      cols(t, 0, 1, edge);
      cols(t, SIZE - 1, SIZE, edge);
    }
    (GLYPHS[a[1] ?? ''] ?? []).forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === '#' && x + 1 < SIZE - 1 && y + 1 < SIZE - 1) t[idx(x + 1, y + 1)] = gold;
    });
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
const ART: ReadonlyMap<string, { pat: TownPattern; base: string; acc: readonly string[] }> = new Map([...TOWN_BLOCK_DEFS.map((d) => [d.id, d.art] as const), ...TOWN_EXTRA_TILE_DEFS.map((d) => [d.id, d.art] as const)]);

/** 街の ブロックの 絵 1 まい（y = 0 が 絵の 上）。id ごとに いつも 同じ 絵 */
export function paintTownTile(id: TownBlockId | TownExtraTileName): TownTile {
  const art = ART.get(id)!;
  let seed = 7;
  for (let i = 0; i < id.length; i++) seed = (Math.imul(seed, 31) + id.charCodeAt(i)) >>> 0;
  return PAINT[art.pat](art.base, art.acc, seed);
}
