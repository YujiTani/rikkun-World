import type { ItemId, Rarity } from '../contracts';
import { ITEM_DEFS, itemDef } from '../content/items/registry';
import type { ItemDefId } from '../content/items/types';
import { DIG_DEFAULTS } from '../dig/config';
import { ITEM_TYPES } from '../inventory/items';
import { RARITY_ORDER, rarityIndex } from './rarityTable';

export { RARITY_COLOR, RARITY_ORDER, RARITY_TIERS, defaultDropMax, isRarity, rarityIndex, rarityTier, type RarityTier } from './rarityTable';

/**
 * アイテムのめずらしさ（光の柱の色がこれできまる）。
 * 値は ぜんぶ 登録表（content/items/）の `rarity`（ブロックの アイテムは ほる設定 `src/dig/config.ts` の rarity と 同じ値）。
 * アイテムを足すときは、登録表の ItemDef に めずらしさを 必ず書く（書き忘れは 型エラー）。
 */

/** 今の当てはめ（設定 itemRarity。ゲームに 1 つ。全アイテム → Rarity） */
function initialItemRarity(): Record<string, Rarity> {
  const out: Record<string, Rarity> = {};
  for (const t of ITEM_TYPES) out[t.id] = ITEM_DEFS[t.id as ItemDefId].rarity; // ITEM_TYPES は ITEM_DEFS の 全 id（blocks.test.ts が 確かめる）
  return out;
}
const current: Record<string, Rarity> = initialItemRarity();

/** `createSettingsHook` にわたす設定の入れ物（名前 itemRarity） */
export const ITEM_RARITY_SETTINGS: { itemRarity: Record<string, Rarity> } = { itemRarity: current };

/** 設定 itemRarity を初期値にもどす（テスト用） */
export function resetItemRarity(): void {
  Object.assign(current, initialItemRarity());
}

export function itemRarity(item: ItemId): Rarity {
  // current は 全アイテム（ITEM_TYPES）の 分。アイテムに ならない ブロック（みず・そこいし …）は ほる設定、
  // セーブや 外から 来た 知らない id は 'common'（ここは 型では 守れないので 残す）
  return current[item] ?? (DIG_DEFAULTS.rarity as Record<string, Rarity>)[item] ?? 'common';
}

/** item が tier 以上にめずらしいか（#69・#70 用） */
export function rarityAtLeast(item: ItemId, tier: Rarity): boolean {
  return rarityIndex(itemRarity(item)) >= rarityIndex(tier);
}

/** なかでいちばんめずらしいもの */
export function topRarity(items: readonly ItemId[]): Rarity {
  let best = 0;
  for (const it of items) best = Math.max(best, rarityIndex(itemRarity(it)));
  return RARITY_ORDER[best]!;
}

export function isKnownItemRarity(item: ItemId): boolean {
  return itemDef(item) !== undefined || item in DIG_DEFAULTS.rarity;
}
