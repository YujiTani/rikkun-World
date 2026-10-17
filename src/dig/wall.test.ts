import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

/** どこまでも ひろがる 世界（ブロックは 置いた物だけ。足もとの床は なし） */
class W implements VoxelWorld {
  readonly size = { y: 32 };
  blocks = new Map<string, BlockId>();
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 0, z1: 0 };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (y < 0 || y >= 32) return 'outside';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'outside' && b !== 'air' && b !== 'water';
  }
}

function rig(px: number, pz: number, yawDeg: number) {
  const world = new W();
  const actions = new ActionState();
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const player: PlayerState = {
    position: { x: px, y: 9, z: pz },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
    facingDeg: 0,
    running: false,
  };
  const dig = new DigSystemImpl(world, () => player, actions, lock, new InventoryImpl(), () => 1.62, createDigConfig(), () => 0);
  const look = () => {
    dig.update();
    actions.endFrame();
  };
  return { world, dig, look };
}

describe('見えない壁と ほる・おく（VOX-D W4）', () => {
  it('壁の中の いちばんはしのマス (29999) は ねらえる', () => {
    const r = rig(29996.5, 0.5, 90);
    r.world.setBlock(29999, 10, 0, 'dirt');
    r.look();
    expect(r.dig.target()?.block).toEqual({ x: 29999, y: 10, z: 0 });
  });
  it('壁の外のマス (30000) は ねらえない（ほれない）', () => {
    const r = rig(29996.5, 0.5, 90);
    r.world.setBlock(30000, 10, 0, 'dirt');
    r.look();
    expect(r.dig.target()).toBeNull();
  });
  it('西・北・南の外も ねらえない', () => {
    const w = rig(-29996.5, 0.5, 270);
    w.world.setBlock(-30001, 10, 0, 'dirt');
    w.look();
    expect(w.dig.target()).toBeNull();
    const n = rig(0.5, -29996.5, 0);
    n.world.setBlock(0, 10, -30001, 'dirt');
    n.look();
    expect(n.dig.target()).toBeNull();
    const s = rig(0.5, 29996.5, 180);
    s.world.setBlock(0, 10, 30000, 'dirt');
    s.look();
    expect(s.dig.target()).toBeNull();
  });
});
