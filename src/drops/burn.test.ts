import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BlockId, Vec3, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createRng } from '../world/gen/random';
import { BagVisuals } from '../fx/bagVisuals';
import { DROP, DropField } from './DropField';

/** WAKIDOKORO §8: マグマに 落ちた アイテムは 20 秒で 燃えて 消える（中に いる あいだ だけ。出たら 0 に もどる） */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 16, z: 32 };
  b = new Map<string, BlockId>();
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 32, z1: 32 };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 32 || y >= 16 || z >= 32) return 'outside';
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (id === 'air') this.b.delete(`${x},${y},${z}`);
    else this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b === 'stone' || b === 'outside';
  }
}

function rig() {
  const world = new W();
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) world.setBlock(x, 2, z, 'stone');
  // マグマの いけ（3×3、深さ 2）
  for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) for (let y = 3; y <= 4; y++) world.setBlock(x, y, z, 'magma');
  const player: Vec3 = { x: 30, y: 3, z: 30 };
  let burned = 0;
  const f = new DropField({ world, inventory: new InventoryImpl(), player: () => player, rng: createRng(1), onBurn: () => burned++ });
  return { world, f, burned: () => burned };
}

describe('WAKIDOKORO §8 マグマで 燃える 落としもの', () => {
  it('マグマに 落ちると しずんで 燃える（burning）→ 20 秒（1200 ステップ）で 消える', () => {
    expect(DROP.burnTicks).toBe(1200);
    const r = rig();
    r.f.scatter({ x: 5.5, y: 6, z: 5.5 }, [{ item: 'dirt', count: 1 }], { speedMin: 0, speedMax: 0, upMin: 0, upMax: 0 });
    for (let i = 0; i < 120; i++) r.f.update(false);
    expect(r.f.list()[0]!.burning).toBe(true);
    for (let i = 120; i < 1150; i++) r.f.update(false);
    expect(r.f.size(), '20 秒 まえは まだ ある').toBe(1);
    for (let i = 0; i < 200; i++) r.f.update(false);
    expect(r.f.size()).toBe(0);
    expect(r.burned()).toBe(1);
  });

  it('マグマの そと では 燃えない', () => {
    const r = rig();
    r.f.scatter({ x: 10.5, y: 4, z: 10.5 }, [{ item: 'dirt', count: 1 }], { speedMin: 0, speedMax: 0, upMin: 0, upMax: 0 });
    for (let i = 0; i < 1500; i++) r.f.update(false);
    expect(r.f.size()).toBe(1);
    expect(r.f.list()[0]!.burning).toBe(false);
  });

  it('マグマが なくなる（出る）と タイマーは 0 に もどる', () => {
    const r = rig();
    r.f.scatter({ x: 5.5, y: 6, z: 5.5 }, [{ item: 'dirt', count: 1 }], { speedMin: 0, speedMax: 0, upMin: 0, upMax: 0 });
    for (let i = 0; i < 1000; i++) r.f.update(false);
    for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) for (let y = 3; y <= 4; y++) r.world.setBlock(x, y, z, 'air');
    for (let i = 0; i < 20; i++) r.f.update(false);
    expect(r.f.list()[0]!.burning).toBe(false);
    for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) for (let y = 3; y <= 4; y++) r.world.setBlock(x, y, z, 'magma');
    for (let i = 0; i < 1000; i++) r.f.update(false);
    expect(r.f.size(), 'もどった ので 合計 2000 ステップでも のこる').toBe(1);
    for (let i = 0; i < 300; i++) r.f.update(false);
    expect(r.f.size()).toBe(0);
  });

  it('見た目: 燃えて いる ものに 炎 2・けむり 1 の つぶ。燃えて いなければ 0（描かない）', () => {
    const scene = new THREE.Scene();
    const v = new BagVisuals(scene);
    const bag = { id: 1, position: { x: 1, y: 1, z: 1 }, slots: [{ item: 'dirt' as const, count: 1 }], ticksLeft: 100, burning: true };
    v.update(0.1, [bag]);
    expect(v.burnParticles).toBe(3);
    v.update(0.1, [{ ...bag, burning: false }]);
    expect(v.burnParticles).toBe(0);
    v.dispose();
  });
});
