import type { Inventory, ItemId, ItemStack, ScreenState } from '../contracts';

/** `window.__rikkun.inventory.*`（M2 §6.1）。返す入れ物がそのまま `inventory` になる */
export function createInventoryHook<E extends object = object>(
  inv: Inventory,
  screen: Pick<ScreenState, 'inventoryOpen'>,
  /** M4: pickup / pickupLog など（`createPickupHook(craft)`）。そのまま足される */
  extras?: E,
) {
  const copy = (s: ItemStack | null) => (s ? { item: s.item, count: s.count } : null);
  return {
    get: () => ({
      slots: inv.slots().map(copy),
      selected: inv.selected(),
      open: screen.inventoryOpen(),
      cursor: copy(inv.cursor()),
    }),
    setSlot: (i: number, stack: ItemStack | null) => inv.setSlot(i, stack),
    select: (i: number) => inv.select(i),
    clear: () => inv.clear(),
    add: (item: ItemId, count: number) => inv.add(item, count),
    count: (item: ItemId) => inv.count(item),
    remove: (item: ItemId, count: number) => inv.remove(item, count),
    click: (i: number) => {
      if (screen.inventoryOpen()) inv.click(i);
    },
    itemTypes: () => inv.itemTypes(),
    ...(extras ?? ({} as E)),
  };
}
