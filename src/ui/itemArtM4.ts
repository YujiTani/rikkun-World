import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/** M4 の新しいアイテム 19 こ（ブロックの かまど・かわら・レンガ は ブロックの絵を使う）の和風ドット絵 16x16 */
export const M4_ITEMS = [
  'wood_pickaxe',
  'stone_pickaxe',
  'iron_pickaxe',
  'iron_ingot',
  'bokuto',
  'katana',
  'naginata',
  'crystal_katana',
  'yumi',
  'ya',
  'kabuto',
  'yoroi',
  'torch',
  'lantern',
  'kite',
  'futon',
  'omamori',
  'waraji',
  'haniwa',
] as const;
export type M4ItemId = (typeof M4_ITEMS)[number];

export function isM4Item(item: ItemId): item is M4ItemId {
  return (M4_ITEMS as readonly string[]).includes(item);
}

const S = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

class Canvas16 {
  readonly px: Rgba[] = new Array<Rgba>(S * S).fill(CLEAR);
  put(x: number, y: number, c: Rgba): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    this.px[y * S + x] = c;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      this.put(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
    }
  }
  /** 太さ 2 の線（右にもう 1 本） */
  thick(x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
    this.line(x0, y0, x1, y1, c);
    this.line(x0 + 1, y0, x1 + 1, y1, c);
  }
  rect(x: number, y: number, w: number, h: number, c: Rgba): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, c);
  }
}

function fromRows(rows: readonly string[], palette: Record<string, number>): Rgba[] {
  const out: Rgba[] = [];
  for (const row of rows) {
    for (const ch of row) {
      const c = palette[ch];
      out.push(c === undefined ? CLEAR : hex(c));
    }
  }
  return out;
}

/** つるはし: T の形の頭（かんたんに「道具」と分かる）と、ななめの柄 */
function pickaxe(headColor: number, headShade: number): Rgba[] {
  const c = new Canvas16();
  const wood = hex(0x8a5a2e);
  const woodDark = hex(0x5a3a1a);
  const head = hex(headColor);
  const shade = hex(headShade);
  const edge = hex(0x2b2b2b);
  // 柄（左下 → 頭のまん中）
  c.line(3, 14, 8, 5, woodDark);
  c.line(4, 14, 9, 5, wood);
  c.line(5, 14, 10, 5, wood);
  // 頭（上の横棒。両はしが下に曲がる）
  c.rect(2, 2, 12, 3, edge);
  c.rect(3, 2, 10, 2, head);
  c.rect(3, 4, 10, 1, shade);
  c.put(2, 5, edge);
  c.put(13, 5, edge);
  c.put(2, 4, shade);
  c.put(13, 4, shade);
  c.put(1, 5, edge);
  c.put(14, 5, edge);
  return c.px;
}

/** ななめの刀（左下の つか → 右上の刃）。bend = 刃の そり */
function sword(opts: {
  blade: number;
  bladeEdge: number;
  guard: number;
  handle: number;
  handleMark?: number;
  curved?: boolean;
  alt?: number;
}): Rgba[] {
  const c = new Canvas16();
  const blade = hex(opts.blade);
  const edge = hex(opts.bladeEdge);
  const alt = hex(opts.alt ?? opts.blade);
  // 刃: そりをつけるため途中でずらす
  const pts: [number, number][] = opts.curved
    ? [
        [6, 9],
        [7, 7],
        [8, 6],
        [10, 5],
        [11, 3],
        [13, 2],
        [14, 1],
      ]
    : [
        [6, 9],
        [7, 8],
        [8, 7],
        [9, 6],
        [10, 5],
        [11, 4],
        [12, 3],
        [13, 2],
        [14, 1],
      ];
  pts.forEach(([x, y], i) => {
    c.put(x, y, i % 2 === 0 ? blade : alt);
    c.put(x + 1, y, edge);
    c.put(x, y + 1, i % 2 === 0 ? alt : blade);
  });
  // つば
  const g = hex(opts.guard);
  c.line(4, 9, 7, 12, g);
  c.line(5, 9, 8, 12, g);
  c.put(4, 10, g);
  c.put(7, 11, g);
  // つか
  const h = hex(opts.handle);
  c.line(3, 11, 1, 13, h);
  c.line(4, 12, 2, 14, h);
  c.put(1, 14, h);
  if (opts.handleMark !== undefined) {
    const m = hex(opts.handleMark);
    c.put(3, 12, m);
    c.put(2, 13, m);
  }
  return c.px;
}

function bokuto(): Rgba[] {
  const c = new Canvas16();
  const light = hex(0xd9b27c);
  const mid = hex(0xb98b54);
  const dark = hex(0x7a5530);
  const pts: [number, number][] = [
    [3, 13],
    [4, 11],
    [5, 10],
    [6, 8],
    [8, 7],
    [9, 5],
    [11, 4],
    [12, 3],
    [13, 2],
  ];
  pts.forEach(([x, y]) => {
    c.put(x, y, light);
    c.put(x + 1, y, mid);
    c.put(x, y + 1, mid);
    c.put(x + 2, y, dark);
  });
  c.put(14, 1, dark);
  c.put(14, 2, mid);
  c.line(2, 14, 3, 15, dark);
  c.put(2, 13, dark);
  return c.px;
}

function naginata(): Rgba[] {
  const c = new Canvas16();
  const wood = hex(0x8a5a2e);
  const woodDark = hex(0x5a3a1a);
  const silver = hex(0xe0e0e8);
  const edge = hex(0x9a9aa6);
  // 長い柄
  c.line(1, 15, 10, 6, woodDark);
  c.line(2, 15, 11, 6, wood);
  c.put(9, 7, hex(0xc0392b));
  // そった刃
  const pts: [number, number][] = [
    [10, 6],
    [11, 4],
    [12, 3],
    [13, 2],
    [14, 1],
    [15, 0],
  ];
  pts.forEach(([x, y]) => {
    c.put(x, y, silver);
    c.put(x - 1, y, silver);
    c.put(x + 1, y + 1, edge);
  });
  c.put(10, 5, silver);
  c.put(9, 6, edge);
  return c.px;
}

function yumi(): Rgba[] {
  const c = new Canvas16();
  const wood = hex(0x8a5a2e);
  const dark = hex(0x5a3a1a);
  const str = hex(0xffffff);
  const arc: [number, number][] = [
    [10, 0],
    [8, 1],
    [6, 3],
    [5, 5],
    [4, 7],
    [4, 9],
    [5, 11],
    [6, 13],
    [8, 14],
    [10, 15],
  ];
  for (let i = 0; i < arc.length - 1; i++) {
    c.line(arc[i][0], arc[i][1], arc[i + 1][0], arc[i + 1][1], wood);
    c.line(arc[i][0] + 1, arc[i][1], arc[i + 1][0] + 1, arc[i + 1][1], dark);
  }
  c.line(10, 0, 10, 15, str);
  c.rect(4, 7, 3, 2, hex(0xc9a066)); // 持つところ
  return c.px;
}

function ya(): Rgba[] {
  const c = new Canvas16();
  const wood = hex(0x8a5a2e);
  const metal = hex(0x8a8a8a);
  const dark = hex(0x555555);
  const white = hex(0xffffff);
  c.line(3, 13, 12, 4, wood);
  // 先
  c.put(13, 3, metal);
  c.put(14, 2, dark);
  c.put(12, 3, metal);
  c.put(13, 4, metal);
  c.put(13, 2, dark);
  c.put(14, 3, dark);
  c.put(12, 2, dark);
  c.put(14, 4, dark);
  // はね
  c.line(1, 13, 3, 15, white);
  c.line(2, 12, 4, 14, white);
  c.line(1, 12, 1, 14, hex(0xd0d0d0));
  c.line(3, 15, 3, 15, hex(0xd0d0d0));
  c.put(2, 11, white);
  c.put(4, 15, white);
  return c.px;
}

const KABUTO = [
  '................',
  '.......YY.......',
  '......YYYY......',
  '.....KKBBKK.....',
  '....KBBBBBBK....',
  '...KBLBBBBBBK...',
  '...KBLBBYBBBK...',
  '..KBBBBYYBBBBK..',
  '..KBBBBBYYBBBK..',
  '..KBBBBBBBBBBK..',
  '.KKKKKKKKKKKKKK.',
  '.KDDDDDDDDDDDDK.',
  '.KDDKKDDDDKKDDK.',
  '..KK..KKKKKK.KK.',
  '................',
  '................',
];
const YOROI = [
  '................',
  '..KKKK....KKKK..',
  '.KBBBBKKKKBBBBK.',
  '.KBDDBBBBBBDDBK.',
  '..KKKRRRRRRKKK..',
  '...KRRWRRWRRK...',
  '...KDDDDDDDDK...',
  '...KRRWRRWRRK...',
  '...KDDDDDDDDK...',
  '...KRRWRRWRRK...',
  '...KDDDDDDDDK...',
  '...KRRWRRWRRK...',
  '....KKKKKKKK....',
  '................',
  '................',
  '................',
];
const IRON_INGOT = [
  '................',
  '................',
  '................',
  '................',
  '.....KKKKKKKK...',
  '....KWWWWWWWWK..',
  '...KWSSSSSSSSDK.',
  '..KKKKKKKKKKKDK.',
  '..KWWWWWWWWWSDK.',
  '..KWSSSSSSSSSDK.',
  '..KSSSSSSSSSDDK.',
  '..KDDDDDDDDDDKK.',
  '...KKKKKKKKKKK..',
  '................',
  '................',
  '................',
];
const TORCH = [
  '................',
  '.......K........',
  '......KOK.......',
  '.....KOYOK......',
  '....KOYYYOK.....',
  '....KOYYYOK.....',
  '.....KOYOK......',
  '......KKK.......',
  '......KBK.......',
  '......KBK.......',
  '......KBK.......',
  '......KBK.......',
  '......KDK.......',
  '......KDK.......',
  '.......K........',
  '................',
];
const LANTERN = [
  '.......KK.......',
  '.......KK.......',
  '......KKKK......',
  '....KKDDDDKK....',
  '...KRRRWWRRRK...',
  '..KRRRRWWRRRRK..',
  '..KRWRRWWRRWRK..',
  '..KRWRRWWRRWRK..',
  '..KRRRRWWRRRRK..',
  '...KRRRWWRRRK...',
  '....KKDDDDKK....',
  '.....KKKKKK.....',
  '.......YY.......',
  '.......YY.......',
  '......YYYY......',
  '................',
];
const KITE = [
  '.......KK.......',
  '......KWWK......',
  '.....KWWWWK.....',
  '....KWWRRWWK....',
  '...KWWRRRRWWK...',
  '..KWWWWRRWWWWK..',
  '...KWWWRRWWWK...',
  '....KWWRRWWK....',
  '.....KWWWWK.....',
  '......KWWK......',
  '.......KK.......',
  '.......K........',
  '......RK........',
  '.......KR.......',
  '......RK........',
  '................',
];
const FUTON = [
  '................',
  '................',
  '................',
  '...KKKKKKKKKKK..',
  '..KWWWWKRRRRRRK.',
  '.KWWWWWKRRDRRRRK',
  '.KWWWWWKRRRRDRRK',
  '.KWWGWWKRRRRRRRK',
  '..KKKKKKRRDRRRRK',
  '......KRRRRRRRDK',
  '.......KDDDDDDK.',
  '........KKKKKK..',
  '................',
  '................',
  '................',
  '................',
];
const OMAMORI = [
  '.......YY.......',
  '......Y..Y......',
  '......Y..Y......',
  '.....KYYYYK.....',
  '....KRRRRRRK....',
  '...KRRRYYRRRK...',
  '...KRRYRRYRRK...',
  '...KRRRYYRRRK...',
  '...KRRRRRRRRK...',
  '...KRRRRRRRRK...',
  '...KRRRRRRRRK...',
  '....KRRRRRRK....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
];
const WARAJI = [
  '................',
  '................',
  '.........YY.....',
  '........YOOY....',
  '.......YOROOY...',
  '......YORRROY...',
  '.....YOOROOY....',
  '....YOOOROOY....',
  '...YOOOOOOY.....',
  '..YOOOOOOY......',
  '..YOOOOOY.......',
  '...YOOOY........',
  '....YYY.........',
  '................',
  '................',
  '................',
];
const HANIWA = [
  '................',
  '.....KKKK.......',
  '....KBBBBK......',
  '...KBBBBBBK.....',
  '...KBKBBKBK.....',
  '...KBBBBBBK.....',
  '...KBBKKBBK.....',
  '....KBBBBK......',
  '...KKBBBBKK.....',
  '..KBBBBBBBBK....',
  '..KBBLBBBBBK....',
  '...KBBBBBBK.....',
  '...KBBKKBBK.....',
  '...KKKKKKKK.....',
  '................',
  '................',
];

const PAL_COMMON = {
  K: 0x2b2b2b,
  B: 0x3d5a9e, // こい青
  L: 0x6f8fd0,
  Y: 0xf2c230, // 金
  D: 0x7a5530,
  R: 0xc0392b, // 赤
  W: 0xffffff,
  S: 0xc8ccd6,
  G: 0xe0d0b0,
  O: 0xd9a441,
};

/** M4 のアイテムの 16x16。pixels[y * 16 + x]、y = 0 が上 */
export function m4ItemPixels(item: M4ItemId): Rgba[] {
  switch (item) {
    case 'wood_pickaxe':
      return pickaxe(0xa0703c, 0x7a5530);
    case 'stone_pickaxe':
      return pickaxe(0x8a8a8a, 0x666666);
    case 'iron_pickaxe':
      return pickaxe(0xe0e0e8, 0xa8a8b4);
    case 'iron_ingot':
      return fromRows(IRON_INGOT, { K: 0x3b3f4a, W: 0xf4f4fa, S: 0xc8ccd6, D: 0x8a8f9c });
    case 'bokuto':
      return bokuto();
    case 'katana':
      return sword({ blade: 0xe8e8f0, bladeEdge: 0x9a9aa6, guard: 0xf2c230, handle: 0x222222, handleMark: 0xffffff });
    case 'naginata':
      return naginata();
    case 'crystal_katana': {
      const px = sword({
        blade: 0x9fe8ff,
        bladeEdge: 0x6fb8e0,
        guard: 0xf2c230,
        handle: 0x222222,
        handleMark: 0xffffff,
        alt: 0xc79bff,
      });
      const w = hex(0xffffff);
      for (const [x, y] of [
        [11, 1],
        [14, 4],
        [8, 4],
      ] as const) {
        px[y * S + x] = w;
        px[y * S + x + 1] = w;
        if (y > 0) px[(y - 1) * S + x] = w;
        if (y < S - 1) px[(y + 1) * S + x] = w;
      }
      return px;
    }
    case 'yumi':
      return yumi();
    case 'ya':
      return ya();
    case 'kabuto':
      return fromRows(KABUTO, PAL_COMMON);
    case 'yoroi':
      return fromRows(YOROI, { ...PAL_COMMON, B: 0xc0392b, D: 0x8a2a20 });
    case 'torch':
      return fromRows(TORCH, { K: 0x3a2410, O: 0xff8a1d, Y: 0xffe066, B: 0x8a5a2e, D: 0x5a3a1a });
    case 'lantern':
      return fromRows(LANTERN, { K: 0x2b2b2b, D: 0x5a3a1a, R: 0xd8382d, W: 0xfff5e0, Y: 0xf2c230 });
    case 'kite':
      return fromRows(KITE, { K: 0x555555, W: 0xffffff, R: 0xd8382d });
    case 'futon':
      return fromRows(FUTON, { K: 0x4a2a2a, W: 0xffffff, G: 0xd8d8e8, R: 0xd8382d, D: 0xa82a22 });
    case 'omamori':
      return fromRows(OMAMORI, { K: 0x5a1f1a, R: 0xd8382d, Y: 0xf2c230 });
    case 'waraji':
      return fromRows(WARAJI, { Y: 0x8a6a2a, O: 0xd9b45a, R: 0xc0392b });
    case 'haniwa':
      return fromRows(HANIWA, { K: 0x4a2a14, B: 0xc9783f, L: 0xe3a06a });
  }
}

const HAMMER = [
  '................',
  '...KKKKKKKK.....',
  '..KSSSSSSSDK....',
  '..KSLLLLLSDK....',
  '..KSSSSSSSDK....',
  '..KDDDDDDDDK....',
  '...KKKBBKKK.....',
  '......KBBK......',
  '......KBBK......',
  '......KBBK......',
  '......KBBK......',
  '......KBBK......',
  '......KBBK......',
  '......KDDK......',
  '.......KK.......',
  '................',
];

/** かなづち（つくれる マーク・ツールチップ） */
export function hammerPixels(): Rgba[] {
  return fromRows(HAMMER, { K: 0x2b2b2b, S: 0xb8bcc8, L: 0xe8eaf0, D: 0x70747f, B: 0xa0703c });
}

const CLOCK = [
  '................',
  '.....KKKKKK.....',
  '...KKWWWWWWKK...',
  '..KWWWWKWWWWWK..',
  '..KWWWWKWWWWWK..',
  '.KWWWWWKWWWWWWK.',
  '.KWWWWWKWWWWWWK.',
  '.KWWWWWKKKKWWWK.',
  '.KWWWWWWWWWWWWK.',
  '.KWWWWWWWWWWWWK.',
  '..KWWWWWWWWWWK..',
  '..KWWWWWWWWWWK..',
  '...KKWWWWWWKK...',
  '.....KKKKKK.....',
  '................',
  '................',
];

/** 時計（もうすぐ つかえる） */
export function clockPixels(): Rgba[] {
  return fromRows(CLOCK, { K: 0x3a3a3a, W: 0xfff2c0 });
}
