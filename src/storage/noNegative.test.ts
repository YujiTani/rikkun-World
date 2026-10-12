import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { StorageSystem } from './StorageSystem';

class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) !== 'air';
  }
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** 持ち物・カーソル・たんす の数が いつも 1 以上 上限以下 */
function check(inv: InventoryImpl, st: StorageSystem, where: string) {
  const all: (ItemStack | null)[] = [...inv.slots(), inv.cursor(), ...(st.openSlots() ?? [])];
  for (const s of all) {
    if (!s) continue;
    const max = itemType(s.item)!.maxStack;
    expect(s.count, where).toBeGreaterThanOrEqual(1);
    expect(s.count, where).toBeLessThanOrEqual(max);
    expect(Number.isInteger(s.count), where).toBe(true);
  }
}

describe('数が 0 未満にならない（ランダムに いろいろ操作する）', () => {
  it('持ち物・たんす・カーソルの操作を 3000 回', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const rnd = lcg(seed);
      const pick = (n: number) => Math.floor(rnd() * n);
      const world = new W();
      world.setBlock(5, 5, 5, 'tansu');
      const inv = new InventoryImpl();
      let open = false;
      const st = new StorageSystem({
        world,
        inventory: inv,
        player: () => ({ x: 5.5, y: 5, z: 7.5 }),
        scatter: () => {},
        inventoryOpen: () => open,
        openScreen: () => (open = true),
        closeScreen: () => (open = false),
      });
      st.open(5, 5, 5);
      const items = ['dirt', 'stone', 'log', 'coal_ore', 'torch', 'wood_pickaxe'] as const;
      for (let n = 0; n < 500; n++) {
        const item = items[pick(items.length)];
        const op = pick(13);
        const i = pick(36);
        if (op === 0) inv.add(item, 1 + pick(80));
        else if (op === 1) inv.remove(item, 1 + pick(80));
        else if (op === 2) inv.click(i);
        else if (op === 3) inv.shiftMove(i);
        else if (op === 4) inv.takeFromSlot(i, rnd() < 0.5);
        else if (op === 5) inv.consumeHeld();
        else if (op === 6) inv.setSlot(i, { item, count: pick(100) - 10 });
        else if (op === 7) st.click(pick(54));
        else if (op === 8) st.shiftClick(rnd() < 0.5 ? 'tansu' : 'inv', rnd() < 0.5 ? pick(54) : i);
        else if (op === 9) st.takeFromSlot(pick(54), rnd() < 0.5);
        else if (op === 10) inv.select(pick(9));
        else if (op === 11) inv.returnCursor();
        else if (!inv.cursor()) inv.setCursor({ item, count: 1 + pick(itemType(item)!.maxStack) });
        check(inv, st, `seed ${seed} step ${n} op ${op}`);
      }
    }
  });
});
