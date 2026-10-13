import type { Inventory, ItemClass, ItemId, ItemStack } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';

/** ずっと へらない もの（§4.6 (1)） */
const PERMANENT: ReadonlySet<ItemId> = new Set<ItemId>(['lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa', 'tansu']);

/** たいきゅうで へる もの（§4.6 (2) の 表の 道具・防具）。新品の 値の 表と 同じ 名前 */
const DURABLE: ReadonlySet<ItemId> = new Set<ItemId>(Object.keys(W2_SETTING_DEFAULTS.toolDurability) as ItemId[]);

/** たいきゅうの なかま（WEAPON-2 §4.6 (1)）。設定で 値を かえても なかまは かわらない */
export function itemClassOf(item: ItemId): ItemClass {
  if (DURABLE.has(item)) return 'durable';
  if (PERMANENT.has(item)) return 'permanent';
  return 'consumable';
}

/** 新品の たいきゅう（たいきゅうで へる 道具でなければ null）。`table` は 設定 `toolDurability` */
export function maxDurability(item: ItemId, table: Readonly<Partial<Record<ItemId, number>>>): number | null {
  const v = table[item];
  return typeof v === 'number' && v > 0 ? v : null;
}

/** へった 量を もつ 形で 写す（0・なしは 新品 = `wear` を つけない） */
export function copyStack(s: ItemStack): ItemStack {
  return s.wear && s.wear > 0 ? { item: s.item, count: s.count, wear: s.wear } : { item: s.item, count: s.count };
}

/** 保存から 読んだ へった 量（おかしい 値・なし = 0 = 新品）。max が あれば max − 1 まで */
export function readWear(raw: unknown, max: number | null): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0 || max === null) return 0;
  return Math.min(Math.floor(raw), max - 1);
}

/** のこり わずか（`ratio` 以下。切り上げ: 250 の 10% = 25、59 の 10% = 6） */
export function isLow(left: number, max: number, ratio: number): boolean {
  return left <= Math.ceil(max * ratio);
}

/**
 * 持ち物に 1 つぶん 入れる。へった 量つきの 道具は いちばん 手前の 空きマスへ（`Inventory.add` は へった 量を 運べないため）。
 * 入らなかった 数を 返す
 */
export function addStack(inv: Inventory, st: ItemStack): number {
  if (!(st.wear && st.wear > 0) || st.count !== 1) return inv.add(st.item, st.count);
  const slots = inv.slots();
  for (let i = 0; i < inv.size; i++) {
    if (!slots[i]) {
      inv.setSlot(i, st);
      return 0;
    }
  }
  return 1;
}
