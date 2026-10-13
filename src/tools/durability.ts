import type { ItemClass, ItemId } from '../contracts';

/**
 * たいきゅうの なかま・新品の 値（WEAPON-2 §4.6 (1)(2)）。
 * 仮のもの: 担当 F が 本物に 直す（なかまの 表・`toolDurability` を 読む）。今は 全部 consumable・値 なし。
 */
export function itemClassOf(_item: ItemId): ItemClass {
  return 'consumable';
}

/** 新品の たいきゅう（たいきゅうで へる 道具でなければ null）。`table` は 設定 `toolDurability` */
export function maxDurability(item: ItemId, table: Readonly<Partial<Record<ItemId, number>>>): number | null {
  const v = table[item];
  return typeof v === 'number' && v > 0 ? v : null;
}
