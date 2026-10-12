import { describe, expect, it } from 'vitest';
import type { BlockId, Vec3, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { DROP, DropField } from './DropField';

class W implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

function rig() {
  const world = new W();
  for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) world.setBlock(x, 8, z, 'stone');
  const inv = new InventoryImpl();
  const player: Vec3 = { x: 50, y: 9, z: 50 };
  let saves = 0;
  const f = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3), requestSave: () => saves++ });
  return { world, inv, player, f, saves: () => saves };
}

describe('DropField', () => {
  it('妖怪のドロップは小さく散って止まり、kind が yokai', () => {
    const r = rig();
    const n = r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }, { item: 'stone', count: 1 }], { kind: 'yokai' });
    expect(n).toBe(3);
    for (let i = 0; i < 120; i++) r.f.update(true);
    const l = r.f.list();
    expect(l).toHaveLength(2);
    for (const d of l) {
      expect(d.kind).toBe('yokai');
      expect(d.position.y).toBe(9);
      expect(Math.hypot(d.position.x - 10.5, d.position.z - 10.5)).toBeLessThanOrEqual(1.8);
    }
  });

  it('拾う・足もとが消えたら落ちる・10 分で消える・保存', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }]);
    for (let i = 0; i < 120; i++) r.f.update(true);
    const saved = JSON.parse(JSON.stringify(r.f.serialize()));
    const p = r.f.list()[0]!.position;
    // 足もとのブロックを消すと落ちる
    r.world.setBlock(Math.floor(p.x), 8, Math.floor(p.z), 'air');
    for (let i = 0; i < 60; i++) r.f.update(true);
    expect(r.f.list()[0]!.position.y).toBeLessThan(5);
    // 保存 → 読みこみ（古い形は無視）
    const g = rig();
    g.f.deserialize([...saved, { x: 1, y: 2, z: 3, slots: [], ticksLeft: 9 }]);
    expect(g.f.size()).toBe(1);
    expect(g.f.list()[0]!.ticksLeft).toBe(DROP.ticks - 120);
    // 拾う
    g.player.x = p.x;
    g.player.z = p.z;
    g.player.y = p.y;
    expect(g.f.update(true)).toHaveLength(1);
    expect(g.inv.count('dirt')).toBe(2);
    expect(g.f.size()).toBe(0);
  });

  it('10 分で消える', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 9, z: 10.5 }, [{ item: 'dirt', count: 2 }]);
    for (let i = 0; i < DROP.ticks - 1; i++) r.f.update(true);
    expect(r.f.size()).toBe(1);
    r.f.update(true);
    expect(r.f.size()).toBe(0);
  });
});
