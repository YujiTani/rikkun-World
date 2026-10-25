import { describe, expect, it } from 'vitest';
import type { BlockId, VoxelWorld } from '../contracts';
import { CRAFT_DEFAULTS } from '../craft/config';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { InventoryImpl } from '../inventory/Inventory';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { itemRarity } from '../drops/rarity';
import { ITEM_INFO } from '../craft/info/table';
import { itemType } from '../inventory/items';
import { itemCategory } from '../ui/itemCategory';
import { itemIconPixels } from '../ui/itemIcon';
import { maxDurability } from '../tools/durability';
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

function rig(withArmor?: ('suneate' | 'kabuto' | 'yoroi' | 'kote' | 'ninja_tabi')[]) {
  const inv = new InventoryImpl();
  const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
  if (withArmor) {
    const pick = (n: string) => (withArmor.includes(n as never) ? n : null);
    const legs = pick('ninja_tabi') ?? pick('suneate');
    armor.set(pick('kabuto') as 'kabuto' | null, pick('yoroi') as 'yoroi' | null, pick('kote') as 'kote' | null, legs as 'suneate' | null);
  }
  const player = { position: { x: 5, y: 20, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
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

describe('忍びの足袋（#293 試作 → NINJA-1 #299・レア装備）', () => {
  it('着ていると どんな高さから落ちても 体力が へらない（NINJA-1 AC5: 99 の 限界を なくし、高さ 200 でも 0）', () => {
    for (const h of [5, 10, 20, 200]) {
      const r = rig(['ninja_tabi']);
      r.player.position.y = h + 40; // 高さ 200 でも 世界の 下に つき抜けない よう 出だしを たかく
      r.drop(h);
      expect(r.combat.hp()).toBe(20);
      expect(r.combat.drainEvents().some((e) => e.type === 'fallHurt')).toBe(false);
    }
  });
  it('すねあてと同じ「あし」のマスに入る（どちらか 1 つ）', () => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    expect(armor.slotFor('ninja_tabi' as never)).toBe('legs');
    armor.set(null, null, null, 'ninja_tabi' as never);
    expect(armor.equipped('legs')).toBe('ninja_tabi');
    armor.set(null, null, null, 'suneate');
    expect(armor.equipped('legs')).toBe('suneate');
  });
  it('持ち物から 着て、脱ぐと また 落下ダメージが 入る', () => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    inv.setSlot(0, { item: 'ninja_tabi' as never, count: 1 });
    expect(armor.equipFromSlot(0)).toBe(true);
    expect(armor.valueOf('fall')).toBeGreaterThanOrEqual(CRAFT_DEFAULTS.armorValue.suneate!.fall);
    expect(armor.unequipToBag('legs')).toBe(true);
    expect(armor.equipped('legs')).toBeNull();
    const r = rig();
    r.drop(10);
    expect(r.combat.hp()).toBe(13);
  });
  it('ふつう・たま は すねあてと 同じ（0）。fall は 99 より 大きい。たいきゅうは 10000（NINJA-1 AC3: 390 から かわる）', () => {
    const t = CRAFT_DEFAULTS.armorValue.ninja_tabi!;
    expect([t.normal, t.ball]).toEqual([0, 0]);
    expect(t.fall).toBeGreaterThan(99);
    expect(maxDurability('ninja_tabi' as never, W2_SETTING_DEFAULTS.toolDurability)).toBe(10000);
  });
  it('名前・めずらしさ・説明・絵が そろっている', () => {
    expect(itemType('ninja_tabi')?.maxStack).toBe(1);
    expect(itemType('ninja_tabi')?.name).toBe('［忍｜しの］びの ［足袋｜たび］'); // NINJA-1: 「忍者の足袋」から かわった
    expect(itemType('ninja_tabi')?.name).not.toContain('忍者');
    expect(itemRarity('ninja_tabi' as never)).toBe('legendary'); // yuzu: レア度 7（7 段目）
    expect(itemCategory('ninja_tabi')).toBe('armor');
    expect(ITEM_INFO.ninja_tabi?.use).toBe('こうげき から まもる（あし）'); // NINJA-1: 「おちても いたく ない」は とくべつな ちから（special）へ
    expect(itemIconPixels('ninja_tabi' as never)).toHaveLength(256);
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
