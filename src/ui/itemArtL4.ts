import type { ItemId } from '../contracts';
import { LEGEND4_IDS, type Legend4Id } from '../content/items/ids';
import type { Rgba } from '../world/blocks/textures';
import { fromRows } from './itemArtM4';

/**
 * LEGEND-4: 新しい レジェンダリー武器の アイテムの 絵（16x16・itemArtW7.ts と 同じ 作り方）。3D の 落ちて いる 袋・2D の 古い 絵の 口が 使う
 * （もちもの・ホットバーなどの 2D は 32 マスの アイコン art/icons32/ が 先）。K = ふち。もとは 共有フォルダ legendary4/art/itemArtL4.ts。PR ごとに 1 つずつ 足す。
 */
export const L4_ITEMS = LEGEND4_IDS;
export type L4ItemId = Legend4Id;

export function isL4Item(item: ItemId): item is L4ItemId {
  return (L4_ITEMS as readonly string[]).includes(item);
}

/** 黒龍: 細い 黒こんの 弓が ななめに のびて、水色の すじが 光る。K ふち・d/B 弓・C 水色の すじ・L/s/W つや */
const PAL_KOKURYU = { K: 0x0a1020, d: 0x1c2238, B: 0x2c3a5c, C: 0x7ae8ff, L: 0xc8e4f4, s: 0xe6f0f8, W: 0xffffff };
const KOKURYU = [
  '..........KKKLLL',
  '........KKBBLLdd',
  '......KKBBdCCdsK',
  '....KKBBdCCKKsK.',
  '...KWBBCCKKKsK..',
  '...KBBCCK.KsK...',
  '..KBBCKK.KsK....',
  '..KBCCK.KsK.....',
  '.KBdCK.KsK......',
  '.KBCK.KsK.......',
  'KBdCKKsK........',
  'KBCKKsK.........',
  'KBCKsK..........',
  'LLdsK...........',
  'LdsK............',
  'LdK.............',
];

/** 八咫烏: くろむらさきの 弓が ななめに のびて、金の かざりと むらさきの 宝石が 光る。K ふち・d/B 弓・G 金・V 宝石・L/s つや */
const PAL_YATAGARASU = { K: 0x120e22, d: 0x241a44, B: 0x3c2c70, G: 0xe8b82a, V: 0xa85cf0, L: 0xf0e6ff, s: 0xffe88a, W: 0xffffff };
const YATAGARASU = [
  '..........KKKGGG',
  '........KKBBGGdd',
  '......KKBBdGGdsK',
  '....KKBBdGGKKsK.',
  '...KWBBVVKKKsK..',
  '...KBBVLVK.KsK..',
  '..KBBGVVK.KsK...',
  '..KBGGK.KsK.....',
  '.KBdGK.KsK......',
  '.KBGK.KsK.......',
  'KBdGKKsK........',
  'KBGKKsK.........',
  'KBGKsK..........',
  'GGdsK...........',
  'GdsK............',
  'GdK.............',
];

/** 天使の弓: 白い つばさの ある 弓。32 マスの 絵（art/icons32/tenshi_yumi.png）を 16 点に 縮めた 物。K ふち・B/G/W 白・g/s 影・L 金・C/d つる */
const PAL_TENSHI = { K: 0x2a1a24, B: 0xffffff, C: 0xfaecaa, L: 0xf8d458, s: 0x7a88b8, W: 0xf4f8ff, d: 0xfffbe0, G: 0xdce8f8, g: 0xb4c4e4, M: 0xfff8e6 };
const TENSHI = [
  '...........KdK..',
  '..LL.LL..sBdKK..',
  '.KKL.LL.sBGK.C..',
  '.KKK....BGK..C..',
  '.sKBK..sBK...C..',
  'sKKBBKKBWK...C..',
  '.KKBBBggGK...C..',
  '..KKBBMMK....C..',
  '..KKWBCKK....C..',
  '...KKBKgWK...C..',
  '..MBBWKKBK...C..',
  '..sKKK..BWK..C..',
  '..K.sK..KBK..C..',
  '.........KBKKC..',
  '..........KKdK..',
  '................',
];

/** 大地のハンマー: 青みの ある 鉄の 頭と こはく色の 柄。K ふち・d/S/L/W 鉄（くらい → つや）・h/H 柄・G こはく色の 輪 */
const PAL_DAICHI = { K: 0x262a38, d: 0x4a5266, S: 0x7c879a, L: 0xb4bfcc, W: 0xeef2f6, h: 0x7a4a18, H: 0xc88a28, G: 0xf0c050 };
const DAICHI = [
  '................',
  '...KKKKKKKKKK...',
  '..KLWWWLLSSSdK..',
  '..KLWLLLSSSddK..',
  '..KLLLSSSSdddK..',
  '..KSSSSSSddddK..',
  '...KKKKKGKKKK...',
  '........KhK.....',
  '.......KhHK.....',
  '......KhHK......',
  '.....KhHK.......',
  '....KhHK........',
  '...KhHK.........',
  '..KGhK..........',
  '..KGGK..........',
  '...KK...........',
];

/** ノームの 斧: 銅色の 大きな 両刃・まん中に 菱形の かざり・黒い 柄 */
const PAL_GNOME_AXE = { K: 0x2a1608, d: 0x7a3c12, b: 0xc4772a, L: 0xf0b25a, r: 0x8c4a1c, G: 0xffe08a, N: 0x24202c, n: 0x5a5470, g: 0xb8860b };
const GNOME_AXE = [
  '.......KLLK.....',
  '......KLbLK.....',
  '.....KbbbLLK....',
  '....KbbbbbLK....',
  '...KbbbbbrrKK...',
  '....KdddbrGrLKKK',
  '.....KKKdrGrLLLL',
  '......KnNNrrbbbL',
  '.....KnNNKdbbbbL',
  '....KnNNKKdbbbLK',
  '...KnNNK..KdbbK.',
  '..KnNNK...KdbK..',
  'KKnNNK....KbK...',
  'NnNNK......K....',
  'gNNK............',
  'GgK.............',
];

/** id ごとの 絵（`Record` なので 足し忘れは 型エラー。PR ごとに 1 つずつ 足す） */
const ART = {
  kokuryu: { rows: KOKURYU, pal: PAL_KOKURYU },
  yatagarasu: { rows: YATAGARASU, pal: PAL_YATAGARASU },
  tenshi_yumi: { rows: TENSHI, pal: PAL_TENSHI },
  gnome_axe: { rows: GNOME_AXE, pal: PAL_GNOME_AXE },
  daichi_hammer: { rows: DAICHI, pal: PAL_DAICHI },
} as const satisfies Record<L4ItemId, { rows: readonly string[]; pal: Readonly<Record<string, number>> }>;

export function l4ItemPixels(item: L4ItemId): Rgba[] {
  return fromRows(ART[item].rows, ART[item].pal);
}
