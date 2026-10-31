import type { Inventory, ItemClass, ItemId, ItemStack } from '../contracts';
import { M7_SETTING_DEFAULTS, W2_SETTING_DEFAULTS } from '../contracts';
import { HOUSE_PLAN_IDS } from '../content/items/ids';
import { registryPermanent } from '../content/items/registry';
import { BUCKET_TAKE } from '../world/blocks/water';

/** ずっと へらない もの（§4.6 (1)）。登録表（content/items/）で wear: 'permanent' の 物 */
const PERMANENT: ReadonlySet<ItemId> = new Set<ItemId>(registryPermanent());

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

/** じょうろ の 入る 回数（初期値。持ち物・保存で 読むときの そろえ方に 使う）。じょうろ でなければ null */
let capacitySource: () => Readonly<Partial<Record<ItemId, number>>> = () => M7_SETTING_DEFAULTS.farmCanCapacity;
/** 入る 回数 を 設定（live）から 読む よう に つなぐ（つなぎ込みが 呼ぶ） */
export function setCanCapacitySource(fn: () => Readonly<Partial<Record<ItemId, number>>>): void {
  capacitySource = fn;
}

export function canCapacity(item: ItemId): number | null {
  const v = capacitySource()[item];
  return typeof v === 'number' && v > 0 ? v : null;
}

/** 保存から 読んだ みず の 量（M7-2 §4.6）。整数に して 0〜入る回数 に おさめる。おかしい 値・じょうろ でない = 0 */
export function readWater(raw: unknown, item: ItemId): number {
  // WATER-1 §4.4: みずの バケツの 量(1〜8)。欄 なし・おかしい 値は 0 = 書かない(読む 側が 8 と みなす)
  if (item === 'water_bucket') return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(BUCKET_TAKE, Math.floor(raw))) : 0;
  const cap = canCapacity(item);
  if (cap === null || typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(cap, Math.floor(raw)));
}

/** 強さが 1 本ごとに 決まる 武器（虹）の 範囲 [最小, 最大]。それ以外は null */
export function powerRange(item: ItemId): [number, number] | null {
  const d = W2_SETTING_DEFAULTS.legendary.find((x) => x.item === item);
  return d && Array.isArray(d.power) ? [d.power[0], d.power[1]] : null;
}

/** 保存から 読んだ 強さ（WEAPON-9）。虹の 範囲に おさめた 整数。虹でない = 0。おかしい 値・なし = まん中（7） */
export function readPower(raw: unknown, item: ItemId): number {
  const r = powerRange(item);
  if (!r) return 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return Math.round((r[0] + r[1]) / 2);
  return Math.max(r[0], Math.min(r[1], Math.round(raw)));
}

/** せっけいずの 番号（HOUSE-1B）。せっけいず だけが 持つ。1 以上の 整数。おかしい 値・せっけいず でない = 0（番号なし） */
export function readPlan(raw: unknown, item: ItemId): number {
  if (!(HOUSE_PLAN_IDS as readonly string[]).includes(item)) return 0;
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 ? raw : 0;
}

/** へった 量・みず の 量を もつ 形で 写す（0・なしは 新品／からっぽ = つけない） */
export function copyStack(s: ItemStack): ItemStack {
  const out: ItemStack = { item: s.item, count: s.count };
  if (s.wear && s.wear > 0) out.wear = s.wear;
  if (s.water && s.water > 0) out.water = s.water;
  if (s.power && s.power > 0) out.power = s.power;
  if (s.plan && s.plan > 0) out.plan = s.plan;
  return out;
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
 * 持ち物に 1 つぶん 入れる。へった 量・みず つきの 道具は いちばん 手前の 空きマスへ（`Inventory.add` は へった 量を 運べないため）。
 * 入らなかった 数を 返す
 */
export function addStack(inv: Inventory, st: ItemStack): number {
  if (!((st.wear && st.wear > 0) || (st.water && st.water > 0) || (st.power && st.power > 0) || (st.plan && st.plan > 0)) || st.count !== 1) return inv.add(st.item, st.count);
  const slots = inv.slots();
  for (let i = 0; i < inv.size; i++) {
    if (!slots[i]) {
      inv.setSlot(i, st);
      return 0;
    }
  }
  return 1;
}
