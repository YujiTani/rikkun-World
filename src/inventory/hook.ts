import type { Inventory, ItemId, ItemStack, ScreenState } from '../contracts';
import { copyStack, itemClassOf } from '../tools/durability';

/** `window.__rikkun.inventory.*`（M2 §6.1）。返す入れ物がそのまま `inventory` になる */
export function createInventoryHook<E extends object = object>(
  inv: Inventory & { setDurability?(slot: number, left: number): void },
  screen: Pick<ScreenState, 'inventoryOpen'>,
  /** M4: pickup / pickupLog など（`createPickupHook(craft)`）。そのまま足される */
  extras?: E,
) {
  const copy = (s: ItemStack | null) => (s ? copyStack(s) : null);
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
    add: (item: ItemId, count: number, opts?: { power?: number; plan?: number }) => inv.add(item, count, opts),
    count: (item: ItemId) => inv.count(item),
    remove: (item: ItemId, count: number) => inv.remove(item, count),
    click: (i: number) => {
      if (screen.inventoryOpen()) inv.click(i);
    },
    itemTypes: () => inv.itemTypes(),
    /** WEAPON-2 §6.1: そのマスの たいきゅう `{ max, left } | null` */
    durability: (slot: number) => inv.durability(slot),
    /** WEAPON-2 §6.1: 準備用 */
    setDurability: (slot: number, left: number) => inv.setDurability?.(slot, left),
    events: () => inv.peekWearEvents(),
    itemClass: (item: ItemId) => itemClassOf(item),
    ...(extras ?? ({} as E)),
  };
}
