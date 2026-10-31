import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { Kura } from '../kura';
import { emptyState } from './model';
import type { SheetPort } from './controller';
import { createSheetPort } from './sheet';

/** HOUSE-1B AC15・AC44b・AC45: せっけいずを 作る（かみ 1・ふでの たいきゅう 1）と ④ かみ ⑤ ふで ⑥ 持ち物の しらべ */

const fresh = () => {
  const bag = new InventoryImpl();
  const kura = new Kura();
  const registered: number[] = [];
  const gave: ItemId[] = [];
  let next = 1;
  const port: SheetPort = createSheetPort({ bag, kura, register: () => registered[registered.push(next++) - 1]!, gave: (i) => gave.push(i) });
  return { bag, kura, port, registered, gave };
};
const FUDE_MAX = 5; // ふでの たいきゅう（content/items/tools.ts）

describe('④ かみ ⑤ ふで ⑥ 持ち物（problem）', () => {
  it('かみも ふでも 無い → かみが 先（④）。かみ だけ → ふで（⑤）。そろう → 通る', () => {
    const { bag, port } = fresh();
    expect(port.problem()).toBe('paper');
    bag.add('fude', 1);
    expect(port.problem(), 'かみ ０').toBe('paper');
    bag.remove('fude', 1);
    bag.add('paper', 1);
    expect(port.problem(), 'ふで ０').toBe('fude');
    bag.add('fude', 1);
    expect(port.problem()).toBeNull();
  });

  it('かみは くらに あっても よい（持ち物に 無いとき くらから）。ふでは 持ち物の どこかに 必要', () => {
    const { bag, kura, port } = fresh();
    kura.restore({ paper: 3 });
    bag.add('fude', 1);
    expect(port.problem()).toBeNull();
  });

  it('⑥ 持ち物が いっぱい: 空きが 無い → full。さいごの かみ 1 まい・こわれる ふでが あれば その マスが あくので 通る', () => {
    const { bag, port } = fresh();
    for (let i = 0; i < bag.size; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    bag.setSlot(0, { item: 'paper', count: 2 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: 2 });
    expect(port.problem(), 'かみ 2 まい・ふで たいきゅう 3').toBe('full');
    bag.setSlot(0, { item: 'paper', count: 1 });
    expect(port.problem(), 'さいごの かみ').toBeNull();
    bag.setSlot(0, { item: 'paper', count: 2 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: FUDE_MAX - 1 });
    expect(port.problem(), 'こわれる ふで').toBeNull();
  });

  it('かみが くらに ある ときは 持ち物の マスは あかない（持ち物が いっぱいなら full）', () => {
    const { bag, kura, port } = fresh();
    kura.restore({ paper: 5 });
    for (let i = 0; i < bag.size; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    bag.setSlot(0, { item: 'fude', count: 1, wear: 1 });
    expect(port.problem()).toBe('full');
  });
});

describe('AC15 作る（make）', () => {
  it('かみ 1 まい（持ち物から）・ふでの たいきゅう 1・せっけいず 1 こ（番号つき）。くらの 材料は へらない', () => {
    const { bag, kura, port, gave } = fresh();
    bag.add('paper', 3);
    bag.add('fude', 1);
    kura.restore({ paper: 9, log: 9 });
    port.make(emptyState());
    expect(bag.count('paper')).toBe(2);
    expect(kura.count('paper'), 'くらの かみは そのまま').toBe(9);
    expect(kura.count('log')).toBe(9);
    expect(bag.durability(bag.slots().findIndex((s) => s?.item === 'fude'))?.left).toBe(FUDE_MAX - 1);
    const sheet = bag.slots().find((s) => s?.item === 'sekkeizu');
    expect(sheet).toMatchObject({ item: 'sekkeizu', count: 1, plan: 1 });
    expect(gave).toEqual(['sekkeizu']);
  });

  it('持ち物に かみが 無い とき くらから 1 まい', () => {
    const { bag, kura, port } = fresh();
    bag.add('fude', 1);
    kura.restore({ paper: 2 });
    port.make(emptyState());
    expect(kura.count('paper')).toBe(1);
  });

  it('番号は 1, 2, 3 … と ふえ、せっけいずは 1 マスに 1 こ（重ならない）', () => {
    const { bag, port, registered } = fresh();
    bag.add('paper', 9);
    bag.add('fude', 2);
    for (let i = 0; i < 3; i++) port.make(emptyState());
    expect(registered).toEqual([1, 2, 3]);
    const sheets = bag.slots().filter((s) => s?.item === 'sekkeizu');
    expect(sheets.map((s) => [s!.count, s!.plan])).toEqual([[1, 1], [1, 2], [1, 3]]);
  });
});

describe('AC45 ふで', () => {
  it('たいきゅう N の ふで 1 本で せっけいずを N まい 作れて、N まい目で ふでは 消える。N＋1 まい目は ふでが ない', () => {
    const { bag, port } = fresh();
    bag.add('paper', 20);
    bag.add('fude', 1);
    for (let i = 1; i <= FUDE_MAX; i++) {
      expect(port.problem(), `${i} まい目`).toBeNull();
      port.make(emptyState());
    }
    expect(bag.count('fude'), 'N まい目で ふでは 消える').toBe(0);
    expect(bag.count('sekkeizu')).toBe(FUDE_MAX);
    expect(port.problem(), 'N＋1 まい目').toBe('fude');
  });

  it('2 本 ある ときは へって いる ほうから へる（同じ へり方なら 前の マス）', () => {
    const { bag, port } = fresh();
    bag.add('paper', 4);
    bag.setSlot(0, { item: 'fude', count: 1, wear: 1 });
    bag.setSlot(1, { item: 'fude', count: 1, wear: 3 }); // たいきゅう 5−3 ＝ 2 の ほうが へって いる
    port.make(emptyState());
    expect(bag.durability(0)?.left).toBe(FUDE_MAX - 1);
    expect(bag.durability(1)?.left).toBe(FUDE_MAX - 3 - 1);
  });
});
