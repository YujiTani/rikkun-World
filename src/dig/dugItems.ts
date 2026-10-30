import type { BlockId, ItemId } from '../contracts';
import { ITEM_DEFS } from '../content/items/registry';

/**
 * ほると 別の アイテムに なる ブロック（持てない ブロック。MINE-1B）。ブロック → アイテム。
 * 元は アイテムの `dugFrom`（ねんど `clay`・すいしょう `crystal`・ダイヤ `diamond`。登録表の 1 か所）。ここは そこから 作るだけ。
 */
export const DUG_ITEM: ReadonlyMap<BlockId, ItemId> = new Map(
  (Object.entries(ITEM_DEFS) as Array<[ItemId, (typeof ITEM_DEFS)[keyof typeof ITEM_DEFS]]>).flatMap(([item, d]) => (d.dugFrom ? [[d.dugFrom, item] as const] : [])),
);
