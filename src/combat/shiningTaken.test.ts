import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { PlayerCombatImpl } from './PlayerCombat';

/** WEAPON-9 AC31: シャイニング中の 受ける ダメージ 1/3（切り上げ）・落下ダメージなし */
class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded() { return true; }
  loadedBounds() { return { x0: 0, z0: 0, x1: 32, z1: 32 }; }
  getBlock(): BlockId | 'outside' { return 'air'; }
  setBlock() { return true; }
  isSolid() { return false; }
}

function rig(mul: () => number, noFall: () => boolean = () => false) {
  const player = { position: { x: 5, y: 20, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: new InventoryImpl(),
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 20, z: 1, yawDeg: 0, pitchDeg: 0 }),
    takenMul: mul,
    noFall,
  } as never);
  combat.update();
  return { combat, player };
}

describe('受ける ダメージ 1/3（切り上げ）', () => {
  it('1 → 1・2 → 1・3 → 1・4 → 2・16 → 6・0 → 0', () => {
    for (const [dmg, taken] of [[1, 1], [2, 1], [3, 1], [4, 2], [16, 6]] as const) {
      const { combat } = rig(() => 1 / 3);
      const before = combat.hp();
      combat.damage(dmg, 'karakasa', { x: 0, y: 20, z: 0 });
      expect(before - combat.hp(), `${dmg}`).toBe(taken);
    }
  });
  it('倍率 1 なら そのまま', () => {
    const { combat } = rig(() => 1);
    const before = combat.hp();
    combat.damage(3, 'karakasa', { x: 0, y: 20, z: 0 });
    expect(before - combat.hp()).toBe(3);
  });
  it('当たった 合図(playerHit)は 出る・体は はじかれる 設定でも 倍率だけ 変わる', () => {
    const { combat } = rig(() => 1 / 3);
    combat.damage(4, 'karakasa', { x: 0, y: 20, z: 0 });
    const ev = combat.drainEvents().find((e) => e.type === 'playerHit') as { amount: number };
    expect(ev.amount).toBe(2);
  });
});

describe('落下ダメージなし', () => {
  it('noFall の 間は 高い所から 着地しても へらない', () => {
    let nf = true;
    const { combat, player } = rig(() => 1, () => nf);
    player.onGround = false;
    combat.update();
    player.position.y = 5;
    combat.update();
    player.onGround = true;
    const hp = combat.hp();
    combat.update();
    expect(combat.hp()).toBe(hp);
    nf = false;
  });
});
