import { describe, expect, it } from 'vitest';
import type { BlockId, LockStatus, PlayerState, VoxelWorld } from '../contracts';
import { aimPivot } from '../camera/pivot';
import { ActionState } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { createDigConfig } from './config';
import { DigSystemImpl } from './DigSystem';

class W implements VoxelWorld {
  readonly size = { x: 64, y: 32, z: 64 };
  isSolid(_x: number, y: number): boolean {
    return y <= 8;
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (x < 0 || y < 0 || z < 0 || x >= 64 || y >= 32 || z >= 64) return 'outside';
    return y <= 8 ? 'dirt' : 'air';
  }
  setBlock(): boolean {
    return true;
  }
}

/** AC13: 肩の点 S から線、届く距離は P から（x0 = 10, G = 9, z0 = 6、yaw 0） */
function aimAt(pitchDeg: number) {
  const world = new W();
  const player: PlayerState = {
    position: { x: 10.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 0,
    pitchDeg,
    onGround: true,
    inWater: false,
    moving: false, facingDeg: 0, running: false,
  };
  const lock: LockStatus = { locked: () => true, overlayVisible: () => false, realtimeAllowed: () => true, playInputEnabled: () => true };
  const dig = new DigSystemImpl(world, () => player, new ActionState(), lock, new InventoryImpl(), () => 1.62, createDigConfig());
  dig.aimOrigin = (p, out) => {
    const s = 0.7 * Math.cos((p.pitchDeg * Math.PI) / 180);
    out.x = p.position.x + s;
    out.y = p.position.y + 1.4;
    out.z = p.position.z;
    return out;
  };
  dig.reachOrigin = (p, out) => aimPivot(world, p.position, out);
  dig.update();
  return dig.target();
}

describe('AC13: S から線・P から距離', () => {
  it.each([
    [-25, { x: 11, y: 8, z: 3 }],
    [-30, { x: 11, y: 8, z: 4 }],
    [-20, { x: 11, y: 8, z: 2 }],
    [-89, { x: 10, y: 8, z: 6 }],
  ])('pitch %d', (pitch, block) => {
    expect(aimAt(pitch)?.block).toEqual(block);
  });
  it('pitch -15 は ねらいなし（P から 5.68 で届かない）', () => {
    expect(aimAt(-15)).toBeNull();
  });
  it('置く場所は ねらった地面の上（AC14 の place）', () => {
    expect(aimAt(-25)?.place).toEqual({ x: 11, y: 9, z: 3 });
  });
});
