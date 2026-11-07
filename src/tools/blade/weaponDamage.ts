import type { ArmorSlot, ItemId, ItemStack, W2Settings } from '../../contracts';
import { tekkoBladeMulOf } from '../../craft/samuraiPower';
import { legendPowerOf } from '../../legend/defs';

/** 刀の 強さを 出す 部品の 材料（1P・2P・がしゃどくろの 当たりで 同じ 部品を 使う。COOP-1 4b） */
export interface WeaponDamageDeps {
  /** w2（レジェンダリーの 強さの 表） */
  settings: Pick<W2Settings, 'legendary'>;
  /** ふつうの 刀の 強さの 表（toolConfig.weaponDamage） */
  base: Readonly<Partial<Record<ItemId, number>>>;
  /** 手に 持っている 物（虹の 1 本ごとの 強さ `power` を 読む） */
  held: () => ItemStack | null;
  /** 1P は armor、2P は p2.armor（呼ぶ たびに いまの 着ている 物を 読む） */
  armor: { equipped(slot: ArmorSlot): ItemId | null };
}

/**
 * 刀の 強さ = (レジェンダリーの 強さ ?? ふつうの 表 ?? 1) × 侍の 手甲の 倍率（SAMURAI-1 §4.5。わざの 倍率の 前に かける）。
 * 虹の 刀は 手に 持っている 1 本の 強さ。1P の 値は 式を まとめる 前と 同じ。
 */
export function createWeaponDamage(d: WeaponDamageDeps): (item: ItemId) => number {
  return (item) => (legendPowerOf(d.settings, item, item === 'niji' ? (d.held()?.power ?? null) : null) ?? d.base[item] ?? 1) * tekkoBladeMulOf(d.armor, item);
}
