import { describe, expect, it } from 'vitest';
import type { ItemId, PlayerState, Vec3, WearResult, YokaiEvent, YokaiRayHit, YokaiWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { PlayerCombatImpl } from './PlayerCombat';

/** 東に 距離 dist の ところに 箱が ある 仮の 妖怪 */
class FakeYokai implements YokaiWorld {
  dist = 2;
  damaged: number[] = [];
  list = () => [];
  raycast(_o: Vec3, d: Vec3, max: number): YokaiRayHit | null {
    return d.x > 0.5 && this.dist <= max ? { id: 1, kind: 'karakasa', distance: this.dist } : null;
  }
  damage(id: number) {
    this.damaged.push(id);
  }
  occupies = () => false;
  drainEvents(): YokaiEvent[] {
    return [];
  }
}

function rig(item: ItemId) {
  const world = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
  const player: PlayerState = {
    position: { x: 2.5, y: 9, z: 6.5 },
    velocity: { x: 0, y: 0, z: 0 },
    yawDeg: 90,
    pitchDeg: 0,
    onGround: true,
    inWater: false,
    moving: false,
  };
  const inv = new InventoryImpl();
  inv.setSlot(0, { item, count: 1 });
  inv.select(0);
  const wears: number[] = [];
  inv.wearHeld = (n: number): WearResult | null => {
    wears.push(n);
    return null;
  };
  const yokai = new FakeYokai();
  const combat = new PlayerCombatImpl({
    world,
    player: { get: () => player, set: () => {} },
    inventory: inv,
    yokai: () => yokai,
    spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }),
  });
  return { combat, yokai, wears };
}

const EYE: Vec3 = { x: 2.5, y: 10.62, z: 6.5 };
const EAST: Vec3 = { x: 1, y: 0, z: 0 };

describe('刀の 分かれ道・たいきゅう（WEAPON-2）', () => {
  it('刀を 持つと パンチは 始まらない（false）。照準は 4.5 まで', () => {
    const r = rig('katana');
    r.yokai.dist = 4;
    expect(r.combat.primaryStep(true, EYE, EAST, null)).toBe(false);
    expect(r.combat.hookState().punching).toBe(false);
    expect(r.combat.aimedYokai(EYE, EAST, null)).toBe(1);
    r.yokai.dist = 4.8;
    expect(r.combat.aimedYokai(EYE, EAST, null)).toBeNull();
  });
  it('つるはしで たたいて 当たる → wearHeld(2)、なぎなた → 1、空振りは へらさない', () => {
    for (const [item, n] of [['wood_pickaxe', 2], ['naginata', 1], ['kuwa', 2]] as const) {
      const r = rig(item);
      r.yokai.dist = 1.5;
      r.combat.primaryStep(true, EYE, EAST, null);
      for (let i = 0; i < 60; i++) r.combat.primaryStep(false, EYE, EAST, null);
      expect(r.yokai.damaged).toEqual([1]);
      expect(r.wears).toEqual([n]);
    }
    const m = rig('wood_pickaxe');
    m.yokai.dist = 1.5;
    m.combat.primaryStep(true, EYE, EAST, null);
    m.yokai.dist = 99;
    for (let i = 0; i < 60; i++) m.combat.primaryStep(false, EYE, EAST, null);
    expect(m.wears).toEqual([]);
  });
});
