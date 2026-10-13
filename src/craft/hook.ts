import type { ArmorSlot, ItemId } from '../contracts';
import type { ArmorSystemImpl } from './ArmorSystem';
import type { CraftSystemImpl } from './CraftSystem';

/** `window.__rikkun.craft`（M4 §6.1）。`ui` は C1 の画面が足す */
export function createCraftHook(craft: CraftSystemImpl, screen: { inventoryOpen(): boolean }) {
  return {
    list: () => craft.list(),
    make: (id: string) => craft.make(id),
    click: (id: string) => (screen.inventoryOpen() ? craft.make(id) : { ok: false, reason: 'closed' as const }),
    events: () => craft.takeCraftHookEvents(),
    fuel: () => craft.fuel(),
    setFuel: (id: string) => craft.setFuel(id as ItemId),
    openFurnace: (x: number, y: number, z: number) => craft.openFurnace(x, y, z),
  };
}

/** `window.__rikkun.furnace`（M4 §6.1） */
export function createFurnaceHook(craft: CraftSystemImpl, screen: { inventoryOpen(): boolean }) {
  return {
    list: () => craft.bakeList(),
    click: (id: string) => (screen.inventoryOpen() ? craft.clickBake(id) : { ok: false, reason: 'closed' as const }),
    bake: (id: string, x: number, y: number, z: number) => craft.bake(id, x, y, z),
    get: (x: number, y: number, z: number) => craft.furnaceAt(x, y, z),
    events: () => craft.takeFurnaceHookEvents(),
  };
}

/** `window.__rikkun.armor`（M4 §6.1） */
export function createArmorHook(armor: ArmorSystemImpl, screen: { inventoryOpen(): boolean }) {
  return {
    get: () => armor.snapshot(),
    /** WEAPON-2 §6.1: 着ている 防具の たいきゅう `{ max, left } | null`・準備用 */
    durability: (slot: ArmorSlot) => armor.durability(slot),
    setDurability: (slot: ArmorSlot, left: number) => armor.setDurability(slot, left),
    events: () => armor.peekWearEvents(),
    set: (head: ItemId | null, body: ItemId | null, arms: ItemId | null = null, legs: ItemId | null = null) => armor.set(head, body, arms, legs),
    click: (slot: ArmorSlot) => {
      if (screen.inventoryOpen()) armor.click(slot);
    },
  };
}

/** `inventory.pickup` / `inventory.pickupLog`（M4 §6.1）。`createInventoryHook` の 3 つ目の引数に渡す */
export function createPickupHook(craft: CraftSystemImpl) {
  return {
    pickup: (item: ItemId, count: number) => craft.pickup(item, count),
    pickupLog: () => craft.pickupLog().map((l) => ({ item: l.item, count: l.count, ticksLeft: l.ticksLeft })),
  };
}

/** `window.__rikkun.craft` の M6 の足す分（A）: `hover`・`tileClick`・`detailPress`・`info`（M6 §6.1）。`craft.ui()` は `panel.ui()` が新しい項目も返す */
export function createCraftPanelHook(
  panel: {
    hover(id: string | null): void;
    tileClick(id: string): { action: 'select' | 'make'; ok: boolean; reason: string | null };
    detailPress(): { ok: boolean; reason: string | null };
    info(): { info(item: ItemId): unknown };
  },
) {
  return {
    hover: (id: string | null) => panel.hover(id),
    tileClick: (id: string) => panel.tileClick(id),
    detailPress: () => panel.detailPress(),
    info: (item: ItemId) => panel.info().info(item),
  };
}
