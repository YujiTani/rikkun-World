import type { ItemId } from '../contracts';
import { HOUSE_TOOL_IDS, type HouseToolId } from '../content/items/ids';
import type { Rgba } from '../world/blocks/textures';

/**
 * HOUSE-1A（#338）みずもり・どうづきの 16x16 アイコン（仮の 絵。アートの 3 案から 本番の 絵に かわる）。
 * 形は itemArtNinja.ts と 同じ（ROWS = 文字の 絵、PAL = 色の 表）。
 *   みずもり: 木の だいに 水を はった みぞ（水平を はかる）
 *   どうづき: 2 本の なわで つった 木の おもり（じがための ドスン）
 */
export function isHouseToolItem(item: ItemId): item is HouseToolId & ItemId {
  return (HOUSE_TOOL_IDS as readonly string[]).includes(item);
}

const PAL: Record<string, number> = {
  O: 0x3b2a1a, // ふち
  W: 0xb8814a, // 木
  w: 0xd9a864, // 木（明るい）
  D: 0x8a5a2e, // 木（暗い）
  B: 0x3a8fe0, // 水
  b: 0x9bd0ff, // 水（つや）
  R: 0xe6d3a0, // なわ
};

const ROWS: Record<HouseToolId, readonly string[]> = {
  mizumori: [
    '................',
    '................',
    '..OOOOOOOOOOOO..',
    '.OwwwwwwwwwwwwO.',
    '.OWOOOOOOOOOOWO.',
    '.OWOBBbBBBbBOWO.',
    '.OWOBbBBBBBBOWO.',
    '.OWOOOOOOOOOOWO.',
    '.OWWWWWWWWWWWWO.',
    '.ODDDDDDDDDDDDO.',
    '..OOOOOOOOOOOO..',
    '..OD........DO..',
    '..OD........DO..',
    '..OOO......OOO..',
    '................',
    '................',
  ],
  dotsuki: [
    '................',
    '..OOOOOOOOOOOO..',
    '..OwwwwwwwwwwO..',
    '..OOOOOOOOOOOO..',
    '....ORO..ORO....',
    '....ORO..ORO....',
    '...OOOOOOOOOO...',
    '..OwWWWWWWWWDO..',
    '..OwWWWWWWWWDO..',
    '..OwWWWWWWWWDO..',
    '..OwWWWWWWWWDO..',
    '..OWWWWWWWWWDO..',
    '..ODDDDDDDDDDO..',
    '...OOOOOOOOOO...',
    '................',
    '................',
  ],
};

const CLEAR: Rgba = [0, 0, 0, 0];

/** みずもり・どうづきの 16x16（pixels[y * 16 + x]、y = 0 が上） */
export function houseToolPixels(item: HouseToolId): Rgba[] {
  const out: Rgba[] = [];
  for (const row of ROWS[item]) {
    for (const ch of row) {
      const c = PAL[ch];
      out.push(c === undefined ? CLEAR : [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
    }
  }
  return out;
}
