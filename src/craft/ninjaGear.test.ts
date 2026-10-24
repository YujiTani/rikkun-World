import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, VoxelWorld } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { ARMOR_SLOT_OF, CRAFT_DEFAULTS, NINJA_GEAR } from './config';
import { ArmorSystemImpl } from './ArmorSystem';
import { CRAFT_RECIPES } from './recipes';
import { NINJA_TUNING } from './ninjaTuning';
import { oxygenDrainMul } from './ninjaPower';
import { InventoryImpl } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ITEM_INFO } from './info/table';
import { itemCategory } from '../ui/itemCategory';
import { itemIconPixels } from '../ui/itemIcon';
import { maxDurability } from '../tools/durability';
import { PlayerCombatImpl } from '../combat/PlayerCombat';

/**
 * NINJA-1（#299）AC1〜AC6: 忍者装備 4 つ の もちもの・名前・防具の マス・たいきゅう・ふせぐ 量・足袋・黒頭巾。
 * 実装 の 前 の テスト（赤）。窓口 の 形: `NINJA_GEAR`（config.ts）・`NINJA_TUNING`（ninjaTuning.ts）・`oxygenDrainMul(armor)`（ninjaPower.ts）。
 */
const GEAR = { head: 'ninja_zukin', body: 'ninja_shozoku', arms: 'ninja_tekko', legs: 'ninja_tabi' } as const;
const IDS = Object.values(GEAR) as ItemId[];

class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z; }
  loadedBounds() { return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z }; }
  getBlock(): BlockId | 'outside' { return 'air'; }
  setBlock() { return true; }
  isSolid() { return false; }
}

/** 4 マス に 着せて 返す（null = 着ない） */
function rig(worn: Partial<Record<'head' | 'body' | 'arms' | 'legs', ItemId>> = {}) {
  const inv = new InventoryImpl();
  const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
  armor.set(worn.head ?? null, worn.body ?? null, worn.arms ?? null, worn.legs ?? null);
  const player = { position: { x: 5, y: 20, z: 5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
  const combat = new PlayerCombatImpl({
    world: new W(),
    player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
    inventory: inv,
    yokai: () => ({ occupies: () => false }) as never,
    spawn: () => ({ x: 1, y: 20, z: 1, yawDeg: 0, pitchDeg: 0 }),
    armor,
  });
  /** 高さ h だけ 落ちて 着地（1 ステップ 0.4 ずつ。出だしの 高さは 十分 たかく） */
  const drop = (h: number) => {
    player.position.y = h + 40;
    combat.update();
    player.onGround = false;
    const top = player.position.y;
    while (player.position.y > top - h + 1e-9) {
      player.position.y = Math.max(top - h, player.position.y - 0.4);
      combat.update();
    }
    player.onGround = true;
    combat.update();
  };
  const hurt = (kind: 'normal' | 'ball' | 'fall' | undefined, amount = 4) => {
    combat.damage(amount, 'karakasa', { x: 0, y: 20, z: 5 }, kind as never);
    return 20 - combat.hp();
  };
  return { inv, armor, combat, player, drop, hurt };
}

describe('AC1 4 つ の id・名前・説明', () => {
  const names: Record<string, string> = {
    ninja_zukin: '［黒頭巾｜くろずきん］',
    ninja_shozoku: '［忍｜しの］び［装束｜しょうぞく］',
    ninja_tekko: '［忍｜しの］びの ［手甲｜てっこう］',
    ninja_tabi: '［忍｜しの］びの ［足袋｜たび］',
  };
  const use: Record<string, string> = {
    ninja_zukin: 'こうげき から まもる（あたま）',
    ninja_shozoku: 'こうげき から まもる（からだ）',
    ninja_tekko: 'こうげき から まもる（うで）',
    ninja_tabi: 'こうげき から まもる（あし）',
  };
  for (const id of IDS) {
    it(`${id}: maxStack 1・名前・legendary・armor・説明・絵 256`, () => {
      const t = itemType(id);
      expect(t, id).toBeDefined();
      expect(t!.maxStack).toBe(1);
      expect(t!.name).toBe(names[id]);
      expect(t!.name).not.toContain('忍者'); // 足袋は「忍者の足袋」から かわった
      expect(itemRarity(id)).toBe('legendary');
      expect(itemCategory(id)).toBe('armor');
      expect(ITEM_INFO[id]?.stats).toBe('armor');
      expect(ITEM_INFO[id]?.use).toBe(use[id]);
      expect(itemIconPixels(id)).toHaveLength(256);
    });
  }
});

describe('AC2 防具の マス・作れない', () => {
  it('NINJA_GEAR が 4 マス、ARMOR_SLOT_OF が zukin→head・shozoku→body・tekko→arms・tabi→legs', () => {
    expect(NINJA_GEAR).toEqual(GEAR);
    expect(ARMOR_SLOT_OF.ninja_zukin).toBe('head');
    expect(ARMOR_SLOT_OF.ninja_shozoku).toBe('body');
    expect(ARMOR_SLOT_OF.ninja_tekko).toBe('arms');
    expect(ARMOR_SLOT_OF.ninja_tabi).toBe('legs');
  });
  it('CRAFT_RECIPES に 4 つ とも 出て こない（作る 表・材料 どちらにも）', () => {
    for (const r of CRAFT_RECIPES) {
      expect(IDS, r.id).not.toContain(r.output.item);
      for (const i of r.inputs) expect(IDS, r.id).not.toContain(i.item);
    }
  });
  it('持ち物から 着て ぬぐと それぞれの マス（すねあて などと 同じ マス で 入れかわる）', () => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    const slots = ['head', 'body', 'arms', 'legs'] as const;
    IDS.forEach((id, i) => {
      expect(armor.slotFor(id)).toBe(slots[i]);
      inv.setSlot(i, { item: id, count: 1 });
      expect(armor.equipFromSlot(i), id).toBe(true);
      expect(armor.equipped(slots[i]!)).toBe(id);
    });
    armor.set(null, null, null, 'suneate');
    expect(armor.equipped('legs')).toBe('suneate');
  });
});

describe('AC3 たいきゅう 10000', () => {
  it('maxDurability が 4 つ とも 10000（足袋 の 390 から かわる）', () => {
    for (const id of IDS) expect(maxDurability(id, W2_SETTING_DEFAULTS.toolDurability), id).toBe(10000);
  });
});

describe('AC4 ふせぐ 量', () => {
  it('黒頭巾: ball 4 → 2、なし → 4。normal・fall は へらさない', () => {
    expect(rig().hurt('ball')).toBe(4);
    expect(rig({ head: 'ninja_zukin' }).hurt('ball')).toBe(2);
    expect(rig({ head: 'ninja_zukin' }).hurt('normal')).toBe(4);
    const r = rig({ head: 'ninja_zukin' });
    r.drop(6);
    expect(r.combat.hp(), '落下 6 マス は 3 マス ぶんの 3 のまま').toBe(17);
  });
  it('忍び装束: normal 4 → 2（ball は へらさない）', () => {
    expect(rig({ body: 'ninja_shozoku' }).hurt('normal')).toBe(2);
    expect(rig({ body: 'ninja_shozoku' }).hurt('ball')).toBe(4);
  });
  it('忍びの手甲: normal 4 → 3', () => {
    expect(rig({ arms: 'ninja_tekko' }).hurt('normal')).toBe(3);
    expect(rig({ arms: 'ninja_tekko' }).hurt('ball')).toBe(4);
  });
  it('足袋: normal・ball は へらさない', () => {
    expect(rig({ legs: 'ninja_tabi' }).hurt('normal')).toBe(4);
    expect(rig({ legs: 'ninja_tabi' }).hurt('ball')).toBe(4);
  });
  it('表（armorValue）: 忍び装束 normal 2・手甲 normal 1・頭巾 ball 2', () => {
    const v = CRAFT_DEFAULTS.armorValue;
    expect(v.ninja_zukin).toEqual({ normal: 0, ball: 2, fall: 0 });
    expect(v.ninja_shozoku).toEqual({ normal: 2, ball: 0, fall: 0 });
    expect(v.ninja_tekko).toEqual({ normal: 1, ball: 0, fall: 0 });
    expect(v.ninja_tabi!.normal).toBe(0);
    expect(v.ninja_tabi!.ball).toBe(0);
  });
});

describe('AC5 足袋: 落ちても ダメージ 0', () => {
  it('高さ 5・20・200 から 落ちても 体力 20 の まま・fallHurt なし', () => {
    for (const h of [5, 20, 200]) {
      const r = rig({ legs: 'ninja_tabi' });
      r.drop(h);
      expect(r.combat.hp(), `高さ ${h}`).toBe(20);
      expect(r.combat.drainEvents().some((e) => e.type === 'fallHurt'), `高さ ${h}`).toBe(false);
    }
  });
  it('ぬいで 高さ 20 から 落ちると ダメージが 出る', () => {
    const r = rig({ legs: 'ninja_tabi' });
    r.armor.set(null, null, null, null);
    r.drop(20);
    expect(r.combat.hp()).toBeLessThan(20);
    expect(r.combat.drainEvents().some((e) => e.type === 'fallHurt')).toBe(true);
  });
  it('足袋の fall は #298 の 99 より 大きい（高さ 102 の 落下でも 0）', () => {
    expect(CRAFT_DEFAULTS.armorValue.ninja_tabi!.fall).toBeGreaterThan(99);
  });
});

describe('AC6 黒頭巾: 酸素 の へり の 倍率', () => {
  const wearing = (...ids: (ItemId | null)[]) => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    armor.set(ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null);
    return armor;
  };
  it('頭巾 を 着て 0.5。着て いない・ほかの 忍者装備 だけ・ふつうの かぶと は 1', () => {
    expect(oxygenDrainMul(wearing('ninja_zukin'))).toBe(0.5);
    expect(oxygenDrainMul(wearing())).toBe(1);
    expect(oxygenDrainMul(wearing(null, 'ninja_shozoku', 'ninja_tekko', 'ninja_tabi'))).toBe(1);
    expect(oxygenDrainMul(wearing('kabuto'))).toBe(1);
  });
  it('数は 調整表 の zukinOxygenDrainMul（0.5）。0.25 に する と 0.25', () => {
    expect(NINJA_TUNING.zukinOxygenDrainMul).toBe(0.5);
    const saved = NINJA_TUNING.zukinOxygenDrainMul;
    try {
      NINJA_TUNING.zukinOxygenDrainMul = 0.25;
      expect(oxygenDrainMul(wearing('ninja_zukin'))).toBe(0.25);
      expect(oxygenDrainMul(wearing())).toBe(1);
    } finally {
      NINJA_TUNING.zukinOxygenDrainMul = saved;
    }
  });
  it('調整表 の 数（手甲 12 ステップ・5・待ち 16、宝箱 0.003）', () => {
    expect(NINJA_TUNING).toMatchObject({ tekkoDelayTicks: 12, tekkoDamage: 5, tekkoQueueMax: 16, ninjaChestChance: 0.003 });
  });
});
