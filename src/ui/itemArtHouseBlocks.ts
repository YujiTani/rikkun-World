import type { ItemId } from '../contracts';
import { HOUSE_BLOCK_IDS, type HouseBlockId } from '../world/blocks/houseBlocks';
import { HOUSE_PAL } from '../world/blocks/houseArt';
import { getTilePixels, type Rgba, type TileName } from '../world/blocks/textures';

/**
 * 家の ブロック 5 つ（HOUSE-1C PR-1 #340）の 16x16 アイコン。今の ブロックの アイテムと 同じ きまり（ブロックの 面の 絵を そのまま）:
 * かべ ＝ 横の 面、ゆか・やね ＝ 上の 面（はたけ と 同じ 例外。横の 面では 今の いし・き と 見分けにくい）、しょうじ ＝ 前の 面。
 * 2 マスの 戸は 物の 絵（ふとん・ちょうちん と 同じ。ふち 1 点 #2A1E14）。数の 元は アートの docs/art/house-1/proto/houseLookC.ts.txt の DOOR_ICON。
 */
interface IconArt {
  rows: readonly string[];
  pal: Record<string, string>;
}

export function isHouseBlockItem(item: ItemId): item is HouseBlockId & ItemId {
  return (HOUSE_BLOCK_IDS as readonly string[]).includes(item);
}

const hex = (c: string): Rgba => (c ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255] : [0, 0, 0, 0]);

const DOOR_ICON: IconArt = {
  pal: { K: '#2A1E14', W: HOUSE_PAL.door, D: HOUSE_PAL.doorD, I: HOUSE_PAL.iron, R: HOUSE_PAL.ring },
  rows: [
    '....KKKKKKKK....',
    '....KWDWWDWK....',
    '....KIIIIIIK....',
    '....KWDWWDWK....',
    '....KWDWWDWK....',
    '....KWDWWDWK....',
    '....KWDWWDWK....',
    '....KWRDDRWK....',
    '....KRWRRWRK....',
    '....KWRDDRWK....',
    '....KWDWWDWK....',
    '....KWDWWDWK....',
    '....KIIIIIIK....',
    '....KWDWWDWK....',
    '....KDDDDDDK....',
    '....KKKKKKKK....',
  ],
};

/** ブロックの 面の 絵（アトラスの 名前）で 描く アイコン */
const FACE_ICON: Readonly<Partial<Record<HouseBlockId, TileName>>> = {
  house_floor: 'house_floor',
  house_wall: 'house_wall',
  house_roof: 'house_roof_top',
  shoji: 'house_shoji',
};

export function houseBlockItemPixels(item: HouseBlockId): Rgba[] {
  const face = FACE_ICON[item];
  return face ? getTilePixels(face).slice() : DOOR_ICON.rows.flatMap((row) => [...row].map((ch) => hex(DOOR_ICON.pal[ch] ?? '')));
}
