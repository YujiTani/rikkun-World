import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, Vec3 } from '../contracts';
import { CRAFT_DEFAULTS } from '../craft/config';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { CraftSystemImpl } from '../craft/CraftSystem';
import { DropField } from '../drops';
import { InventoryImpl } from '../inventory/Inventory';
import { createCombatConfig } from './config';
import { PlayerCombatImpl } from './PlayerCombat';

/** ITEM-FX-1 AC11〜AC13: おまもり。約束は docs/tickets/ITEM-FX-1-contract.md §6 */

class W {
  blocks = new Map<string, BlockId>();
  size = { x: 64, y: 32, z: 64 };
  isLoaded(): boolean {
    return true;
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    if (y < 8) return 'stone';
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(x, y, z);
    return b !== 'air' && b !== 'water' && b !== 'outside';
  }
}

/** rng が 0 = かならず 落とす（おまもりが なければ ぜんぶ 落ちる） */
function rig() {
  const world = new W();
  const inv = new InventoryImpl();
  const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
  const player = { position: { x: 20.5, y: 8, z: 20.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const drops = new DropField({ world: world as never, inventory: inv, player: () => player.position });
  const combat = new PlayerCombatImpl({
    world: world as never,
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: inv,
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1.5, y: 8, z: 1.5, yawDeg: 0, pitchDeg: 0 }),
    config: createCombatConfig(),
    rng: () => 0,
    drops,
    armor,
  });
  return { world, inv, armor, player, drops, combat };
}

describe('おまもりでやられても落とさない（AC11・AC12）', () => {
  it('持ち物のどこかにあれば、持ち物も防具も 1 つも落とさない。おまもりは やぶれた おまもり 1 つに変わる', () => {
    const r = rig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.inv.setSlot(7, { item: 'stone', count: 3 });
    r.inv.setSlot(r.inv.size - 1, { item: 'omamori', count: 1 }); // 持ち物の はしでもよい
    r.inv.select(0);
    r.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    r.combat.setHp(0);
    expect(r.combat.dead()).toBe(true);
    expect(r.combat.bags()).toEqual([]);
    expect(r.inv.count('dirt')).toBe(5);
    expect(r.inv.count('stone')).toBe(3);
    expect(r.armor.snapshot()).toMatchObject({ head: 'kabuto', body: 'yoroi', arms: 'kote', legs: 'suneate' });
    expect(r.inv.count('omamori')).toBe(0);
    expect(r.inv.count('omamori_torn' as never)).toBe(1);
    const ev = r.combat.takeHookEvents().find((e) => e.type === 'death') as { dropped: number[]; protectedBy?: string };
    expect(ev.dropped).toEqual([]);
    expect(ev.protectedBy).toBe('omamori');
  });
  it('えらんでいるマスが おまもりでも 守る。復活したあとは 効果なし（もう おまもりが ない）', () => {
    const r = rig();
    r.inv.setSlot(0, { item: 'omamori', count: 1 });
    r.inv.setSlot(1, { item: 'dirt', count: 5 });
    r.inv.select(0);
    r.combat.setHp(0);
    expect(r.combat.bags()).toEqual([]);
    expect(r.inv.count('dirt')).toBe(5);
    expect(r.inv.count('omamori_torn' as never)).toBe(1);
    for (let i = 0; i < 130; i++) r.combat.update();
    expect(r.combat.dead()).toBe(false);
    r.inv.select(0); // やぶれた おまもり を 持っていても 守らない
    r.combat.setHp(0);
    expect(r.combat.bags().length).toBeGreaterThan(0); // 今度は 落ちる（えらんでいない dirt）
    expect(r.inv.count('dirt')).toBe(0);
  });
  it('やぶれた おまもり だけでは 守らない。おまもりが なければ いつもどおり 落とす', () => {
    const r = rig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.inv.setSlot(1, { item: 'omamori_torn' as never, count: 1 });
    r.inv.select(2);
    r.armor.set('kabuto', null);
    r.combat.setHp(0);
    const items = r.combat.bags().map((b) => b.slots[0].item).sort();
    expect(items).toEqual(['dirt', 'kabuto', 'omamori_torn']);
    const ev = r.combat.takeHookEvents().find((e) => e.type === 'death') as { protectedBy?: string };
    expect(ev.protectedBy).toBeUndefined();
  });
});

describe('おまもりは持ち物全体で 1 つだけ（AC13）', () => {
  it('落ちているおまもりは、もう持っていると 拾えない（地面に残る）。持っていなければ 拾える', () => {
    const settle = (hasOne: boolean) => {
      const r = rig();
      if (hasOne) r.inv.setSlot(3, { item: 'omamori', count: 1 });
      r.drops.scatter({ x: 20.5, y: 8, z: 20.5 }, [{ item: 'omamori', count: 1 }]);
      for (let i = 0; i < 400; i++) {
        const b = r.drops.list()[0];
        if (b) r.player.position = { x: b.position.x, y: b.position.y, z: b.position.z } as Vec3; // 足もとへ 寄る
        r.drops.update(true);
      }
      return r;
    };
    const have = settle(true);
    expect(have.inv.count('omamori')).toBe(1);
    expect(have.drops.list().some((b) => b.slots.some((s) => s.item === 'omamori'))).toBe(true);
    const none = settle(false);
    expect(none.inv.count('omamori')).toBe(1);
    expect(none.drops.list()).toEqual([]);
  });
});

describe('おまもりの作る（AC13・AC14）', () => {
  function craftRig() {
    const world = new W();
    const inv = new InventoryImpl();
    const scattered: ItemStack[] = [];
    const craft = new CraftSystemImpl({ world, inventory: inv, drops: { scatter: (_p: Vec3, s: readonly ItemStack[]) => (scattered.push(...s), 0) } });
    return { inv, craft };
  }
  const give = (inv: InventoryImpl) => {
    inv.add('crystal', 3);
    inv.add('kin', 1);
    inv.add('cloth', 2);
    inv.add('string', 2);
  };
  it('材料がそろうと作れて、材料がへる', () => {
    const { inv, craft } = craftRig();
    give(inv);
    expect(craft.status('omamori').craftable).toBe(true);
    expect(craft.make('omamori')).toMatchObject({ ok: true, reason: null });
    expect(inv.count('omamori')).toBe(1);
    expect(inv.count('crystal') + inv.count('kin') + inv.count('cloth') + inv.count('string')).toBe(0);
  });
  it('材料が 1 つ足りないと 作れない', () => {
    const { inv, craft } = craftRig();
    give(inv);
    inv.remove('string', 1);
    expect(craft.status('omamori').craftable).toBe(false);
    expect(craft.make('omamori').reason).toBe('missing');
  });
  it('もう 1 つ持っていると 作れない（理由 haveOne）。持ち物は変わらない', () => {
    const { inv, craft } = craftRig();
    give(inv);
    inv.setSlot(inv.size - 1, { item: 'omamori', count: 1 });
    const st = craft.status('omamori') as { craftable: boolean; limit?: string };
    expect(st.craftable).toBe(false);
    expect(st.limit).toBe('haveOne');
    const before = JSON.stringify(inv.slots());
    const res = craft.make('omamori');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('haveOne');
    expect(JSON.stringify(inv.slots())).toBe(before);
    // ほかの物は ふつうに 作れる（制限は おまもり だけ）
    expect((craft.status('torch') as { limit?: string }).limit).toBeUndefined();
  });
});
