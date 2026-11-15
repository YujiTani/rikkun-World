import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerCombatImpl } from './PlayerCombat';

/**
 * TOWN-1 1C（1.3。TOWN-1-shop §2.6 の 7・TOWN-1 §2.9）: 2 人で よろずやの 画面を 開いて いる 人は その場に 止まり、妖怪の こうげきは 当たって ハートが へる（押されない）。
 * 窓口: PlayerCombat の deps `holdStill?(): boolean`（true の あいだ 押されない・はねない。ダメージは 外と 同じ）。
 */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z; }
  loadedBounds() { return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z }; }
  getBlock(): BlockId | 'outside' { return 'air'; }
  setBlock() { return true; }
  isSolid() { return false; }
}

function rig(hold: boolean) {
  const player = { position: { x: 5, y: 20, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => { Object.assign(player.position, v.position ?? {}); Object.assign(player.velocity, v.velocity ?? {}); } },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 20, z: 1, yawDeg: 0, pitchDeg: 0 }),
    holdStill: () => hold,
  });
  combat.update();
  return { combat, player };
}

function hit(r: ReturnType<typeof rig>) {
  const p0 = { ...r.player.position };
  const hp0 = r.combat.hp();
  r.combat.damage(2, 'karakasa', { x: p0.x, y: p0.y, z: p0.z - 3 });
  const vy = r.player.velocity.y;
  for (let i = 0; i < 20; i++) r.combat.update();
  return { moved: Math.hypot(r.player.position.x - p0.x, r.player.position.z - p0.z), vy, lost: hp0 - r.combat.hp() };
}

describe('holdStill（よろずやを 開いて いる 人）', () => {
  it('true の あいだ 押されない・はねない。ハートは 外と 同じ 数 へる', () => {
    const out = hit(rig(false));
    const shop = hit(rig(true));
    expect(out.moved).toBeGreaterThan(1);
    expect(shop.moved).toBe(0);
    expect(shop.vy).toBe(0);
    expect(shop.lost).toBe(out.lost);
    expect(shop.lost).toBeGreaterThan(0);
  });
});
