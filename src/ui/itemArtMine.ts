import type { MineItemId } from '../content/items/ids';
import type { Rgba } from '../world/blocks/textures';

/**
 * チョーク・いしばい の 16×16（MINE-1B #349。docs/art/design/07-mine.md 20.11・yuzu 見本 chalk-items-b2.png）。
 * かき方は ゲームの アイテムの 絵と 同じ: 1 点の こい ふちどり `#3A3442`・左上から 光・右下が かげ・真っ白 なし。
 * ほかの 鉱物（せっかいせき・しっくい・ほたるいし・きんの いし）の アイテムの 絵は ブロックの 絵（BLOCK_TILES）を つかう。
 */
export type MineItemArtId = MineItemId;

const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};
const CLEAR: Rgba = [0, 0, 0, 0];

/** チョーク: ななめの 白い ぼう（右上が 切り口、左下が すりへった 先 E）＋ かいた ばかりの 線の やじるし（しるし B2 と 同じ 感じ） */
const CHALK = {
  pal: { K: '#3A3442', W: '#F2F0EA', H: '#FAF9F5', S: '#D3CDC0', D: '#ADA597', E: '#E4E0D6', G: '#DCD7CB' },
  rows: [
    '...........KKK..',
    '..........KHHWK.',
    '.........KHWWSK.',
    '........KHWWSK..',
    '.......KHWWSK...',
    '......KHWWSK....',
    '.....KHWWSK.....',
    '....KEWWSK......',
    '...KEEWSK.......',
    '...KEESK........',
    '....KKK...W.....',
    '...........W....',
    '....SWGWWWWWW...',
    '...........W....',
    '..........W.....',
    '................',
  ],
} as const;

/** いしばい: 口を まきかえした 青みの 灰の ぬのぶくろ ＋ 白い こなの 山もり ＋ 上に まく つぶ */
const ISHIBAI = {
  pal: { K: '#3A3442', W: '#F2F0EA', H: '#FAF9F5', S: '#D3CDC0', T: '#B9B2A4', C: '#A3A9B6', L: '#BCC1CC', D: '#7D8391', R: '#C6CAD3', r: '#8D93A1' },
  rows: [
    '................',
    '......W....W....',
    '...W.....W....W.',
    '.....KKKKKK.....',
    '....KHWWWWWK....',
    '...KWWWHWWWSK...',
    '..KRWWWWWWSSRK..',
    '..KrRRRRRRRRrK..',
    '...KrrrrrrrrK...',
    '...KCLCCCCCDK...',
    '..KCCCLCCCCCDK..',
    '.KCCCCCLCCCCDDK.',
    '.KLCCCCCLCCCDDK.',
    '.KCCCCCCCCCDDDK.',
    '..KDDCCCCCDDDK..',
    '...KKKKKKKKKK...',
  ],
} as const;

/** 絵の 表（1 つの id に 1 つ。足し忘れは 型エラー） */
const ART = { chalk: CHALK, ishibai: ISHIBAI } as const satisfies Record<MineItemId, { pal: object; rows: readonly string[] }>;

/** チョーク・いしばいか（絵を ここで 引く 物） */
export const isMineItem = (item: string): item is MineItemArtId => Object.hasOwn(ART, item);

/** チョーク・いしばい の 16×16（y = 0 が上） */
export function mineItemPixels(item: MineItemArtId): Rgba[] {
  const art = ART[item];
  const pal: Readonly<Record<string, string>> = art.pal;
  const out: Rgba[] = [];
  for (const row of art.rows) for (const ch of row) out.push(pal[ch] === undefined ? CLEAR : hex(pal[ch]!));
  return out;
}
