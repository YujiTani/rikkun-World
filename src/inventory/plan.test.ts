import { describe, expect, it } from 'vitest';
import { itemDef } from '../content/items/registry';
import { Kura } from '../house/kura';
import { copyStack, readPlan } from '../tools/durability';
import { buildTooltip } from '../ui/tooltipModel';
import { InventoryImpl } from './Inventory';
import { planNameOf, setPlanNameSource } from './planName';

/** HOUSE-1B: せっけいず（sekkeizu）の 1 こずつの 中身 ＝ 番号（plan）。持ち物・保存・ツールチップ・くらの あずけ（AC8b・AC15・AC32b） */

describe('plan（せっけいずの 番号）', () => {
  it('readPlan: せっけいずの 正の 整数だけ。ほかの アイテム・おかしい 値は 0', () => {
    expect(readPlan(3, 'sekkeizu')).toBe(3);
    for (const bad of [0, -1, 1.5, '2', null, undefined, Number.NaN]) expect(readPlan(bad, 'sekkeizu'), String(bad)).toBe(0);
    expect(readPlan(3, 'log')).toBe(0);
  });

  it('add の opts.plan が マスに 入る。copyStack・serialize / deserialize でも のこる。ほかの アイテムには つかない', () => {
    const bag = new InventoryImpl();
    expect(bag.add('sekkeizu', 1, { plan: 7 })).toBe(0);
    expect(bag.add('log', 1, { plan: 7 })).toBe(0);
    const slots = bag.slots();
    const i = slots.findIndex((s) => s?.item === 'sekkeizu');
    expect(slots[i]).toMatchObject({ item: 'sekkeizu', count: 1, plan: 7 });
    expect(slots.find((s) => s?.item === 'log')?.plan).toBeUndefined();
    expect(copyStack(slots[i]!).plan).toBe(7);
    const copy = new InventoryImpl();
    copy.deserialize(JSON.parse(JSON.stringify(bag.serialize())));
    expect(copy.slots()[i]).toMatchObject({ item: 'sekkeizu', plan: 7 });
  });

  it('同じ 番号でも 別の 番号でも 1 マスに 1 こ（重ならない）', () => {
    const bag = new InventoryImpl();
    bag.add('sekkeizu', 1, { plan: 1 });
    bag.add('sekkeizu', 1, { plan: 1 });
    expect(bag.slots().filter((s) => s?.item === 'sekkeizu')).toHaveLength(2);
    expect(itemDef('sekkeizu')?.maxStack).toBe(1);
  });

  it('ツールチップの 名前 ＝ <前><後ろ>の せっけいず（番号から 引く）。引けない ときは 登録表の 名前', () => {
    const d = { nameOf: (i: string) => itemDef(i as 'sekkeizu')?.name ?? i, rarityOf: () => 'common', placeable: () => false, recipes: () => [] } as unknown as Parameters<typeof buildTooltip>[1];
    setPlanNameSource((n) => (n === 2 ? 'ひみつのいえの せっけいず' : null));
    expect(planNameOf({ item: 'sekkeizu', count: 1, plan: 2 })).toBe('ひみつのいえの せっけいず');
    expect(planNameOf({ item: 'sekkeizu', count: 1, plan: 9 })).toBeNull();
    expect(planNameOf({ item: 'sekkeizu', count: 1 })).toBeNull();
    expect(buildTooltip('sekkeizu', d, { item: 'sekkeizu', count: 1, plan: 2 }).name).toBe('ひみつのいえの せっけいず');
    expect(buildTooltip('sekkeizu', d, { item: 'sekkeizu', count: 1, plan: 9 }).name).toBe(itemDef('sekkeizu')?.name);
    setPlanNameSource(() => null);
  });

  it('AC8b せっけいず・ふでは 1 マスに 1 こ なので くらに あずけられない（0 こ 動く）', () => {
    const bag = new InventoryImpl();
    bag.add('sekkeizu', 1, { plan: 1 });
    bag.add('fude', 1);
    const kura = new Kura();
    expect(kura.deposit(bag, 'sekkeizu', 1)).toBe(0);
    expect(kura.deposit(bag, 'fude', 1)).toBe(0);
    expect(bag.count('sekkeizu')).toBe(1);
    expect(bag.count('fude')).toBe(1);
  });
});
