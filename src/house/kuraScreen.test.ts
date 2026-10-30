import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { KURA_MAX, Kura } from './kura';
import { KuraScreen } from './kuraScreen';

/** HOUSE-1A: くらの 画面の 中身（マスを えらぶ → 数 → あずける・とりだす）。docs/design/HOUSE-1.md §2.4 の 4・5 */

function setup(items: Record<string, number> = { log: 20 }) {
  const bag = new InventoryImpl();
  for (const [item, n] of Object.entries(items)) bag.add(item as ItemId, n);
  const kura = new Kura();
  const screen = new KuraScreen({
    slots: () => bag.slots(),
    bagCount: (i) => bag.count(i),
    entries: () => kura.entries(),
    kuraCount: (i) => kura.count(i),
    canStack: (i) => kura.canHold(i),
    deposit: (i, n) => kura.deposit(bag, i, n),
    withdraw: (i, n) => kura.withdraw(bag, i, n),
  });
  return { bag, kura, screen };
}

describe('マスの 並び', () => {
  it('左は 持ち物の マス 36 こ（空きも 出す）、右は くらに ある 種類だけ', () => {
    const { screen, kura, bag } = setup({ log: 20, dirt: 3 });
    const v = screen.view();
    expect(v.bag).toHaveLength(36);
    expect(v.bag.filter((c) => c.item !== null).map((c) => [c.item, c.count])).toEqual([['log', 20], ['dirt', 3]]);
    expect(v.bag[2]).toEqual({ item: null, count: 0, selected: false, locked: false });
    expect(v.store).toEqual([]);
    kura.deposit(bag, 'log', 5);
    expect(screen.view().store).toEqual([{ item: 'log', count: 5, selected: false, locked: false }]);
  });

  it('重ならない 物（どうぐ・ぶき）の マスは locked。えらべない', () => {
    const { screen } = setup({ log: 20, mizumori: 1 });
    const v = screen.view();
    const tool = v.bag.findIndex((c) => c.item === 'mizumori');
    expect(v.bag[tool]!.locked).toBe(true);
    expect(v.bag.find((c) => c.item === 'log')!.locked).toBe(false);
    expect(screen.selectBag(tool)).toBe(false);
    expect(screen.view().selected).toBeNull();
  });
});

describe('あずける', () => {
  it('持ち物の マスを えらぶ → はじめの 数は 1 → ＋10 → −1 → あずける: 10 こ うごく', () => {
    const { screen, bag, kura } = setup({ log: 20 });
    expect(screen.selectBag(0)).toBe(true);
    let v = screen.view();
    expect(v).toMatchObject({ selected: { side: 'bag', item: 'log' }, amount: 1, max: 20, action: 'deposit' });
    expect(v.bag[0]!.selected).toBe(true);
    screen.plus(10);
    screen.plus(-1);
    expect(screen.view().amount).toBe(10);
    expect(screen.act()).toBe(10);
    expect(bag.count('log')).toBe(10);
    expect(kura.count('log')).toBe(10);
    v = screen.view();
    expect(v.store).toEqual([{ item: 'log', count: 10, selected: false, locked: false }]);
    // あずけた あとも 持ち物に のこって いれば えらびは そのまま。数は のこりに おさまる
    expect(v.selected).toEqual({ side: 'bag', item: 'log' });
    expect(v.amount).toBe(10);
    expect(v.max).toBe(10);
  });

  it('数は 1 〜 動かせる 数 の 間。ぜんぶ = 動かせる 数', () => {
    const { screen } = setup({ log: 20 });
    screen.selectBag(0);
    screen.plus(-10);
    expect(screen.view().amount).toBe(1);
    screen.plus(10);
    screen.plus(10);
    screen.plus(10);
    expect(screen.view().amount).toBe(20);
    screen.plus(-1);
    screen.all();
    expect(screen.view().amount).toBe(20);
  });

  it('ぜんぶ あずけると 持ち物の マスが 空いて えらびが きえる', () => {
    const { screen, bag } = setup({ log: 7 });
    screen.selectBag(0);
    screen.all();
    expect(screen.act()).toBe(7);
    expect(bag.count('log')).toBe(0);
    expect(screen.view()).toMatchObject({ selected: null, action: null, amount: 1, max: 0 });
  });

  it('同じ マスを もういちど おしても 数は もどらない', () => {
    const { screen } = setup({ log: 20 });
    screen.selectBag(0);
    screen.plus(10);
    screen.selectBag(0);
    expect(screen.view().amount).toBe(11);
  });

  it('999 こ いっぱいの くらには 1 こも 入らない（動いた 数 0）。持ち物は へらない。えらびは のこる', () => {
    const { screen, bag, kura } = setup({ log: 5 });
    kura.restore({ log: KURA_MAX });
    screen.selectBag(0);
    expect(screen.view().max).toBe(1); // 持ち物に あるので 押せる（押すと ふきだしで しらせる）
    expect(screen.act()).toBe(0);
    expect(bag.count('log')).toBe(5);
    expect(screen.view().selected).toEqual({ side: 'bag', item: 'log' });
  });

  it('くらの あきが 少ないと 数の 上は あきの 分まで', () => {
    const { screen, kura } = setup({ log: 50 });
    kura.restore({ log: KURA_MAX - 3 });
    screen.selectBag(0);
    expect(screen.view().max).toBe(3);
    screen.all();
    expect(screen.view().amount).toBe(3);
  });
});

describe('とりだす', () => {
  it('くらの マスを えらぶ → ぜんぶ → とりだす: もとの 数に もどり、くらの マスは きえる', () => {
    const { screen, bag, kura } = setup({ log: 20 });
    kura.deposit(bag, 'log', 10);
    expect(screen.selectStore('log')).toBe(true);
    expect(screen.view()).toMatchObject({ selected: { side: 'store', item: 'log' }, amount: 1, max: 10, action: 'withdraw' });
    expect(screen.view().store[0]!.selected).toBe(true);
    screen.all();
    expect(screen.view().amount).toBe(10);
    expect(screen.act()).toBe(10);
    expect(bag.count('log')).toBe(20);
    expect(kura.count('log')).toBe(0);
    expect(screen.view()).toMatchObject({ store: [], selected: null, action: null });
  });

  it('くらに ない 物は えらべない', () => {
    const { screen } = setup({ log: 20 });
    expect(screen.selectStore('log')).toBe(false);
    expect(screen.view().selected).toBeNull();
  });

  it('えらんで いない ときは 数も ボタンも 動かない。act は 0', () => {
    const { screen } = setup({ log: 20 });
    screen.plus(10);
    screen.all();
    expect(screen.act()).toBe(0);
    expect(screen.view()).toMatchObject({ selected: null, amount: 1, action: null });
  });

  it('えらびは 開き直すと けす', () => {
    const { screen } = setup({ log: 20 });
    screen.selectBag(0);
    screen.reset();
    expect(screen.view().selected).toBeNull();
  });

  it('持ち物が いっぱいで 入らない 分は くらに のこる。のこりが あれば えらびも のこる', () => {
    const { screen, bag, kura } = setup({ log: 64 });
    kura.deposit(bag, 'log', 64); // くらに 64
    // 持ち物を ほかの 物で うめる（36 マス ぜんぶ）
    for (let i = 0; i < 36; i++) bag.setSlot(i, { item: 'dirt', count: 64 });
    screen.selectStore('log');
    screen.all();
    expect(screen.act()).toBe(0);
    expect(kura.count('log')).toBe(64);
    expect(screen.view().selected).toEqual({ side: 'store', item: 'log' });
  });
});
