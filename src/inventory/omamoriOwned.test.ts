import { describe, expect, it } from 'vitest';
import { InventoryImpl } from './Inventory';

/** ITEM-FX-1 レビュー指摘: add 以外の 経路（カーソルで おく）でも おまもりは 持ち物 全体で 1 つだけ */
describe('おまもり 1 つだけ（カーソルの 経路）', () => {
  it('たんすから 持ってきた（カーソル）おまもりは、もう 持っていると 持ち物に おけない', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'omamori', count: 1 });
    inv.setCursor({ item: 'omamori', count: 1 });
    inv.click(5); // 空きマス
    expect(inv.count('omamori')).toBe(1);
    expect(inv.cursor()?.item).toBe('omamori'); // 元の（カーソル）のまま
    inv.click(0); // 入れかえも だめ
    expect(inv.count('omamori')).toBe(1);
    expect(inv.cursor()?.item).toBe('omamori');
  });
  it('持ち物の中の おまもりを 持ち上げて おきなおすのは できる', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'omamori', count: 1 });
    inv.click(0);
    inv.click(7);
    expect(inv.slots()[7]?.item).toBe('omamori');
    expect(inv.count('omamori')).toBe(1);
  });
});
