import type { BlockId, ItemId } from '../contracts';
import { GADGET_ID } from '../content/items/gadgetTuning';
import { ITEM_DEFS } from '../content/items/registry';
import { isFutonId } from '../world/blocks/futon';
import { firstKindOfBlock, kindBlocks, kindItem, partOfLook } from '../house/recipes/kinds';
import { isLookBlock } from '../world/blocks/houseLookBlocks';
import { houseDropOf } from '../world/blocks/houseBlocks';
import { isKotatsuBlock } from '../world/blocks/kotatsu';
import { FARM_BREAK_DROP } from './config';

/**
 * ほると 別の アイテムに なる ブロック（持てない ブロック。MINE-1B）。ブロック → アイテム。
 * 元は アイテムの `dugFrom`（ねんど `clay`・すいしょう `crystal`・ダイヤ `diamond`。登録表の 1 か所）。ここは そこから 作るだけ。
 */
export const DUG_ITEM: ReadonlyMap<BlockId, ItemId> = new Map(
  (Object.entries(ITEM_DEFS) as Array<[ItemId, (typeof ITEM_DEFS)[keyof typeof ITEM_DEFS]]>).flatMap(([item, d]) => (d.dugFrom ? [[d.dugFrom, item] as const] : [])),
);

/**
 * ほった ブロックの「もとの ブロック」（ドロップの かたさ・めずらしさ・数を きめる 元）。家の もの〔向き・マス・戸の 半分ちがい〕は 元の 1 つ、
 * こたつ 4 マスは nukunuku、ふとん 2 マスは ふとん、ほかは その id。
 */
export function dropBlockOf(id: BlockId): BlockId {
  return houseDropOf(id) ?? (isKotatsuBlock(id) ? 'nukunuku' : isFutonId(id) ? GADGET_ID.futon : id);
}

/** ほると 手に 入る アイテム。ほる 側〔BlockBreaker〕と 窓口 `house.blockAt` が 同じ 答えを 使う（はたけ・たねの 決まった 物 → 持てない ブロック → もとの id） */
export function dugItemOf(id: BlockId): ItemId {
  // HOUSE-2B: 家の しゅるいの ブロックを 記録なしで ほる（手で 置いた・記録が きえた）: その ブロックを 使う いちばん はじめの しゅるい（むら）の アイテム。かべ なしの 柱は き
  if (isLookBlock(id)) {
    const k = firstKindOfBlock(id);
    return (k ? kindItem(k.part, k.kind) : null) ?? 'log';
  }
  const base = dropBlockOf(id);
  return FARM_BREAK_DROP[id]?.item ?? DUG_ITEM.get(base) ?? base;
}

/** 場所を 見て ほった アイテムを 引く 家の 記録（HouseBook）の 口 */
export interface LookAt {
  lookAt(x: number, y: number, z: number): string | null;
}

/**
 * 場所で 引く ほった アイテム（HOUSE-2B）。家の 記録に その 場所の しゅるい（案こみ）が あり、ブロックが その しゅるいの ブロックなら その しゅるいの アイテム 1 こ。
 * 記録が ない・ブロックが ちがう（手で 置いた）なら 今までの dugItemOf（案の 記録は 2C）
 */
export function dugItemAt(book: LookAt | null | undefined, id: BlockId, x: number, y: number, z: number): ItemId {
  const kind = book?.lookAt(x, y, z) ?? null;
  const part = kind === null ? null : partOfLook(kind);
  if (kind !== null && part !== null && kindBlocks(part, kind).includes(id)) {
    const item = kindItem(part, kind);
    if (item !== null) return item;
  }
  return dugItemOf(id);
}
