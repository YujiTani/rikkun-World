import type { Inventory, ItemStack } from '../contracts';
import type { DragTarget, ItemDropper } from './ItemDropper';
import { tansuPixels, type TansuFace } from './tansuArt';
import type { StorageSystem } from './StorageSystem';

/** `window.__rikkun.storage.*`（M6 §6.1）。つなぎ込みが testHook に `storage:` として足す */
export function createStorageHook(storage: StorageSystem, screen: { inventoryOpen(): boolean; toggle(): void }) {
  return {
    ui: () => storage.ui(),
    open: (x: number, y: number, z: number) => storage.open(x, y, z),
    get: (x: number, y: number, z: number) => storage.get(x, y, z),
    set: (x: number, y: number, z: number, i: number, stack: ItemStack | null) => storage.set(x, y, z, i, stack),
    click: (i: number) => storage.click(i),
    shiftClick: (from: 'tansu' | 'inv', i: number) => storage.shiftClick(from, i),
    close: () => {
      if (storage.ui().open) storage.close();
      else if (screen.inventoryOpen()) screen.toggle();
    },
    list: () => storage.list(),
    texture: (face: TansuFace) => tansuPixels(face),
  };
}

/**
 * `inventory.*` に足す分（`createInventoryHook` の extras へ）: shiftClick・clickOutside・dragOut。
 * shiftMove は InventoryImpl のもの
 */
export function createInventoryM6Extras(deps: {
  inventory: Inventory & { shiftMove(i: number): number };
  storage: StorageSystem;
  dropper: ItemDropper;
  screen: { inventoryOpen(): boolean };
}) {
  return {
    shiftClick: (i: number) => {
      if (!deps.screen.inventoryOpen()) return { moved: 0, reason: 'closed' as const };
      if (deps.storage.ui().open) return deps.storage.shiftClick('inv', i);
      return { moved: deps.inventory.shiftMove(i), reason: null };
    },
    /** パネルの外を クリックしたのと同じ。なにもしない（M6 第 3 版） */
    clickOutside: () => {},
    dragOut: (target: DragTarget) => (deps.screen.inventoryOpen() ? deps.dropper.dropTarget(target, true) : false),
  };
}
