import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { StorageSystem } from './StorageSystem';

/**
 * MINE-1E（E11）の たんすの 口: `has`・`firstFill`〔記録が ない たんすを はじめて あける／あける 前に こわす ときだけ。`placed` では 呼ばない〕。
 * キャンプの 中身の 取り出しは 坑道の 窓口〔mineBokenCamp.test.ts〕。ここは 口の 約束だけ
 */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
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

const FILL: ItemStack[] = [
  { item: 'kabita_pan', count: 2 },
  { item: 'torch', count: 5 },
];

function rig() {
  const world = new W();
  world.setBlock(5, 5, 5, 'tansu');
  const calls: string[] = [];
  const scattered: ItemStack[][] = [];
  const st = new StorageSystem({
    world,
    inventory: new InventoryImpl(),
    player: () => ({ x: 5.5, y: 5, z: 7.5 }),
    scatter: (_p, s) => void scattered.push(s),
    inventoryOpen: () => false,
    openScreen: () => {},
    closeScreen: () => {},
    firstFill: (x, y, z) => {
      calls.push(`${x},${y},${z}`);
      return FILL.map((s) => ({ ...s }));
    },
  });
  return { world, st, calls, scattered };
}

const total = (slots: readonly (ItemStack | null)[]): number => slots.reduce((n, s) => n + (s ? s.count : 0), 0);

describe('たんすの 口: has・firstFill', () => {
  it('記録が ない うちは has が false。はじめて あけると 中身が 入って 記録が できる〔1 回 だけ〕', () => {
    const { st, calls } = rig();
    expect(st.has(5, 5, 5)).toBe(false);
    expect(st.open(5, 5, 5)).toBe(true);
    expect(st.has(5, 5, 5)).toBe(true);
    expect(total(st.get(5, 5, 5)!.slots)).toBe(7);
    st.close();
    st.open(5, 5, 5);
    expect(calls).toEqual(['5,5,5']);
  });

  it('保存して もどしても、あける 前は 記録なし・あけた あとは 記録あり〔firstFill は 呼ばない〕', () => {
    const a = rig();
    expect(a.st.serialize() as unknown[]).toHaveLength(0);
    a.st.open(5, 5, 5);
    const saved = JSON.parse(JSON.stringify(a.st.serialize())) as unknown;
    const b = rig();
    b.st.deserialize(saved);
    expect(b.st.has(5, 5, 5)).toBe(true);
    b.st.open(5, 5, 5);
    expect(b.calls).toHaveLength(0);
    expect(total(b.st.get(5, 5, 5)!.slots)).toBe(7);
  });

  it('あける 前に こわすと 中身が 落ちて、記録は 残らない', () => {
    const { world, st, calls, scattered } = rig();
    world.setBlock(5, 5, 5, 'air');
    expect(st.broken(5, 5, 5)).toBe(7);
    expect(scattered).toHaveLength(1);
    expect(st.has(5, 5, 5)).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('`placed` では 呼ばない・置きなおした たんすは 空', () => {
    const { world, st, calls } = rig();
    world.setBlock(5, 5, 5, 'air');
    st.broken(5, 5, 5);
    world.setBlock(5, 5, 5, 'tansu');
    st.placed(5, 5, 5, 0);
    expect(st.has(5, 5, 5)).toBe(true);
    st.open(5, 5, 5);
    expect(total(st.get(5, 5, 5)!.slots)).toBe(0);
    expect(calls).toHaveLength(1); // こわした ときの 1 回 だけ
    world.setBlock(9, 5, 5, 'tansu');
    st.placed(9, 5, 5, 90);
    st.open(9, 5, 5);
    expect(calls).toHaveLength(1);
  });
});
