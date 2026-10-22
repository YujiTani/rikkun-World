import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';
import { fromRows } from './itemArtM4';

/**
 * WEAPON-7: レジェンダリー武器の アイテムの 絵（16x16）。
 * 雷神剣は オーナー決定 v3-A（2026-10-18 18:22）: そった むらさきの 刃 ＋ 金の 小さな つば ＋ 短い こん色の 柄。ART-PIPE-1 で 稲妻の 刃文を 足した。
 * 柄なし・大きな 丸い つばは NG。もとの 絵は 共有フォルダ `weapon7/art/raijin_ken_icon_v3_A.png`（`tools/icon3.py` の `A3()`・`tools/icon2.py` の PAL）。
 */
export const W7_ITEMS = ['raijin_ken', 'fujin_ken', 'niji'] as const;
export type W7ItemId = (typeof W7_ITEMS)[number];

export function isW7Item(item: ItemId): item is W7ItemId {
  return (W7_ITEMS as readonly string[]).includes(item);
}

/** ART-PIPE-1: 雷神剣。K ふち・d/D/M 刃（かげ・こい・あかるい むらさき）・L つや・Y 稲妻の 刃文（きいろ）・N/n 柄・G/g 金（つば）。もとは art/ART-PIPE-1/icon-raijin/raijin_ken_rows.txt */
const PAL = { K: 0x1b1240, d: 0x33268a, D: 0x6a3fc8, M: 0xa57cff, L: 0xf1e4ff, Y: 0xfff0a8, G: 0xf2c230, g: 0xb8860b, N: 0x24336e, n: 0x3f56a8 };

const RAIJIN_KEN = [
  '..............K.',
  '......Y......KLK',
  '.....Y......KLdK',
  '....YYY....KLMdK',
  '.....Y.....KLDdK',
  '....Y.....KLMDdK',
  '..........KLLdK.',
  '.........KLMDdK.',
  '........KLLDdK..',
  '.....K.KLMDdK...',
  '....KGKLLDdK....',
  '....KGLMdKK.....',
  '...KnNgKK.......',
  '..KNnKK.........',
  '.KnNK...........',
  'KGKK............',
];

/** 風神剣（PR2）: 白〜みずいろの 細い 刃 ＋ 金の 小さな つば ＋ 青緑の 柄。K ふち・L/W 刃の つや・C/c/B 刃・G/g 金・T/t 柄・X/x 柄の かざり */
const PAL_FUJIN = { K: 0x12304a, L: 0xe6f8ff, W: 0xffffff, C: 0xa6e4f7, c: 0x62bde6, B: 0x3a86b8, G: 0xf2c230, g: 0xb8860b, T: 0x2f8f9c, t: 0x1d5a6e, X: 0x2b2b3a, x: 0x8a8aa8 };

const FUJIN_KEN = [
  '..............K.',
  '............KKWK',
  '...........KCWK.',
  '..........KCWcK.',
  '.........KCWcK..',
  '........KCWcK...',
  '.......KCWcK....',
  '......KCWcK.....',
  '..KK.KCWcK......',
  '.KxxKCWcK.......',
  '..KXxWcK........',
  '...KXXxK........',
  '...KTXXK........',
  '..KtTKKXK.......',
  '.KtTK.KXxK......',
  'KGgK...KK.......',
];

/** 虹（PR3・仮の 絵）: 風神剣の 形で 刃を にじ色に。本物の 絵は あとで 差しかえる。R/O/Y/E/B/V = にじの 6 色 */
const PAL_NIJI = { ...PAL_FUJIN, L: 0xfff0f8, W: 0xffffff, C: 0xff8fb0, c: 0xffd35a, B: 0x7a6cf0, K: 0x3a1f5a, T: 0xb04a8a, t: 0x6e2a5c };

export function w7ItemPixels(item: W7ItemId): Rgba[] {
  switch (item) {
    case 'raijin_ken':
      return fromRows(RAIJIN_KEN, PAL);
    case 'fujin_ken':
      return fromRows(FUJIN_KEN, PAL_FUJIN);
    case 'niji':
      return fromRows(FUJIN_KEN, PAL_NIJI);
  }
}
