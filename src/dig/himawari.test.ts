import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/**
 * #187-AC7（ひまわり）: 2 段で立つ・上が ふさがっていると 置けない（へらない）・どちらの段を こわしても 2 段とも消えて 1 こ（VOX-I §2.5・§5）。
 * 名前: ブロック himawari（下）・himawari_top（上）、アイテム himawari。houseBlocks.test.ts の 戸と 同じ組み立て。
 */
const HIM = 'himawari' as string as BlockId;
const TOP = 'himawari_top' as string as BlockId;
const HIM_ITEM = 'himawari' as string as ItemId;

class FakeWorld implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < 64 && z < 64;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
  blocks = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    if (this.getBlock(x, y, z) === 'outside') return false;
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water' && b !== HIM && b !== TOP;
  }
}

class Rig {
  world = new FakeWorld();
  actions = new ActionState();
  inv = new InventoryImpl();
  player: PlayerState = { position: { x: 6.5, y: 9, z: 10.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 90, pitchDeg: -35, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  dig = new DigSystemImpl(this.world, () => this.player, this.actions, this.lock, this.inv, () => 1.62, createDigConfig(), () => 0);
  constructor() {
    for (let x = 0; x <= 20; x++) for (let z = 0; z <= 20; z++) this.world.setBlock(x, 8, z, 'stone');
    this.step();
  }
  step(n = 1) {
    for (let i = 0; i < n; i++) {
      this.dig.update();
      this.actions.endFrame();
    }
  }
  hold(count: number) {
    this.inv.clear();
    this.inv.setSlot(0, { item: HIM_ITEM, count });
    this.inv.select(0);
    this.step();
  }
  rightClick() {
    this.actions.press('secondary');
    this.step();
    this.actions.release('secondary');
    this.step();
  }
  breakAimed() {
    this.actions.press('primary');
    for (let i = 0; i < 900 && !this.dig.state().ready; i++) this.step();
    this.actions.release('primary');
    this.actions.press('primary');
    this.step();
    this.actions.release('primary');
    this.step();
  }
}

const placed = () => {
  const r = new Rig();
  r.hold(2);
  const p = r.dig.target()!.place;
  r.rightClick();
  return { r, p };
};

describe('#187-AC7: ひまわり（2 段）', () => {
  it('置くと 下が himawari・上が himawari_top。1 つ へる', () => {
    const { r, p } = placed();
    expect(r.world.getBlock(p.x, p.y, p.z)).toBe(HIM);
    expect(r.world.getBlock(p.x, p.y + 1, p.z)).toBe(TOP);
    expect(r.inv.count(HIM_ITEM)).toBe(1);
  });

  it('上の 1 マスが ふさがって いたら 置けない（へらない）', () => {
    const r = new Rig();
    r.hold(1);
    const p = r.dig.target()!.place;
    r.world.setBlock(p.x, p.y + 1, p.z, 'stone');
    r.rightClick();
    expect(r.world.getBlock(p.x, p.y, p.z)).toBe('air');
    expect(r.inv.count(HIM_ITEM)).toBe(1);
  });

  for (const half of ['下', '上'] as const) {
    it(`${half}の 段を こわしても 2 段とも消えて himawari 1 こ`, () => {
      const { r, p } = placed();
      r.inv.clear();
      r.inv.select(0);
      r.player.position = { x: p.x - 2.5, y: 9, z: p.z + 0.5 };
      r.player.pitchDeg = half === '上' ? -3 : -24;
      r.step();
      expect(r.dig.target()?.block, `${half}を ねらう`).toEqual({ x: p.x, y: half === '上' ? p.y + 1 : p.y, z: p.z });
      r.breakAimed();
      expect(r.world.getBlock(p.x, p.y, p.z)).toBe('air');
      expect(r.world.getBlock(p.x, p.y + 1, p.z)).toBe('air');
      expect(r.inv.count(HIM_ITEM)).toBe(1);
    });
  }
});
