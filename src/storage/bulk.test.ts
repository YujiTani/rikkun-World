import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
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


function rig() {
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
  return { inv, st };
}

describe('たんす: いっきに しまう・とりだす', () => {
  it('ぜんぶ しまう: 上 3 だん だけ。ホットバーは うごかない', () => {
    const { inv, st } = rig();
    inv.setSlot(0, { item: 'dirt', count: 5 });
    inv.setSlot(9, { item: 'stone', count: 7 });
    inv.setSlot(35, { item: 'log', count: 3 });
    expect(st.storeAll().moved).toBe(10);
    expect(inv.slots()[0]).toEqual({ item: 'dirt', count: 5 });
    expect(inv.slots()[9]).toBeNull();
    expect(st.get(5, 5, 5)!.slots.filter(Boolean).length).toBe(2);
  });

  it('おなじ もの を しまう: たんす にある ものだけ', () => {
    const { inv, st } = rig();
    expect(st.set(5, 5, 5, 0, { item: 'stone', count: 1 })).toBe(true);
    inv.setSlot(9, { item: 'stone', count: 7 });
    inv.setSlot(10, { item: 'log', count: 3 });
    inv.setSlot(1, { item: 'stone', count: 2 });
    expect(st.storeSame().moved).toBe(7);
    expect(inv.slots()[10]).toEqual({ item: 'log', count: 3 });
    expect(inv.slots()[1]).toEqual({ item: 'stone', count: 2 });
  });

  it('ぜんぶ とりだす: 入る分だけ', () => {
    const { inv, st } = rig();
    for (let i = 0; i < 36; i++) inv.setSlot(i, { item: 'stone', count: 64 });
    inv.setSlot(20, null);
    st.set(5, 5, 5, 0, { item: 'dirt', count: 10 });
    st.set(5, 5, 5, 1, { item: 'log', count: 10 });
    expect(st.takeAll().moved).toBe(10);
    expect(st.get(5, 5, 5)!.slots[1]).toEqual({ item: 'log', count: 10 });
  });

  it('✓: つけて・はずして・えらんだ ものを しまう。とじると 消える', () => {
    const { inv, st } = rig();
    inv.setSlot(9, { item: 'stone', count: 7 });
    inv.setSlot(10, { item: 'log', count: 3 });
    expect(st.mark(9)).toBe(true);
    expect(st.mark(10)).toBe(true);
    expect(st.mark(10)).toBe(false);
    expect(st.marks()).toEqual([9]);
    expect(st.storeMarked().moved).toBe(7);
    expect(st.marks()).toEqual([]);
    expect(inv.slots()[10]).toEqual({ item: 'log', count: 3 });
    st.mark(10);
    st.close();
    expect(st.marks()).toEqual([]);
  });
});
