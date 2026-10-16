import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/**
 * おの 3 本の 絵（仮。BAL-D。つるはし の 色ちがい あつかい。本物は アート #113 で入れかえる）。
 * つるはし（T の形）と ちがって、頭が 片がわだけに ひろがる おの の形。16x16、y = 0 が上。
 */
export type AxeItemId = 'wood_axe' | 'stone_axe' | 'iron_axe';
const AXES: readonly string[] = ['wood_axe', 'stone_axe', 'iron_axe'];

export function isAxeItem(item: ItemId): item is AxeItemId {
  return AXES.includes(item);
}

const HEADS: Record<AxeItemId, [number, number]> = {
  wood_axe: [0xa0703c, 0x7a5530],
  stone_axe: [0x8a8a8a, 0x666666],
  iron_axe: [0xe0e0e8, 0xa8a8b4],
};

const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

// W = 柄  D = 柄の かげ  H = 頭  S = 頭の かげ  K = ふち
const ROWS = [
  '................',
  '.......KKKK.....',
  '......KHHHHK....',
  '......KHHHHHK...',
  '......KHHHHSSK..',
  '.....KDKHHSSK...',
  '....KDWKKKKK....',
  '....KDWWK.......',
  '...KDWWK........',
  '...KDWWK........',
  '..KDWWK.........',
  '..KDWWK.........',
  '.KDWWK..........',
  '.KDWK...........',
  '.KKK............',
  '................',
];

export function axePixels(item: AxeItemId): Rgba[] {
  const [head, shade] = HEADS[item];
  const pal: Record<string, number> = { W: 0x8a5a2e, D: 0x5a3a1a, H: head, S: shade, K: 0x2b2b2b };
  const out: Rgba[] = [];
  for (const row of ROWS) for (const ch of row) out.push(pal[ch] === undefined ? [0, 0, 0, 0] : hex(pal[ch]));
  return out;
}
