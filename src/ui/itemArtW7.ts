import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';
import { fromRows } from './itemArtM4';

/**
 * WEAPON-7: レジェンダリー武器の アイテムの 絵（16x16）。
 * 雷神剣は オーナー決定 v3-A（2026-10-18 18:22）: そった むらさきの 刃 ＋ 金の 小さな つば ＋ 短い こん色の 柄。
 * 柄なし・大きな 丸い つばは NG。もとの 絵は 共有フォルダ `weapon7/art/raijin_ken_icon_v3_A.png`（`tools/icon3.py` の `A3()`・`tools/icon2.py` の PAL）。
 */
export const W7_ITEMS = ['raijin_ken'] as const;
export type W7ItemId = (typeof W7_ITEMS)[number];

export function isW7Item(item: ItemId): item is W7ItemId {
  return (W7_ITEMS as readonly string[]).includes(item);
}

/** icon2.py の PAL: K ふち・L ぎんいろの つや・M 刃の 明るい むらさき・D 刃の こい むらさき・d 刃の かげ・N/n 柄の こん色・G/g 金（つば） */
const PAL = { K: 0x1b1240, L: 0xf1e4ff, M: 0xb080ff, D: 0x6a3fc8, d: 0x3f2590, N: 0x24336e, n: 0x3f56a8, G: 0xf2c230, g: 0xb8860b };

const RAIJIN_KEN = [
  '............KK..',
  '..........KKdMK.',
  '.........KdDMK..',
  '........KdMLK...',
  '.......KDMLK....',
  '......KDMLK.....',
  '.....KDMLK......',
  '....KdDMLK......',
  '...KdDMLK.......',
  '...KdDMLK.......',
  '...KGMLK........',
  '...KGGLK........',
  '...KNGgK........',
  '..KNnNgK........',
  '.KNNKKK.........',
  'KNnK............',
];

export function w7ItemPixels(item: W7ItemId): Rgba[] {
  switch (item) {
    case 'raijin_ken':
      return fromRows(RAIJIN_KEN, PAL);
  }
}
