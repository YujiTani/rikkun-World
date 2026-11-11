import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../inventory/Inventory';
import { createP2Drop, dragTargetOfFocus } from './p2Drop';

describe('dragTargetOfFocus（2P の えらび名 → すてる 元）', () => {
  it('slot・equip・tansu は 変える。ほかは null', () => {
    expect(dragTargetOfFocus('slot:4')).toBe(4);
    expect(dragTargetOfFocus('equip:head')).toBe('head');
    expect(dragTargetOfFocus('tansu:2')).toBe('tansu:2');
    expect(dragTargetOfFocus('tile:x')).toBeNull();
    expect(dragTargetOfFocus('close')).toBeNull();
    expect(dragTargetOfFocus(null)).toBeNull();
  });
});

describe('createP2Drop（2P の もちもので X・R3）', () => {
  const mk = (pressed: string, open = true, focus: string | null = 'slot:0') => {
    const inventory = new InventoryImpl();
    inventory.add('dirt', 10);
    const thrown: { item: string; count: number }[] = [];
    const drop = createP2Drop({
      actions: { wasPressed: (a: string) => a === pressed } as never,
      inventory,
      isOpen: () => open,
      focus: () => focus,
      throwItem: (st) => void thrown.push({ item: st.item, count: st.count }),
    });
    return { inventory, thrown, drop };
  };
  const total = (i: InventoryImpl): number => i.slots().reduce((n, s) => n + (s?.count ?? 0), 0);

  it('X で 1 こ、R3 で ぜんぶ（えらんでいる マス）', () => {
    const a = mk('drop');
    a.drop.update();
    expect(a.thrown).toEqual([{ item: 'dirt', count: 1 }]);
    expect(total(a.inventory)).toBe(9);
    const b = mk('dropStack');
    b.drop.update();
    expect(b.thrown).toEqual([{ item: 'dirt', count: 10 }]);
    expect(total(b.inventory)).toBe(0);
  });
  it('画面が とじている・えらびが ない ときは 何も しない', () => {
    const a = mk('drop', false);
    a.drop.update();
    expect(a.thrown).toEqual([]);
    const b = mk('drop', true, null);
    b.drop.update();
    expect(b.thrown).toEqual([]);
  });
  it('つかんで いる 物が あれば それを すてる', () => {
    const a = mk('dropStack');
    a.inventory.setCursor({ item: 'stone', count: 3 });
    a.drop.update();
    expect(a.thrown).toEqual([{ item: 'stone', count: 3 }]);
    expect(total(a.inventory)).toBe(10);
  });
});
