import type { ItemId } from '../contracts';
import { HOUSE_FURNITURE_IDS, HOUSE_PLAN_IDS, type HouseFurnitureId, type HousePlanId } from '../content/items/ids';
import type { Rgba } from '../world/blocks/textures';

/**
 * HOUSE-1B（#339）新しい 家具（ids.ts の HOUSE_FURNITURE_IDS。テーブル・いす・あんどん・ほんだな・おふろ ほか）と せっけいずの 16x16 アイコン（仮の 絵。
 * アートの 3 案から 本番の 絵に かわる）。形は itemArtHouse.ts と 同じ（ROWS = 文字の 絵、PAL = 色の 表）。色は 案 A の 木と ざぶとんに そろえた。
 */
type EditorItemId = HouseFurnitureId | HousePlanId;

export function isHouseEditorItem(item: ItemId): item is EditorItemId & ItemId {
  return (HOUSE_FURNITURE_IDS as readonly string[]).includes(item) || (HOUSE_PLAN_IDS as readonly string[]).includes(item);
}

const PAL: Record<string, number> = {
  O: 0x3b2a1a, // ふち
  W: 0x9c6a42, // 木
  w: 0xbf8c5a, // 木（明るい）
  D: 0x6a3e26, // 木（暗い）
  Z: 0x3d5a9e, // ざぶとん
  z: 0x5b7bc4, // ざぶとん（明るい）
  Y: 0xffe9a8, // あかり
  y: 0xf4ebd2, // しょうじ
  B: 0x3d5a9e, // 本（あお）
  R: 0xb8452e, // 本（あか）
  G: 0x5e8a3a, // 本（みどり）
  Q: 0xd9a030, // 本（きいろ）
  U: 0x6fb8e0, // 水
  u: 0x8fd0f0, // 水（つや）
  S: 0x3a3a44, // てつの おび
  P: 0xefe4ca, // かみ
  N: 0x3d5a9e, // 図の 線
  r: 0xc0392b, // はんこ
};

const ROWS: Record<EditorItemId, readonly string[]> = {
  table: [
    '................',
    '................',
    '................',
    '..OOOOOOOOOOOO..',
    '.OwwwwwwwwwwwwO.',
    '.OWWWWWWWWWWWWO.',
    '.ODDDDDDDDDDDDO.',
    '..OOOOOOOOOOOO..',
    '..ODO......ODO..',
    '..ODO......ODO..',
    '..ODO......ODO..',
    '..ODO......ODO..',
    '..ODO......ODO..',
    '..OOO......OOO..',
    '................',
    '................',
  ],
  chair: [
    '................',
    '....OOOOOOOO....',
    '....OWWWWWWO....',
    '....OWDDDDWO....',
    '....OWWWWWWO....',
    '....OWDDDDWO....',
    '....OWWWWWWO....',
    '...OOOOOOOOOO...',
    '...OZZZZZZZZO...',
    '...OzzzzzzzzO...',
    '...OOOOOOOOOO...',
    '....OWO..OWO....',
    '....OWO..OWO....',
    '....OWO..OWO....',
    '....OOO..OOO....',
    '................',
  ],
  andon: [
    '................',
    '.....OOOOOO.....',
    '....OWWWWWWO....',
    '...OOOOOOOOOO...',
    '...OYYYYYYYYO...',
    '...OYyYYYYyYO...',
    '...ODDDDDDDDO...',
    '...OYYYYYYYYO...',
    '...OYyYYYYyYO...',
    '...ODDDDDDDDO...',
    '...OYYYYYYYYO...',
    '...OOOOOOOOOO...',
    '....OWWWWWWO....',
    '.....OOOOOO.....',
    '................',
    '................',
  ],
  shelf: [
    '................',
    '.OOOOOOOOOOOOOO.',
    '.OBRGQBRBGQRGBO.',
    '.OBRGQBRBGQRGBO.',
    '.OBRGQBRBGQRGBO.',
    '.ODDDDDDDDDDDDO.',
    '.OQGRBQRGBQGRBO.',
    '.OQGRBQRGBQGRBO.',
    '.OQGRBQRGBQGRBO.',
    '.ODDDDDDDDDDDDO.',
    '.OGRBQGRBQGRBQO.',
    '.OGRBQGRBQGRBQO.',
    '.OGRBQGRBQGRBQO.',
    '.OWWWWWWWWWWWWO.',
    '.OOOOOOOOOOOOOO.',
    '................',
  ],
  ofuro: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '..OOOOOOOOOOOO..',
    '.OWwwwwwwwwwwWO.',
    '.OWOUUuUUUuUOWO.',
    '.OWOUuUUUUUUOWO.',
    '.OWOOOOOOOOOOWO.',
    '.OWWWWWWWWWWWWO.',
    '.OSSSSSSSSSSSSO.',
    '.OWWWWWWWWWWWWO.',
    '.ODDDDDDDDDDDDO.',
    '..OOOOOOOOOOOO..',
    '................',
  ],
  long_table: [
    '................',
    '................',
    '................',
    'OOOOOOOOOOOOOOOO',
    'OwwwwwwwwwwwwwwO',
    'OWWWWWWWWWWWWWWO',
    'ODDDDDDDDDDDDDDO',
    'OOOOOOOOOOOOOOOO',
    'ODOO.OOOOOO.OODO',
    'ODO..ODDDDO..ODO',
    'ODO..OOOOOO..ODO',
    'ODO..........ODO',
    'ODO..........ODO',
    'OOO..........OOO',
    '................',
    '................',
  ],
  round_table: [
    '................',
    '................',
    '....OOOOOOOO....',
    '..OOwwwwwwwwOO..',
    '.OwwWWWWWWWWwwO.',
    '.OWWWWWWWWWWWWO.',
    '..OODDDDDDDDOO..',
    '....OOOOOOOO....',
    '......ODDO......',
    '......ODDO......',
    '......ODDO......',
    '....OOODDOOO....',
    '...OWWWDDWWWO...',
    '...OOOOOOOOOO...',
    '................',
    '................',
  ],
  stool: [
    '................',
    '................',
    '................',
    '....OOOOOOOO....',
    '..OOzzzzzzzzOO..',
    '.OZZZZZZZZZZZZO.',
    '.OZZZZZZZZZZZZO.',
    '..OOOOOOOOOOOO..',
    '...OWO....OWO...',
    '...OWO....OWO...',
    '...OWO....OWO...',
    '...OWO....OWO...',
    '...ODO....ODO...',
    '...OOO....OOO...',
    '................',
    '................',
  ],
  sekkeizu: [
    '................',
    '..OOOOOOOOOOOO..',
    '.OPPPPPPPPPPPPO.',
    '.OPPNNNNNNNNPPO.',
    '.OPPNPPPNPPNPPO.',
    '.OPPNPPPNPPNPPO.',
    '.OPPNNNNNNNNPPO.',
    '.OPPNPPPPPPNPPO.',
    '.OPPNPPPPPPNPPO.',
    '.OPPNNNNNNNNPPO.',
    '.OPPPPPPPPPPPPO.',
    '.OPPPPPPPrrPPPO.',
    '.OPPPPPPPrrPPPO.',
    '.OPPPPPPPPPPPPO.',
    '..OOOOOOOOOOOO..',
    '................',
  ],
};

const CLEAR: Rgba = [0, 0, 0, 0];

/** 新しい 家具・せっけいずの 16x16（pixels[y * 16 + x]、y = 0 が上） */
export function houseEditorItemPixels(item: EditorItemId): Rgba[] {
  const out: Rgba[] = [];
  for (const row of ROWS[item]) {
    for (const ch of row) {
      const c = PAL[ch];
      out.push(c === undefined ? CLEAR : [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
    }
  }
  return out;
}
