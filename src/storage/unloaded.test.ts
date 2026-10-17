import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { StorageSystem } from './StorageSystem';

/** 列ごとに 読みこみ・捨てを まねできる世界 */
class W implements VoxelWorld {
  readonly size = { y: 32 };
  loaded = true;
  b = new Map<string, BlockId>();
  isLoaded(): boolean {
    return this.loaded;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 0, z1: 0 };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (!this.loaded) return 'outside';
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
  world.setBlock(-300, 5, -300, 'tansu');
  const st = new StorageSystem({
    world,
    inventory: new InventoryImpl(),
    player: () => ({ x: 0, y: 5, z: 0 }),
    scatter: () => {},
    inventoryOpen: () => false,
    openScreen: () => {},
    closeScreen: () => {},
  });
  return { world, st };
}

describe('たんすと 読みこんでいない列（VOX-D）', () => {
  it('列が捨てられても 記録（中身）は消えず、もどったら 中身が同じ', () => {
    const { world, st } = rig();
    st.set(-300, 5, -300, 0, { item: 'dirt', count: 7 });
    st.set(-300, 5, -300, 1, { item: 'stone', count: 3 });
    world.loaded = false;
    for (let i = 0; i < 10; i++) st.update();
    world.loaded = true;
    st.update();
    const g = st.get(-300, 5, -300)!;
    expect(g.slots[0]).toMatchObject({ item: 'dirt', count: 7 });
    expect(g.slots[1]).toMatchObject({ item: 'stone', count: 3 });
  });
  it('読みこんでいる列で ブロックが本当に変わったら 記録を消す', () => {
    const { world, st } = rig();
    st.set(-300, 5, -300, 0, { item: 'dirt', count: 7 });
    world.setBlock(-300, 5, -300, 'air');
    st.update();
    expect(st.list()).toHaveLength(0);
    world.setBlock(-300, 5, -300, 'tansu');
    expect(st.get(-300, 5, -300)!.slots[0]).toBeNull();
  });
});
