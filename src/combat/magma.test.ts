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

function rig(scorched: () => boolean = () => false, heatFrom?: () => { x: number; y: number; z: number } | null) {
  const player = { position: { x: 1, y: 1, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, inMagma: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => { Object.assign(player.position, v.position ?? {}); Object.assign(player.velocity, v.velocity ?? {}); } },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 1, z: 1, yawDeg: 0, pitchDeg: 0 }),
    scorched,
    ...(heatFrom ? { heatFrom } : {}),
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

describe('版 2: こげた ブロックの ダメージ（1 秒に 1。マグマとは べつ）', () => {
  it('ふれた すぐ 1、scorchHurtEvery ごとに 1。はなれると 止まる', () => {
    let on = true;
    const r = rig(() => on);
    r.combat.update();
    expect(r.combat.hp()).toBe(20 - MAGMA_TUNING.scorchHurtAmount);
    for (let i = 1; i < MAGMA_TUNING.scorchHurtEvery; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20 - MAGMA_TUNING.scorchHurtAmount);
    r.combat.update();
    expect(r.combat.hp()).toBe(20 - 2 * MAGMA_TUNING.scorchHurtAmount);
    on = false;
    for (let i = 0; i < 200; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20 - 2 * MAGMA_TUNING.scorchHurtAmount);
  });
  it('WAKIDOKORO §7: マグマと こげた ブロックの 両方でも むてき（共用）で 0.5 秒に 1 回 まで', () => {
    const r = rig(() => true);
    r.player.inMagma = true;
    for (let i = 0; i < MAGMA_TUNING.scorchHurtEvery; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20 - 2);
  });
});

describe('WAKIDOKORO §7: 熱の ダメージの ノックバック・むてき 0.5 秒', () => {
  it('受けると むてき heatInvincibleTicks（30 = 0.5 秒）。妖怪の むてき（90）より みじかい', () => {
    expect(MAGMA_TUNING.heatInvincibleTicks).toBe(30);
    const r = rig();
    r.player.inMagma = true;
    r.combat.update();
    expect(r.combat.invincibleTicks()).toBe(30);
    for (let i = 1; i < 30; i++) r.combat.update();
    expect(r.combat.hp(), '0.5 秒の 間は 1 回だけ').toBe(19);
  });
  it('ダメージ源から はなれる 向きに おされる（源が 西なら 東へ）・上にも はねる', () => {
    const r = rig(() => false, () => ({ x: 0.2, y: 1, z: 1 }));
    r.player.inMagma = true;
    const x0 = r.player.position.x;
    for (let i = 0; i < 8; i++) r.combat.update();
    expect(r.player.position.x).toBeGreaterThan(x0);
    expect(r.player.velocity.y).toBeGreaterThan(0);
  });
  it('こげた ブロックでも おされる（源が 北なら 南 = +z へ）', () => {
    const r = rig(() => true, () => ({ x: 1, y: 1, z: 0.2 }));
    const z0 = r.player.position.z;
    for (let i = 0; i < 8; i++) r.combat.update();
    expect(r.player.position.z).toBeGreaterThan(z0);
    expect(r.combat.hp()).toBe(19);
  });
});
