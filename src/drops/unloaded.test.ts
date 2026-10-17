import { describe, expect, it } from 'vitest';
import type { BlockId, Vec3, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { DropField } from './DropField';

/** 読みこみの範囲を 動かせる 平らな世界（y <= 8 が いし） */
class W implements VoxelWorld {
  readonly size = { y: 32 };
  loaded = (_x: number, _z: number) => true;
  isLoaded(x: number, z: number): boolean {
    return this.loaded(x, z);
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 0, z1: 0 };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (y < 0 || y >= 32 || !this.loaded(x, z)) return 'outside';
    return y <= 8 ? 'stone' : 'air';
  }
  setBlock(): boolean {
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) === 'stone';
  }
}

function rig(at: Vec3) {
  const world = new W();
  const inv = new InventoryImpl();
  const player: Vec3 = { ...at };
  const f = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3) });
  return { world, inv, player, f };
}

describe('落ちている物と 読みこんでいない列（VOX-D）', () => {
  it('列が読みこまれていない間は 動かず・ひろえず・消えるまでの時間は進む', () => {
    const r = rig({ x: 10.5, y: 9, z: 10.5 });
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 1 }]);
    for (let i = 0; i < 5; i++) r.f.update(false);
    const mid = r.f.list()[0]!;
    const px = mid.position.x;
    const py = mid.position.y;
    const left = mid.ticksLeft;
    r.world.loaded = () => false;
    for (let i = 0; i < 300; i++) r.f.update(true);
    const v = r.f.list()[0]!;
    expect(v.position.x).toBe(px);
    expect(v.position.y).toBe(py);
    expect(r.inv.count('dirt')).toBe(0);
    expect(v.ticksLeft).toBe(left - 300);
    // もどったら そこから また動いて、ひろえる
    r.world.loaded = () => true;
    for (let i = 0; i < 300; i++) r.f.update(true);
    expect(r.inv.count('dirt')).toBe(1);
  });
  it('読みこんでいない列の物は 時間が来たら 消える', () => {
    const r = rig({ x: 10.5, y: 9, z: 10.5 });
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 1 }]);
    r.world.loaded = () => false;
    r.f.deserialize(r.f.serialize().map((s) => ({ ...s, ticksLeft: 3 })));
    for (let i = 0; i < 5; i++) r.f.update(true);
    expect(r.f.size()).toBe(0);
  });
  it('見えない壁: 東のはし (30000) をこえて 横に飛ばない', () => {
    const r = rig({ x: 0, y: 9, z: 0 });
    r.f.deserialize([{ x: 29999.9, y: 12, z: 5.5, item: 'dirt', count: 1, ticksLeft: 5000, batch: 1, rarity: 'common' }]);
    (r.f as unknown as { items: { vx: number }[] }).items[0]!.vx = 5;
    for (let i = 0; i < 120; i++) r.f.update(false);
    const v = r.f.list()[0]!;
    expect(v.position.x).toBeLessThan(30000);
    expect(v.position.y).toBe(9);
  });
  it('負の座標でも ふつうに落ちて 止まる', () => {
    const r = rig({ x: -100.5, y: 9, z: -100.5 });
    r.f.scatter({ x: -100.5, y: 9, z: -100.5 }, [{ item: 'dirt', count: 1 }]);
    for (let i = 0; i < 200; i++) r.f.update(true);
    expect(r.inv.count('dirt')).toBe(1);
  });
});
