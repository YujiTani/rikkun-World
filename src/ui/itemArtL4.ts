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

/** id ごとの 絵（`Record` なので 足し忘れは 型エラー。PR ごとに 1 つずつ 足す） */
const ART = {
  kokuryu: { rows: KOKURYU, pal: PAL_KOKURYU },
  yatagarasu: { rows: YATAGARASU, pal: PAL_YATAGARASU },
} as const satisfies Record<L4ItemId, { rows: readonly string[]; pal: Readonly<Record<string, number>> }>;

export function l4ItemPixels(item: L4ItemId): Rgba[] {
  return fromRows(ART[item].rows, ART[item].pal);
}
