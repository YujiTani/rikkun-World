import type { Rgba } from '../world/blocks/textures';

/**
 * LIVE-2 の アイテムの 16×16 アイコン（DESIGN 16.14・16.15）。
 *  - `kin_tamago` = `egg` と 同じ 形に きんいろ（白黒でも ちがう: 明るさ が ひくい ＋ キラ 1 つ。仕様 §3.2）。
 *  - `toriya` = 藍の 三角やね の 小屋 と ひくい さく（K3「さく の にわ」）。
 *  - `nukunuku`（こたつ）は ブロック なので ブロック の 横の 面（`textures.ts` の `kotatsu_side`）を そのまま 使う。
 * まわり 1 ドットは こい色 #2A1E14（M7 と 同じ）。
 */
const CLEAR: Rgba = [0, 0, 0, 0];
const OUTLINE = 0x2a1e14;
const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

type Palette = Record<string, number>;
function fromRows(rows: readonly string[], pal: Palette): Rgba[] {
  const px: Rgba[] = [];
  for (const row of rows) for (const ch of row) px.push(ch === '.' ? CLEAR : hex(pal[ch]));
  return px;
}

// やね B = 藍 #4F6690、すじ C = #3D5A9E、かべ D = #C9A574、戸口 E = #3A2A22、さく F = #9E7C50、よこ木 G = #D9BB8A、ふち A
const TORIYA_ROWS = [
  '................',
  '.......AA.......',
  '......ABBA......',
  '.....ABCBBA.....',
  '....ABBCBBBA....',
  '...ABCBBCBBBA...',
  '..ABBBCBBBCBBA..',
  '..AAAAAAAAAAAA..',
  '...ADDDDDDDDA...',
  '...ADDDEEDDDA...',
  '.A.ADDEEEEDDA.A.',
  '.AFADDEEEEDDAFA.',
  '.AGAAAEEEEAAAGA.',
  '.AFGGGGGGGGGGFA.',
  '.AFAAAAAAAAAAFA.',
  '..AA........AA..',
];
const TORIYA_PAL: Palette = { A: OUTLINE, B: 0x4f6690, C: 0x3d5a9e, D: 0xc9a574, E: 0x3a2a22, F: 0x9e7c50, G: 0xd9bb8a };

// ふち A、体 B = #F4C430、かげ C = #C8921C、つや D = #FFF1A8、キラ E = 白
const KIN_ROWS = [
  '...........E....',
  '..........EEE...',
  '.....AAAA..E....',
  '....ABBBBA......',
  '...ABDBBBBA.....',
  '...ABDBBBBA.....',
  '..ABDBBBBBBA....',
  '..ABBBBBBBBA....',
  '..ABBBBBBBBCA...',
  '.ABBBBBBBBBCCA..',
  '.ABBBBBBBBBCCA..',
  '.ABBBBBBBBCCCA..',
  '.ABBBBBBBCCCCA..',
  '..ABBBBCCCCCA...',
  '...AACCCCCCAA...',
  '.....AAAAAA.....',
];
const KIN_PAL: Palette = { A: OUTLINE, B: 0xf4c430, C: 0xc8921c, D: 0xfff1a8, E: 0xffffff };

let toriyaCache: Rgba[] | null = null;
let kinCache: Rgba[] | null = null;

/** とりごや の 16×16（y = 0 が上） */
export function toriyaPixels(): Rgba[] {
  return (toriyaCache ??= fromRows(TORIYA_ROWS, TORIYA_PAL));
}

/** きん の たまご の 16×16（y = 0 が上） */
export function kinTamagoPixels(): Rgba[] {
  return (kinCache ??= fromRows(KIN_ROWS, KIN_PAL));
}
