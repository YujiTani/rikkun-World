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

function rig(scorched: () => boolean = () => false) {
  const player = { position: { x: 1, y: 1, z: 1 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, inMagma: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => { Object.assign(player.position, v.position ?? {}); Object.assign(player.velocity, v.velocity ?? {}); } },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 1, z: 1, yawDeg: 0, pitchDeg: 0 }),
    scorched,
  });
  return { combat, player };
}

describe('マグマの ダメージ', () => {
  it('ふれて いなければ 0', () => {
    const r = rig();
    for (let i = 0; i < 120; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20);
  });
  it('はいった すぐ 1、むてき（1 秒）が きれたら すぐ 次（hurtEvery 30 より むてき 60 が 長い ので 1 秒に 1）。でると 止まる', () => {
    const r = rig();
    r.player.inMagma = true;
    r.combat.update();
    expect(r.combat.hp()).toBe(20 - MAGMA_TUNING.hurtAmount);
    for (let i = 1; i < MAGMA_TUNING.heatInvincibleTicks * 2; i++) r.combat.update();
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
  it('WAKIDOKORO §7: マグマと こげた ブロックの 両方でも むてき（共用）で 1 秒に 1 回 まで', () => {
    const r = rig(() => true);
    r.player.inMagma = true;
    for (let i = 0; i < MAGMA_TUNING.heatInvincibleTicks; i++) r.combat.update();
    expect(r.combat.hp()).toBe(20 - 1);
  });
});

describe('WAKIDOKORO §7（ゆず 変更）: 熱の ダメージは むてき 1 秒・ノックバック なし', () => {
  it('受けると むてき heatInvincibleTicks（60 = 1 秒）。1 秒の 間は 1 回だけ', () => {
    expect(MAGMA_TUNING.heatInvincibleTicks).toBe(60);
    const r = rig();
    r.player.inMagma = true;
    r.combat.update();
    expect(r.combat.invincibleTicks()).toBe(60);
    for (let i = 1; i < 60; i++) r.combat.update();
    expect(r.combat.hp(), '1 秒の 間は 1 回だけ').toBe(19);
  });
  it('マグマ・こげた ブロックでも おされない（場所も 上向きの 速さも かわらない）', () => {
    for (const scorched of [false, true]) {
      const r = rig(() => scorched);
      if (!scorched) r.player.inMagma = true;
      const p0 = { ...r.player.position };
      for (let i = 0; i < 8; i++) r.combat.update();
      expect(r.player.position).toEqual(p0);
      expect(r.player.velocity.y).toBeLessThanOrEqual(0);
      expect(r.combat.hp()).toBe(19);
    }
  });
});
