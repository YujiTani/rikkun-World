import type { Rgba } from '../world/blocks/textures';

/**
 * ふで の 16x16（TAKO-1）。竹の じく（右上 → 左下）＋ 黒い 穂先。手に持つ形は 持たない（2D の 絵を そのまま）。
 * すみ の 絵は ui/itemArt.ts（ざいりょう）。
 */
export type TakoItemId = 'fude';
export const isTakoItem = (item: string): item is TakoItemId => item === 'fude';

const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const PALETTE: Record<string, number> = { K: 0x14121f, B: 0x2c2840, M: 0x3b3554, T: 0xd9b45a, D: 0xa88636, L: 0xf0d98a, R: 0x7a5a22 };

const ROWS = [
  '..............RR',
  '.............TLR',
  '............TLDR',
  '...........TLDR.',
  '..........TLDR..',
  '.........TLDR...',
  '........TLDR....',
  '.......TLDR.....',
  '......TLDR......',
  '.....KMKR.......',
  '....KMMMK.......',
  '...KMMMBK.......',
  '..KMMMBK........',
  '..KMMBK.........',
  '...KBK..........',
  '....K...........',
];

/** ふで の 16x16（y = 0 が上） */
export function takoItemPixels(_item: TakoItemId): Rgba[] {
  const out: Rgba[] = [];
  for (const row of ROWS) for (const ch of row) out.push(PALETTE[ch] === undefined ? CLEAR : hex(PALETTE[ch]!));
  return out;
}
