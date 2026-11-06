import { MATERIAL_ITEM_IDS, type MaterialId } from '../content/items/ids';
import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/** ブロックでない材料（M4 のクラフトの材料）。絵と、手に持つ見た目をここに集める */
export type MaterialItemId = MaterialId;

/** id の 出どころは content/items/ids.ts（値は content/items/materials.ts） */
export const MATERIAL_ITEMS: readonly MaterialItemId[] = MATERIAL_ITEM_IDS;

export function isMaterialItem(item: ItemId): item is MaterialItemId {
  return (MATERIAL_ITEMS as readonly string[]).includes(item);
}

const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

interface Art {
  rows: readonly string[];
  palette: Record<string, number>;
}

const ART: Record<MaterialItemId, Art> = {
  // あさ（ROPE-1）: たばねた くさいろの せんい。まん中を こい ちゃいろの ひもで しばる。上と 下が ほうきの ように ひろがる
  hemp: {
    palette: { K: 0x4a3a18, L: 0xd8c98a, M: 0xb9a86a, D: 0x8a7a3e, T: 0x6a4a22 },
    rows: [
      '................',
      '...K.K..K.K.K...',
      '..KLKMKLKMKLK...',
      '...KLMLMLMLDK...',
      '....KLMLMLDK....',
      '.....KLMLDK.....',
      '.....KMLMDK.....',
      '....KTTTTTTK....',
      '....KTTTTTTK....',
      '.....KMLMDK.....',
      '.....KLMLDK.....',
      '....KLMLMLDK....',
      '...KLMLMLMLDK...',
      '..KLKMKLKMKLDK..',
      '...K.K..K.K.K...',
      '................',
    ],
  },
  // かみ: 白い紙。右上がおれて、文字の線
  paper: {
    palette: { K: 0x555555, W: 0xffffff, G: 0xd8d8d8, L: 0x9aa7b8 },
    rows: [
      '................',
      '..KKKKKKKKK.....',
      '..KWWWWWWWKK....',
      '..KWWWWWWWKGK...',
      '..KWLLLLLWKGGK..',
      '..KWWWWWWWKKKK..',
      '..KWLLLLLLLWWK..',
      '..KWWWWWWWWWWK..',
      '..KWLLLLLLLWWK..',
      '..KWWWWWWWWWWK..',
      '..KWLLLLLWWWWK..',
      '..KWWWWWWWWWWK..',
      '..KWLLLLLLLWWK..',
      '..KWWWWWWWWWWK..',
      '..KKKKKKKKKKKK..',
      '................',
    ],
  },
  // あぶら: こはく色のびん
  oil: {
    palette: { K: 0x4a3410, B: 0xe0a020, Y: 0xffd966, G: 0x8a8f99, W: 0xffffff },
    rows: [
      '................',
      '......KKKK......',
      '......KGGK......',
      '......KGGK......',
      '.....KKKKKK.....',
      '....KBBBBBBK....',
      '...KBYWBBBBBK...',
      '...KBYWBBBBBK...',
      '...KBYBBBBBBK...',
      '...KBBBBBBBBK...',
      '...KBBBBBBBBK...',
      '...KBBBBBBBBK...',
      '....KBBBBBBK....',
      '.....KKKKKK.....',
      '................',
      '................',
    ],
  },
  // いと: まきとったいと
  string: {
    palette: { K: 0x6b5a3c, S: 0xf3ead2, D: 0xcdbf9a },
    rows: [
      '................',
      '................',
      '.....KKKKKK.....',
      '...KKSSSSSSKK...',
      '..KSSDSSSSDSSK..',
      '..KSDSSSSSSDSK..',
      '.KSSSDDDDDDSSSK.',
      '.KSSDSSSSSSDSSK.',
      '.KSSDSSSSSSDSSK.',
      '.KSSSDDDDDDSSSK.',
      '..KSDSSSSSSDSK..',
      '..KSSDSSSSDSSK..',
      '...KKSSSSSSKK...',
      '.....KKKKKK.....',
      '..........SSSS..',
      '................',
    ],
  },
  // ぬの: おりたたんだ赤い布
  cloth: {
    palette: { K: 0x5a1f2a, R: 0xd8485f, P: 0xff8aa0, D: 0xa8304a },
    rows: [
      '................',
      '................',
      '..KKKKKKKKKKKK..',
      '.KPPPPPPPPPPPRK.',
      '.KPRRRRRRRRRRRK.',
      '.KRRRRRRRRRRRDK.',
      '.KKKKKKKKKKKKKK.',
      '.KPPPPPPPPPPRRK.',
      '.KPRRRRRRRRRRRK.',
      '.KRRRRRRRRRRRDK.',
      '.KRRRRRRRRRRDDK.',
      '..KKKKKKKKKKKK..',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  // ねんど: 茶色いかたまり
  clay: {
    palette: { K: 0x5a3a22, C: 0xb5764a, L: 0xd49a6a, D: 0x8f5834 },
    rows: [
      '................',
      '................',
      '................',
      '.....KKKKKK.....',
      '...KKLLLLCCKK...',
      '..KLLLLCCCCCCK..',
      '.KLLLCCCCCCCCDK.',
      '.KLLCCCCCCCCDDK.',
      '.KLCCCCCCCCDDDK.',
      '.KCCCCCCCCDDDDK.',
      '.KCCCCCCDDDDDDK.',
      '..KDDDDDDDDDDK..',
      '...KKKKKKKKKK...',
      '................',
      '................',
      '................',
    ],
  },
  // すいしょう: 水色の宝石
  crystal: {
    palette: { K: 0x1d4a66, C: 0x6fd8ff, L: 0xc9f3ff, D: 0x3a9ccf, W: 0xffffff },
    rows: [
      '................',
      '.......KK.......',
      '......KLLK......',
      '.....KLWCCK.....',
      '....KLWCCCDK....',
      '...KLWCCCCCDK...',
      '...KLCCCCCCDK...',
      '...KCCCCCCCDK...',
      '...KCCCCCCDDK...',
      '...KCCCCCDDDK...',
      '....KCCCCDDK....',
      '....KCCCDDDK....',
      '.....KCCDDK.....',
      '......KDDK......',
      '.......KK.......',
      '................',
    ],
  },
  // すみ: 黒い すみの かたまり（TAKO-1。タコはちまきの すみ）。上の面に つや、右下に こい かげ
  sumi: {
    palette: { K: 0x14121f, B: 0x2c2840, M: 0x3b3554, L: 0x6a6390, W: 0x9a93c0 },
    rows: [
      '................',
      '................',
      '....KKKKKKKK....',
      '...KMMMMLLWMK...',
      '..KMMLLLMMMMBK..',
      '..KMLMMMMMMMBK..',
      '..KMMMMMMMMMBK..',
      '..KMMMMMMMMBBK..',
      '..KMMMMMMMMBBK..',
      '..KBMMMMMMBBBK..',
      '..KBBMMMMBBBBK..',
      '..KBBBBBBBBBBK..',
      '...KKKKKKKKKK...',
      '................',
      '................',
      '................',
    ],
  },
};

/** 材料のアイテムの 16x16 */
export function materialPixels(item: MaterialItemId): Rgba[] {
  const a = ART[item];
  const out: Rgba[] = [];
  for (const row of a.rows) {
    for (const ch of row) {
      const c = a.palette[ch];
      out.push(c === undefined ? CLEAR : hex(c));
    }
  }
  return out;
}

/** 手に持つ見た目: 色と大きさ（はば×高さ×おく）。ブロックでないものは小さな板やかたまり */
export const HELD_MATERIAL: Record<MaterialItemId, { color: number; size: readonly [number, number, number] }> = {
  paper: { color: 0xf5f5f5, size: [0.3, 0.38, 0.03] },
  oil: { color: 0xe0a020, size: [0.17, 0.26, 0.17] },
  string: { color: 0xf3ead2, size: [0.24, 0.12, 0.24] },
  cloth: { color: 0xd8485f, size: [0.34, 0.26, 0.05] },
  clay: { color: 0xb5764a, size: [0.26, 0.2, 0.26] },
  crystal: { color: 0x6fd8ff, size: [0.18, 0.3, 0.18] },
  hemp: { color: 0xb9a86a, size: [0.22, 0.3, 0.1] },
  sumi: { color: 0x2c2840, size: [0.24, 0.16, 0.24] },
};
