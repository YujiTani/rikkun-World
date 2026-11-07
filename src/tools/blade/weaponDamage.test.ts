import { describe, expect, it } from 'vitest';
import type { ArmorSlot, ItemId, ItemStack } from '../../contracts';
import { createW2Settings } from '../../contracts';
import { NINJA_TUNING } from '../../craft/ninjaTuning';
import { SAMURAI_GEAR } from '../../craft/config';
import { tekkoBladeMulOf } from '../../craft/samuraiPower';
import { legendPowerOf } from '../../legend/defs';
import { P2State } from '../../duo/p2State';
import { TOOL_DEFAULTS } from '../config';
import { BLADE_ITEMS } from '../bladeSets';
import { createWeaponDamage } from './weaponDamage';

/**
 * COOP-1 作業 4b（docs/design/COOP-1.md 1.10 §3.5・AC91）の 先行テスト（赤）。侍の 手甲を 着た 2P の 刀の 強さ × `tekkoBladeMul`（1P と 同じ）。
 * 1P の 計算は いま wire/combat.ts に 直書き（`(legendPowerOf(…) ?? toolConfig.weaponDamage[item] ?? 1) * tekkoBladeMulOf(armor, item)`）、
 * 2P の 計算は wire/duoPlay.ts に 別の 式で 直書き（手甲を かけて いない）。**2 つを 1 つの 部品に まとめる**（式を 2P 用に コピーしない）。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/tools/blade/weaponDamage.ts
 *     createWeaponDamage(d: WeaponDamageDeps): (item: ItemId) => number
 *     WeaponDamageDeps = {
 *       settings: Pick<W2Settings, 'legendary'>;                    // w2
 *       base: Readonly<Partial<Record<ItemId, number>>>;            // toolConfig.weaponDamage（ふつうの 刀の 強さの 表）
 *       held: () => ItemStack | null;                               // 手に 持っている 物（虹の 1 本ごとの 強さ `power` を 読む）
 *       armor: { equipped(slot: ArmorSlot): ItemId | null };        // 1P は armor、2P は p2.armor（呼ぶ たびに いまの 着ている 物を 読む）
 *     }
 *     返す 関数 = `(legendPowerOf(settings, item, item === 'niji' ? (held()?.power ?? null) : null) ?? base[item] ?? 1) * tekkoBladeMulOf(armor, item)`
 *   配線: wire/combat.ts（1P）の weaponDamage も、wire/duoPlay.ts の build()（2P）の weaponDamage も これを 呼ぶ
 *     （1P: held = inventory.held・armor = armor／ 2P: held = p2.inventory.held・armor = p2.armor）。1P の 値は かわらない。
 */

const S = createW2Settings();
const base = TOOL_DEFAULTS.weaponDamage;
const wearing = (arms: ItemId | null) => ({ equipped: (slot: ArmorSlot): ItemId | null => (slot === 'arms' ? arms : null) });
const noHeld = (): ItemStack | null => null;

/** 手甲の 倍率を かける 前の 刀の 強さ（表から） */
const plain = (item: ItemId, power: number | null = null): number => legendPowerOf(S, item, item === 'niji' ? power : null) ?? base[item] ?? 1;

describe('AC91 刀の 強さ × 手甲: 1P と 2P で 同じ 部品', () => {
  it('侍の 手甲を 着ると、どの 刀も 手甲なしの 強さ × tekkoBladeMul。手甲なしは 表の 強さ そのまま', () => {
    const naked = createWeaponDamage({ settings: S, base, held: noHeld, armor: wearing(null) });
    const tekko = createWeaponDamage({ settings: S, base, held: noHeld, armor: wearing(SAMURAI_GEAR.arms) });
    expect(NINJA_TUNING.tekkoBladeMul).toBeGreaterThan(1);
    expect(BLADE_ITEMS.size).toBeGreaterThan(0);
    for (const item of BLADE_ITEMS) {
      expect(naked(item), `${item} 手甲なし`).toBe(plain(item));
      expect(tekko(item), `${item} 手甲`).toBeCloseTo(plain(item) * NINJA_TUNING.tekkoBladeMul, 10);
    }
  });

  it('刀でない 物（つるはし・弓・なぎなた）は 手甲を 着ても 1 倍', () => {
    const tekko = createWeaponDamage({ settings: S, base, held: noHeld, armor: wearing(SAMURAI_GEAR.arms) });
    const none = createWeaponDamage({ settings: S, base, held: noHeld, armor: wearing(null) });
    const notBlade = (Object.keys(base) as ItemId[]).filter((i) => !BLADE_ITEMS.has(i));
    expect(notBlade.length).toBeGreaterThan(0);
    for (const item of notBlade) expect(tekko(item), item).toBe(none(item));
  });

  it('1P の 手甲の 式（tekkoBladeMulOf）と 同じ 結果。ほかの 手甲（忍び・てつの こて）は 1 倍', () => {
    for (const arms of [SAMURAI_GEAR.arms, 'ninja_tekko', 'kote', null] as Array<ItemId | null>) {
      const armor = wearing(arms);
      const f = createWeaponDamage({ settings: S, base, held: noHeld, armor });
      for (const item of BLADE_ITEMS) expect(f(item), `${arms} ${item}`).toBeCloseTo(plain(item) * tekkoBladeMulOf(armor, item), 10);
    }
  });

  it('虹の 刀は 手に 持っている 1 本の 強さ（power）× 手甲。持っていなければ まん中の 強さ', () => {
    let held: ItemStack | null = { item: 'niji', count: 1, power: 7 };
    const f = createWeaponDamage({ settings: S, base, held: () => held, armor: wearing(SAMURAI_GEAR.arms) });
    expect(f('niji')).toBeCloseTo(plain('niji', 7) * NINJA_TUNING.tekkoBladeMul, 10);
    held = null;
    expect(f('niji')).toBeCloseTo(plain('niji', null) * NINJA_TUNING.tekkoBladeMul, 10);
  });

  it('呼ぶ たびに 着ている 物を 読む: 着替えると すぐ かわる（作り直さない）', () => {
    let arms: ItemId | null = null;
    const live = createWeaponDamage({ settings: S, base, held: noHeld, armor: { equipped: (slot: ArmorSlot) => (slot === 'arms' ? arms : null) } });
    const katana = [...BLADE_ITEMS][0]!;
    const before = live(katana);
    arms = SAMURAI_GEAR.arms;
    expect(live(katana)).toBeCloseTo(before * NINJA_TUNING.tekkoBladeMul, 10);
    arms = null;
    expect(live(katana)).toBe(before);
  });

  it('2P の 手甲は 2P の そうび（p2.armor）だけ: 1P が 手甲を 着ていても 2P は 1 倍、2P が 着ると 2P だけ 1.5 倍', () => {
    const p2 = new P2State();
    const arms1: { v: ItemId | null } = { v: SAMURAI_GEAR.arms }; // 1P は 着ている
    const one = createWeaponDamage({ settings: S, base, held: noHeld, armor: { equipped: (s) => (s === 'arms' ? arms1.v : null) } });
    const two = createWeaponDamage({ settings: S, base, held: () => p2.inventory.held(), armor: p2.armor });
    const katana = [...BLADE_ITEMS][0]!;
    expect(two(katana), '2P は はだか').toBe(plain(katana));
    expect(one(katana)).toBeCloseTo(plain(katana) * NINJA_TUNING.tekkoBladeMul, 10);
    p2.armor.set(null, null, SAMURAI_GEAR.arms);
    expect(two(katana)).toBeCloseTo(plain(katana) * NINJA_TUNING.tekkoBladeMul, 10);
    arms1.v = null;
    expect(one(katana)).toBe(plain(katana));
    expect(two(katana), '1P が ぬいでも 2P は そのまま').toBeCloseTo(plain(katana) * NINJA_TUNING.tekkoBladeMul, 10);
  });
});
