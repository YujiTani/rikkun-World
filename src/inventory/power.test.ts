import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, Vec3, VoxelWorld } from '../contracts';
import { DropField } from '../drops/DropField';
import { StorageSystem } from '../storage/StorageSystem';
import { createRng } from '../world/gen/random';
import { InventoryImpl } from './Inventory';

/** WEAPON-7 PR3 AC28: 虹の 強さ(power)は その 1 本に 保存され、持ちかえ・たんす・地面の 袋・保存で かわらない */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
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

const powers = (inv: InventoryImpl) => inv.slots().map((s) => (s ? s.power : null));

describe('もちものの power', () => {
  it('add(niji, 1, {power}) → そのマスに power。2 本 入れると べつべつの マス・それぞれの 強さ', () => {
    const inv = new InventoryImpl();
    expect(inv.add('niji', 1, { power: 4 })).toBe(0);
    expect(inv.add('niji', 1, { power: 10 })).toBe(0);
    expect(inv.add('niji', 1)).toBe(0);
    expect(powers(inv).slice(0, 3)).toEqual([4, 10, undefined]);
    expect(inv.count('niji')).toBe(3);
  });
  it('範囲の 外・小数は おさめる（4〜10 の 整数）。強さの ない 武器には つかない', () => {
    const inv = new InventoryImpl();
    inv.add('niji', 1, { power: 99 });
    inv.add('niji', 1, { power: 2 });
    inv.add('niji', 1, { power: 6.4 });
    inv.add('raijin_ken', 1, { power: 9 });
    expect(powers(inv).slice(0, 4)).toEqual([10, 4, 6, undefined]);
  });
  it('たいきゅうが へっても power は のこる・setDurability でも', () => {
    const inv = new InventoryImpl();
    inv.add('niji', 1, { power: 9 });
    inv.wearSlot(0, 3);
    expect(inv.slots()[0]).toEqual({ item: 'niji', count: 1, wear: 3, power: 9 });
    inv.setDurability(0, 5000);
    expect(inv.slots()[0]).toEqual({ item: 'niji', count: 1, wear: 5000, power: 9 });
    inv.setDurability(0, 10000);
    expect(inv.slots()[0]).toEqual({ item: 'niji', count: 1, power: 9 });
  });
  it('マスの うつしかえ(shiftMove)・持ち上げて 置く(click)・保存して 読む で かわらない', () => {
    const inv = new InventoryImpl();
    inv.add('niji', 1, { power: 8 });
    expect(inv.shiftMove(0)).toBe(1);
    expect(inv.slots()[0]).toBeNull();
    const idx = inv.slots().findIndex((s) => s?.item === 'niji');
    expect(inv.slots()[idx]?.power).toBe(8);
    const data = JSON.parse(JSON.stringify(inv.serialize()));
    const b = new InventoryImpl();
    b.deserialize(data);
    expect(b.slots()[idx]).toEqual({ item: 'niji', count: 1, power: 8 });
    // 持ち上げ(カーソル)のまま 保存しても もどる
    inv.setCursor({ item: 'niji', count: 1, power: 5 });
    const c = new InventoryImpl();
    c.deserialize(JSON.parse(JSON.stringify(inv.serialize())));
    expect(c.slots().filter((s) => s?.item === 'niji').map((s) => s!.power).sort()).toEqual([5, 8]);
  });
  it('前の 保存（power なし）は そのまま 読める。おかしい 値は おさめる', () => {
    const inv = new InventoryImpl();
    const slots = Array.from({ length: inv.size }, () => null) as unknown[];
    slots[0] = { item: 'niji', count: 1 };
    slots[1] = { item: 'niji', count: 1, power: 'x' };
    slots[2] = { item: 'niji', count: 1, power: 77 };
    inv.deserialize({ slots, selected: 0 });
    expect(powers(inv).slice(0, 3)).toEqual([undefined, undefined, 10]);
  });
  it('setSlot でも power を もつ', () => {
    const inv = new InventoryImpl();
    inv.setSlot(3, { item: 'niji', count: 1, power: 6 });
    expect(inv.slots()[3]?.power).toBe(6);
  });
});

describe('地面の 袋・たんす', () => {
  it('袋(scatter / throwItem) → 保存 → 読む → 拾う で power が かわらない', () => {
    const world = new W();
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) world.setBlock(x, 8, z, 'stone');
    const inv = new InventoryImpl();
    const player: Vec3 = { x: 10.5, y: 9, z: 10.5 };
    const f = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3) });
    f.scatter(player, [{ item: 'niji', count: 1, power: 4 }], { kind: 'death' });
    f.throwItem({ item: 'niji', count: 1, power: 9 }, 0, 1.62);
    const saved = JSON.parse(JSON.stringify(f.serialize()));
    const g = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3) });
    g.deserialize(saved);
    for (let i = 0; i < 200; i++) g.update(true);
    expect(g.size()).toBe(0);
    expect(inv.slots().filter((s) => s?.item === 'niji').map((s) => s!.power).sort()).toEqual([4, 9]);
  });
  it('たんす: しまう(set / depositFromInventory) → 保存 → こわしたとき でも power', () => {
    const world = new W();
    world.setBlock(5, 5, 5, 'tansu');
    const inv = new InventoryImpl();
    const scattered: ItemStack[][] = [];
    const st = new StorageSystem({
      world,
      inventory: inv,
      player: () => ({ x: 5.5, y: 5, z: 7.5 }),
      scatter: (_p, s) => scattered.push(s),
      inventoryOpen: () => false,
      openScreen: () => {},
      closeScreen: () => {},
    });
    st.set(5, 5, 5, 0, { item: 'niji', count: 1, power: 7 });
    expect(st.get(5, 5, 5)!.slots[0]).toEqual({ item: 'niji', count: 1, power: 7 });
    st.deserialize(JSON.parse(JSON.stringify(st.serialize())));
    expect(st.get(5, 5, 5)!.slots[0]?.power).toBe(7);
    st.broken(5, 5, 5);
    expect(scattered[0]![0]).toEqual({ item: 'niji', count: 1, power: 7 });
  });
});
