import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/**
 * SAMURAI-1（#300）侍装備 4 つの 16x16 アイコン（オーナー OK 済みの 絵。もとは 共有フォルダ samurai-gear/final/rows.ts.txt。
 * 陣笠・羽織 = B 案、手甲・下駄 = A 案。絵の 中の 名前 myochin_* は 仕様の id samurai_* に そろえた）。形は itemArtNinja.ts と 同じ。
 */
export const SAMURAI_ITEMS = ['samurai_jingasa', 'samurai_haori', 'samurai_tekko', 'samurai_geta'] as const;
export type SamuraiItemId = (typeof SAMURAI_ITEMS)[number];

export function isSamuraiItem(item: ItemId): item is SamuraiItemId & ItemId {
  return (SAMURAI_ITEMS as readonly string[]).includes(item);
}

const PAL: Record<string, number> = {
  B: 0xe6cc9c,
  C: 0xb28e5e,
  D: 0x52286c,
  G: 0xe6cc84,
  H: 0x7a6a64,
  I: 0x6e5032,
  J: 0x9c7a3e,
  K: 0x2e2628,
  L: 0xbe8ade,
  M: 0x4a3e3e,
  O: 0x1c1012,
  P: 0x8a4ab0,
  Q: 0x9e2622,
  R: 0xe0442c,
  W: 0xfff2dc,
  Y: 0xf68a5c,
};

const ROWS: Record<SamuraiItemId, readonly string[]> = {
  samurai_jingasa: [
    '................',
    '................',
    '................',
    '......OOOO......',
    '....OOHMKKOO....',
    '..OOHMKKKKKKOO..',
    '.OHMKGKGKGKGKKO.',
    'OHMKGGGGGGGGGKKO',
    'OKKKKKKKKKKKKKKO',
    '.OOOOOOOOOOOOOO.',
    '.GJG.L......L...',
    '.J.G..L....L....',
    '.GGJ...LPPL.....',
    '..J.....DD......',
    '..G.............',
    '................',
  ],
  samurai_haori: [
    '................',
    '....OOOOOOOO....',
    '..OOKKGOOGKKOO..',
    '.ORRKKKGGKKKRQO.',
    'OYRRRKKKKKKRRRQO',
    'OYRRRRKKKKRRRRQO',
    'OYRQRRRKKRRRQRQO',
    'OKGKGKGKGKGKGKGO',
    'OGKGKGKGKGKGKGKO',
    '.OQQRRRPPRRRQQO.',
    '..OYRRPLLPRRQO..',
    '..OYRRRPPRRRQO..',
    '..OYRRRDRRRRQO..',
    '..OQQQQDQQQQQO..',
    '..OOOOOOOOOOOO..',
    '................',
  ],
  samurai_tekko: [
    '................',
    '....OOOOOOO.....',
    '...OHOKOKOKO....',
    '...OMOKOKOKO....',
    '..OOMKKKKKKO....',
    '.OHKKKGGGKKO....',
    '.OMKKGKKKGKO....',
    '..OKKKGGGKKO....',
    '...OKKKKKKKO....',
    '..OJGGGGGGGJO...',
    '.OWYRRRRRRRRQO..',
    '.OYRRRRRRRRRQO..',
    'OYRRRRRRRRRRRQO.',
    'OQQQQQQQQQQQQQO.',
    'OOOOOOOOOOOOOOO.',
    '................',
  ],
  samurai_geta: [
    '................',
    '................',
    '................',
    '....OOOOOO......',
    '...OMKKKKKO.....',
    '...OKOOOOKO.....',
    '...OKO...OKO....',
    'OOOOKOOOOOKOOOOO',
    'OWBBBBBBBBBBBBCO',
    'OCCCCCCCCCCCCCIO',
    'OOOOOOOOOOOOOOOO',
    '..OBCO....OBCO..',
    '..OBCO....OBCO..',
    '..OCIO....OCIO..',
    '..OOOO....OOOO..',
    '................',
  ],
};

const CLEAR: Rgba = [0, 0, 0, 0];

/** 侍装備の 16x16 */
export function samuraiItemPixels(item: SamuraiItemId): Rgba[] {
  const out: Rgba[] = [];
  for (const row of ROWS[item]) {
    for (const ch of row) {
      const c = PAL[ch];
      out.push(c === undefined ? CLEAR : [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
    }
  }
  return out;
}
