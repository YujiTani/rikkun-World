import { describe, expect, it } from 'vitest';
import { InventoryImpl } from './Inventory';

describe('Inventory', () => {
  it('AC16: 入れ方・数える・取り出す', () => {
    const inv = new InventoryImpl();
    expect(inv.add('dirt', 100)).toBe(0);
    expect(inv.slots()[0]).toEqual({ item: 'dirt', count: 64 });
    expect(inv.slots()[1]).toEqual({ item: 'dirt', count: 36 });
    expect(inv.count('dirt')).toBe(100);
    expect(inv.remove('dirt', 70)).toBe(70);
    expect(inv.slots()[1]).toBeNull();
    expect(inv.slots()[0]!.count).toBe(30);
    expect(inv.remove('dirt', 50)).toBe(30);
    expect(inv.count('dirt')).toBe(0);
    for (let i = 0; i < 36; i++) inv.setSlot(i, { item: 'stone', count: 64 });
    expect(inv.add('dirt', 5)).toBe(5);
    expect(inv.canAdd('dirt')).toBe(false);
    expect(inv.canAdd('stone')).toBe(false);
  });

  it('AC15: 同じアイテムのマスが満タンなら番号の小さい空きへ', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'dirt', count: 64 });
    inv.setSlot(1, { item: 'stone', count: 10 });
    inv.setSlot(20, { item: 'dirt', count: 3 });
    inv.add('dirt', 1);
    expect(inv.slots()[20]!.count).toBe(4);
    inv.add('stone', 1);
    expect(inv.slots()[1]!.count).toBe(11);
    inv.setSlot(20, null);
    inv.add('dirt', 1);
    expect(inv.slots()[2]).toEqual({ item: 'dirt', count: 1 });
  });

  it('remove はマス番号の大きい方から', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'dirt', count: 5 });
    inv.setSlot(10, { item: 'dirt', count: 5 });
    inv.remove('dirt', 3);
    expect(inv.slots()[0]!.count).toBe(5);
    expect(inv.slots()[10]!.count).toBe(2);
  });

  it('setSlot は上限にする', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'dirt', count: 200 });
    expect(inv.slots()[0]!.count).toBe(64);
  });

  it('えらぶ: ぐるっと回る', () => {
    const inv = new InventoryImpl();
    inv.select(2);
    expect(inv.selected()).toBe(2);
    inv.select(8);
    inv.selectNext(1);
    expect(inv.selected()).toBe(0);
    inv.selectNext(-1);
    expect(inv.selected()).toBe(8);
    inv.select(9);
    expect(inv.selected()).toBe(8);
  });

  it('held / consumeHeld', () => {
    const inv = new InventoryImpl();
    expect(inv.consumeHeld()).toBe(false);
    inv.setSlot(0, { item: 'dirt', count: 2 });
    expect(inv.consumeHeld()).toBe(true);
    expect(inv.held()).toEqual({ item: 'dirt', count: 1 });
    inv.consumeHeld();
    expect(inv.held()).toBeNull();
  });

  describe('AC21: クリック', () => {
    it('持つ・空に置く', () => {
      const inv = new InventoryImpl();
      inv.setSlot(3, { item: 'dirt', count: 5 });
      inv.click(3);
      expect(inv.cursor()).toEqual({ item: 'dirt', count: 5 });
      expect(inv.slots()[3]).toBeNull();
      inv.click(10);
      expect(inv.cursor()).toBeNull();
      expect(inv.slots()[10]).toEqual({ item: 'dirt', count: 5 });
    });
    it('同じアイテムを重ねる', () => {
      const inv = new InventoryImpl();
      inv.setSlot(0, { item: 'dirt', count: 50 });
      inv.setSlot(1, { item: 'dirt', count: 30 });
      inv.click(1);
      inv.click(0);
      expect(inv.slots()[0]!.count).toBe(64);
      expect(inv.cursor()).toEqual({ item: 'dirt', count: 16 });
    });
    it('空・空は何もしない', () => {
      const inv = new InventoryImpl();
      inv.click(4);
      expect(inv.cursor()).toBeNull();
      expect(inv.slots()[4]).toBeNull();
    });
    it('入れかえて閉じる (f)', () => {
      const inv = new InventoryImpl();
      inv.setSlot(3, { item: 'dirt', count: 5 });
      inv.setSlot(5, { item: 'stone', count: 7 });
      inv.click(3);
      inv.click(5);
      expect(inv.cursor()).toEqual({ item: 'stone', count: 7 });
      inv.returnCursor();
      expect(inv.slots()[3]).toEqual({ item: 'stone', count: 7 });
      expect(inv.slots()[5]).toEqual({ item: 'dirt', count: 5 });
      expect(inv.cursor()).toBeNull();
    });
    it('serialize は持ち上げたマスに戻した形', () => {
      const inv = new InventoryImpl();
      inv.setSlot(3, { item: 'dirt', count: 5 });
      inv.click(3);
      const data = inv.serialize() as { slots: unknown[] };
      expect(data.slots[3]).toEqual({ item: 'dirt', count: 5 });
    });
  });

  it('serialize / deserialize', () => {
    const a = new InventoryImpl();
    a.setSlot(4, { item: 'sand', count: 9 });
    a.select(4);
    const b = new InventoryImpl();
    b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
    expect(b.slots()[4]).toEqual({ item: 'sand', count: 9 });
    expect(b.selected()).toBe(4);
    expect(() => b.deserialize({ slots: [], selected: 0 })).toThrow();
    expect(() => b.deserialize({ slots: new Array(36).fill({ item: 'air', count: 1 }), selected: 0 })).toThrow();
    expect(b.slots()[4]).toEqual({ item: 'sand', count: 9 });
  });

  it('onChange', () => {
    const inv = new InventoryImpl();
    let n = 0;
    const off = inv.onChange(() => n++);
    inv.add('dirt', 1);
    expect(n).toBe(1);
    off();
    inv.add('dirt', 1);
    expect(n).toBe(1);
  });
});
