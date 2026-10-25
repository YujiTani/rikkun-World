import type { ItemId, Rarity } from '../contracts';
import { registryRarity, withRegistry } from '../content/items/registry';
import { DIG_DEFAULTS } from '../dig/config';
import { ITEM_TYPES } from '../inventory/items';
import { RARITY_ORDER, rarityIndex } from './rarityTable';

export { RARITY_COLOR, RARITY_ORDER, RARITY_TIERS, defaultDropMax, isRarity, rarityIndex, rarityTier, type RarityTier } from './rarityTable';

/**
 * アイテムのめずらしさ（光の柱の色がこれできまる）。
 * ブロックは ほる設定（`src/dig/config.ts` の rarity）と同じ値。
 * アイテムを足すときは、ここに めずらしさを必ず書く（登録表 content/items/ に うつした シリーズは そちらに 書く）。
 */
const OLD_ITEM_ONLY_RARITY: Record<string, Rarity> = {
  // ようかいだま・ざいりょう 6・てつの かたまり・小物 6 は 登録表（content/items/materials.ts・misc.ts）にある
  // M4（docs/design/M4-craft.md §4.4）。かまど・かわら・レンガは ほる設定（DIG_DEFAULTS.rarity）にある
  torch: 'common',
  // M7・M7-2・BUCKET-1（たね・やさい・くわ・じょうろ・スプリンクラー・バケツ）は 登録表（content/items/farm.ts）にある
  // LIVE-1〜3（たまご・むし・むしとりあみ・こたつ・とりごや・きんの たまご・もも にく 2 つ）は 登録表（content/items/live.ts）にある
};
// 登録表に うつした シリーズ（忍者・侍・金 …）の めずらしさは content/items/ から
const ITEM_ONLY_RARITY: Record<string, Rarity> = withRegistry('ITEM_ONLY_RARITY', OLD_ITEM_ONLY_RARITY, registryRarity());

/** 今の当てはめ（設定 itemRarity。ゲームに 1 つ。全アイテム → Rarity） */
function initialItemRarity(): Record<string, Rarity> {
  const out: Record<string, Rarity> = {};
  for (const t of ITEM_TYPES) out[t.id] = ITEM_ONLY_RARITY[t.id] ?? (DIG_DEFAULTS.rarity as Record<string, Rarity>)[t.id] ?? 'common';
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
  return current[item] ?? ITEM_ONLY_RARITY[item] ?? (DIG_DEFAULTS.rarity as Record<string, Rarity>)[item] ?? 'common';
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
  return item in ITEM_ONLY_RARITY || item in DIG_DEFAULTS.rarity;
}
