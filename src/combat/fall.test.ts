import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { CRAFT_DEFAULTS } from '../craft/config';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { InventoryImpl } from '../inventory/Inventory';
import { fallDamage } from './config';
import { PlayerCombatImpl } from './PlayerCombat';

class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
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

function rig(withArmor?: ('suneate' | 'kabuto' | 'yoroi' | 'kote')[]) {
  const inv = new InventoryImpl();
  const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
  if (withArmor) {
    const pick = (n: string) => (withArmor.includes(n as never) ? n : null);
    armor.set(pick('kabuto') as 'kabuto' | null, pick('yoroi') as 'yoroi' | null, pick('kote') as 'kote' | null, pick('suneate') as 'suneate' | null);
  }
  const player = { position: { x: 5, y: 20, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: inv,
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 20, z: 1, yawDeg: 0, pitchDeg: 0 }),
    armor,
  });
  /** 高さ h だけ落ちて着地する（1 ステップ 0.4 ずつ） */
  const drop = (h: number, water = false) => {
    combat.update();
    player.onGround = false;
    const top = player.position.y;
    while (player.position.y > top - h + 1e-9) {
      player.position.y = Math.max(top - h, player.position.y - 0.4);
      player.inWater = water && player.position.y < top - h + 0.5;
      combat.update();
    }
    player.onGround = !water;
    combat.update();
  };
  return { combat, player, drop, armor };
}

describe('落下ダメージ（プレイヤー）', () => {
  it('式: 3 マスまで 0・4 マスで 1・5 マスで 2', () => {
    expect([0, 1, 3, 3.9, 4, 5, 10].map((h) => fallDamage(h, 3, 1))).toEqual([0, 0, 0, 0, 1, 2, 7]);
  });
  it('3 マス落ちて 0・5 マス落ちて 2', () => {
    const a = rig();
    a.drop(3);
    expect(a.combat.hp()).toBe(20);
    const b = rig();
    b.drop(5);
    expect(b.combat.hp()).toBe(18);
    expect(b.combat.invincibleTicks()).toBeGreaterThan(0); // 点滅
    expect(b.combat.drainEvents().some((e) => e.type === 'fallHurt')).toBe(true);
  });
  it('みず に着地したら 0', () => {
    const r = rig();
    r.drop(8, true);
    expect(r.combat.hp()).toBe(20);
  });
  it('ジャンプの着地（1 マス）は 0。ノックバックなし', () => {
    const r = rig();
    r.drop(1);
    expect(r.combat.hp()).toBe(20);
    const q = rig();
    const x = q.player.position.x;
    q.drop(6);
    expect(q.player.position.x).toBe(x);
  });
  it('すねあては 落下を 2 へらす（4〜5 マスは 0。6 マスは 1）', () => {
    const a = rig(['suneate']);
    a.drop(5);
    expect(a.combat.hp()).toBe(20);
    const b = rig(['suneate']);
    b.drop(6);
    expect(b.combat.hp()).toBe(19);
  });
  it('ほかの防具は落下をへらさない', () => {
    const r = rig(['kabuto', 'yoroi', 'kote']);
    r.drop(5);
    expect(r.combat.hp()).toBe(18);
  });
});

describe('防具の役わり（4 つ × 3 種類）', () => {
  const kinds = ['normal', 'ball'] as const;
  // 受けるダメージ 4 のとき、残る体力: 20 − (4 − へらす量) 。最低 1
  const expected: Record<string, [number, number]> = {
    kabuto: [4, 2],
    yoroi: [2, 4],
    kote: [3, 4],
    suneate: [4, 4],
  };
  for (const item of ['kabuto', 'yoroi', 'kote', 'suneate'] as const) {
    it(`${item}: ふつう / たま`, () => {
      kinds.forEach((k, i) => {
        const r = rig([item]);
        r.combat.damage(4, 'karakasa', { x: 0, y: 20, z: 5 }, k);
        expect(20 - r.combat.hp()).toBe(expected[item]![i]);
      });
    });
  }
  it('最低 1（ふつう・たま）', () => {
    const r = rig(['yoroi']);
    r.combat.damage(2, 'karakasa', { x: 0, y: 20, z: 5 });
    expect(r.combat.hp()).toBe(19);
    const q = rig(['kabuto']);
    q.combat.damage(2, 'chochin', { x: 0, y: 20, z: 5 }, 'ball');
    expect(q.combat.hp()).toBe(19);
  });
});
