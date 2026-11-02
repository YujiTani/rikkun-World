import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { MAGMA_TUNING } from '../world/blocks/liquids';
import { PlayerCombatImpl } from './PlayerCombat';

/** WATERFALL-1 §4.5 AC7: マグマに ふれて いる あいだの ダメージ（はいった すぐ 1、そのあと hurtEvery ごとに 1） */
class W implements VoxelWorld {
  readonly size = { x: 8, y: 8, z: 8 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 8, z1: 8 };
  }
  getBlock(): BlockId | 'outside' {
    return 'air';
  }
  setBlock() {
    return true;
  }
  isSolid() {
    return false;
  }
}

function rig() {
  const player = { position: { x: 1, y: 1, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, inMagma: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 1, z: 1, yawDeg: 0, pitchDeg: 0 }),
  });
  return { combat, player };
}

describe('マグマの ダメージ', () => {
  it('ふれて いなければ 0', () => {
    const r = rig();
    for (let i = 0; i < 120; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20);
  });
  it('はいった すぐ 1、hurtEvery ステップごとに 1（むてき中でも）。でると 止まる', () => {
    const r = rig();
    r.player.inMagma = true;
    r.combat.update();
    expect(r.combat.hp()).toBe(20 - MAGMA_TUNING.hurtAmount);
    for (let i = 1; i < MAGMA_TUNING.hurtEvery * 2; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20 - 2 * MAGMA_TUNING.hurtAmount);
    r.combat.update();
    expect(r.combat.hp()).toBe(20 - 3 * MAGMA_TUNING.hurtAmount);
    expect(r.combat.drainEvents().filter((e) => e.type === 'fallHurt').length).toBe(3);
    r.player.inMagma = false;
    for (let i = 0; i < 60; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20 - 3 * MAGMA_TUNING.hurtAmount);
  });
});
