import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/**
 * NINJA-1（#299）忍者装備 4 つの 16x16 アイコン（オーナー OK 済みの 絵。もとは 共有フォルダ ninja-gear/final/rows.ts.txt）。
 * 形は itemArtGold.ts と 同じ（ROWS = 文字の 絵、PAL = 色の 表）。
 */
export const NINJA_ITEMS = ['ninja_zukin', 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi'] as const;
export type NinjaItemId = (typeof NINJA_ITEMS)[number];

export function isNinjaItem(item: ItemId): item is NinjaItemId & ItemId {
  return (NINJA_ITEMS as readonly string[]).includes(item);
}

const PAL: Record<string, number> = {
  D: 0x1e2a78,
  E: 0x2a1a14,
  F: 0xf0c8a0,
  H: 0x4a5878,
  K: 0x1b2030,
  L: 0x7d96f0,
  M: 0x2a3247,
  N: 0x3550d0,
  O: 0x0a0d16,
  S: 0xe4f0ea,
  T: 0xa9c4b8,
  U: 0x5f7a74,
  W: 0x9fb0d0,
};

const ROWS: Record<NinjaItemId, readonly string[]> = {
  ninja_zukin: [
    '..O..........O..',
    '..OO.OOOOOO.OO..',
    '...OOMMKKKKOO...',
    '..OMWHMKKKKKKO..',
    '..OMHMKKKKKKKO..',
    '.OKMHKKKKKKKKKO.',
    '.OKKKKKTSKKKKKO.',
    '.ODNNNNNNNNNNDO.',
    '.OKFFFFFFFFFFKO.',
    '.OKFEFFFFFFEFKO.',
    '.OKKKKKKKKKKKKO.',
    '.OMHKKKKKKKKKKO.',
    '..OMKKKKKKKKKO..',
    '...OKKKKKKKKO...',
    '....OOOOOOOO....',
    '................',
  ],
  ninja_shozoku: [
    '................',
    '....OOOOOOOO....',
    '..OONLLNNNNDOO..',
    '.OMKODNNNNDOKKO.',
    'OMWKKONDDNOKKKKO',
    'OMHKKKONNOKKKKKO',
    'OKKKKKKOOKKKKKKO',
    '.OOOKKKMKKKKOOO.',
    '...OMKKMKKKKO...',
    '...ODNNNNNNDO...',
    '...OKKKTSKKKO...',
    '...OMKKKMKKKO...',
    '...OMKKKMKKKO...',
    '...OKKKKMKKKO...',
    '...OOOOOOOOOO...',
    '................',
  ],
  ninja_tekko: [
    '................',
    '.......O........',
    '.....OOFOO......',
    '....OFOFOFOO....',
    '....OFOFOFOFO...',
    '....ONNNNNNNO...',
    '..OOOMKTSKKKO...',
    '.OFFOWTKKTKKO...',
    '..OFFOMSUKKKO...',
    '...OOMKKKKKO....',
    '....ONNNNNNO....',
    '....OHKKTKKO....',
    '....OMKTSTKO....',
    '....OMKKUKKO....',
    '....ONNNNNNO....',
    '....OOOOOOOO....',
  ],
  ninja_tabi: [
    '................',
    '....OOOOOOOO....',
    '....ONNNNNNO....',
    '....OMKKKKKO....',
    '....OWKTSKKO....',
    '....OHTKKTKO....',
    '....OMKSUKKO....',
    '....OMKKKKKO....',
    '....OMKKKKKO....',
    '.OOOOMKKKKKO....',
    'OMKOKKKKKKKO....',
    'OHKOKKKTKKKO....',
    'OMKOKKTSTKKO....',
    'ONNNNNNNNNNO....',
    'OOOOOOOOOOOO....',
    '................',
  ],
};

const CLEAR: Rgba = [0, 0, 0, 0];

/** 忍者装備の 16x16 */
export function ninjaItemPixels(item: NinjaItemId): Rgba[] {
  const out: Rgba[] = [];
  for (const row of ROWS[item]) {
    for (const ch of row) {
      const c = PAL[ch];
      out.push(c === undefined ? CLEAR : [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
    }
  }
  return out;
}
