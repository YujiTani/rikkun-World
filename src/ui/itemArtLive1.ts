import type { Rgba } from '../world/blocks/textures';

/**
 * LIVE-1 たまご の ドット絵 16x16（仕様 §3.2: たまご の 形 = たて長の まる）。
 * 白い やさい（たまねぎ）・かみ・いと と 影 で 分かれる ように、たて長 で、てっぺん が 細く 下 が ふくらむ。
 * まわり 1 ドット を こい色 #2A1E14 で ふちどる（M7 と 同じ）。
 */
const S = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const OUTLINE = 0x2a1e14;
const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

const SHELL = 0xf5ecd8;
const SHADE = 0xd9c9a3;
const LIGHT = 0xffffff;

/** たて 12・よこ 9。上は 細く、下は ふくらむ */
function eggMask(x: number, y: number): boolean {
  const cy = 8.5;
  const dy = (y + 0.5 - cy) / 6.2;
  // 上 (dy<0) は よこ 3.4、下 (dy>0) は よこ 4.6
  const rx = dy < 0 ? 3.4 : 4.6;
  const dx = (x + 0.5 - 8) / rx;
  return dx * dx + dy * dy <= 1;
}

let cache: Rgba[] | null = null;

/** たまご の 16x16（y = 0 が上） */
export function eggPixels(): Rgba[] {
  if (cache) return cache;
  const px: Rgba[] = new Array<Rgba>(S * S).fill(CLEAR);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!eggMask(x, y)) continue;
      // 右下 を かげ に
      const shaded = (x - 8) * 0.8 + (y - 8.5) * 0.9 > 3.2;
      px[y * S + x] = hex(shaded ? SHADE : SHELL);
    }
  }
  // 左上 の つや
  for (const [x, y] of [[6, 5], [6, 6], [5, 7]] as const) if (px[y * S + x][3] !== 0) px[y * S + x] = hex(LIGHT);
  const src = px.slice();
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && src[y * S + x][3] !== 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (src[y * S + x][3] !== 0) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) px[y * S + x] = hex(OUTLINE);
    }
  }
  cache = px;
  return px;
}

/**
 * LIVE-1 版 3.2 の むし（B2「おもち いもむし」）と むしとりあみ（N3「ふかい ふくろ」）の 16×16 アイコン。
 * オーナーが 選んだ 見本 `art/v3/icons/bugB2.png`・`netN3.png` と 同じ ドット（DESIGN 16.16）。
 * まわり 1 ドットは こい色 #2A1E14（M7 と 同じ）。左下 → 右上 の むき。
 */
type Palette = Record<string, number>;

function fromRows(rows: readonly string[], pal: Palette): Rgba[] {
  const px: Rgba[] = [];
  for (const row of rows) for (const ch of row) px.push(ch === '.' ? CLEAR : hex(pal[ch]));
  return px;
}

const BUG_ROWS = [
  '................',
  '................',
  '...........A.A..',
  '..........ABABA.',
  '.........ACCCCA.',
  '........ACCCCCA.',
  '......AABCCDCDA.',
  '....AABBBCCCEEA.',
  '..AABBBBCBCEEA..',
  '.ABBBBCBCBFFA...',
  'ABBBCBCBFFAA....',
  'ABBBCBFFFA......',
  'ABBBFFAAA.......',
  '.ABFFA..........',
  '..AAA...........',
  '................',
];
// 体 B = 生成り #F3E6C8、頭・帯 C = だいだい #E8962E、目 D = #2E2438、頭の かげ E = #C97A22、体の かげ F = #D9C9A3
const BUG_PAL: Palette = { A: OUTLINE, B: 0xf3e6c8, C: 0xe8962e, D: 0x2e2438, E: 0xc97a22, F: 0xd9c9a3 };

const NET_ROWS = [
  '.......AAAAAA...',
  '......ABBBBBBA..',
  '.....ABBCCCCBBA.',
  '.....ABCCCCCCBA.',
  '.....ABCCCCCCBA.',
  '.....ABCCCDCCBA.',
  '.....ABCCCCDCBA.',
  '.....ABBCCCCDBA.',
  '.....ABBBCCBBBA.',
  '.....AEBBBBBBFA.',
  '....AEAAABBAFDFA',
  '...AEA...AA.AFFA',
  '..ADA........AFF',
  '.ADA..........AA',
  'ADA.............',
  '.A..............',
];
// わ B = こい木 #8C5E3A、ふくろ C = 生成り #EFE7D4、すじ・にぎり D = 藍 #3D5A9E、柄 E = #C9B26A、ふくろの かげ F = #E2D6BC
const NET_PAL: Palette = { A: OUTLINE, B: 0x8c5e3a, C: 0xefe7d4, D: 0x3d5a9e, E: 0xc9b26a, F: 0xe2d6bc };

let bugCache: Rgba[] | null = null;
let netCache: Rgba[] | null = null;

/** むし の 16×16（y = 0 が上） */
export function mushiPixels(): Rgba[] {
  return (bugCache ??= fromRows(BUG_ROWS, BUG_PAL));
}

/** むしとりあみ の 16×16（y = 0 が上） */
export function mushiAmiPixels(): Rgba[] {
  return (netCache ??= fromRows(NET_ROWS, NET_PAL));
}
