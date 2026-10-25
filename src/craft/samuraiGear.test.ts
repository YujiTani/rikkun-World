import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId, VoxelWorld } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { ARMOR_SLOT_OF, CRAFT_DEFAULTS, NINJA_GEAR, SAMURAI_GEAR } from './config';
import { ArmorSystemImpl } from './ArmorSystem';
import { CRAFT_RECIPES } from './recipes';
import { NINJA_TUNING } from './ninjaTuning';
import { knockbackMulOf } from './samuraiPower';
import { InventoryImpl } from '../inventory/Inventory';
import { itemType } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ITEM_INFO } from './info/table';
import { itemCategory } from '../ui/itemCategory';
import { itemIconPixels } from '../ui/itemIcon';
import { maxDurability } from '../tools/durability';
import { PlayerCombatImpl } from '../combat/PlayerCombat';

/**
 * SAMURAI-1（#300）AC1〜AC3・AC7: 侍装備 4 つ の もちもの・名前・防具の マス・たいきゅう・ふせぐ 量・とばされにくさ の 関数。
 * 実装 の 前 の テスト（赤）。窓口 の 形（NINJA-1 と 同じ 書き方）:
 *   config.ts        `SAMURAI_GEAR = { head, body, arms, legs }`、`ARMOR_SLOT_OF` に 4 つ
 *   ninjaTuning.ts   `NINJA_TUNING`（調整表 1 か所。侍の 行も ここに 足す）に
 *                    jingasaGuardTicks 30 / tekkoBladeMul 1.5 / tekkoDefIgnore 10 / getaStepTicks 30 / getaMinSpeed 1 / samuraiChestChance 0.003 と
 *                    `knockbackMul: { samurai_haori: 0.3 }`（防具ごとの とばされる 距離の 倍率。入れ物 = 数の 表）
 *   samuraiPower.ts  `knockbackMulOf(armor)` = 着て いる 防具の 表の 値の いちばん 小さい 値（なし = 1。0〜1 に おさめる）
 */
const GEAR = { head: 'samurai_jingasa', body: 'samurai_haori', arms: 'samurai_tekko', legs: 'samurai_geta' } as const;
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
    samurai_jingasa: '［明珍｜みょうちん］［陣笠｜じんがさ］',
    samurai_haori: '［明珍｜みょうちん］［羽織｜はおり］',
    samurai_tekko: '［明珍｜みょうちん］［手甲｜てっこう］',
    samurai_geta: '［明珍｜みょうちん］［下駄｜げた］',
  };
  const use: Record<string, string> = {
    samurai_jingasa: 'こうげき から まもる（あたま）',
    samurai_haori: 'こうげき から まもる（からだ）',
    samurai_tekko: 'こうげき から まもる（うで）',
    samurai_geta: 'こうげき から まもる（あし）',
  };
  for (const id of IDS) {
    it(`${id}: maxStack 1・名前・legendary・armor・説明・絵 256`, () => {
      const t = itemType(id);
      expect(t, id).toBeDefined();
      expect(t!.maxStack).toBe(1);
      expect(t!.name).toBe(names[id]);
      expect(itemRarity(id)).toBe('legendary');
      expect(itemCategory(id)).toBe('armor');
      expect(ITEM_INFO[id]?.stats).toBe('armor');
      expect(ITEM_INFO[id]?.use).toBe(use[id]);
      expect(itemIconPixels(id)).toHaveLength(256);
    });
  }
  it('たいきゅう: maxDurability が 4 つ とも 10000', () => {
    for (const id of IDS) expect(maxDurability(id, W2_SETTING_DEFAULTS.toolDurability), id).toBe(10000);
  });
  it('CRAFT_RECIPES に 4 つ とも 出て こない（作る 表・材料 どちらにも。レシピ の 数は かわらない）', () => {
    for (const r of CRAFT_RECIPES) {
      expect(IDS, r.id).not.toContain(r.output.item);
      for (const i of r.inputs) expect(IDS, r.id).not.toContain(i.item);
    }
  });
});

describe('AC2 防具の マス・手甲の 入れかえ', () => {
  it('SAMURAI_GEAR が 4 マス、ARMOR_SLOT_OF が jingasa→head・haori→body・tekko→arms・geta→legs', () => {
    expect(SAMURAI_GEAR).toEqual(GEAR);
    expect(ARMOR_SLOT_OF.samurai_jingasa).toBe('head');
    expect(ARMOR_SLOT_OF.samurai_haori).toBe('body');
    expect(ARMOR_SLOT_OF.samurai_tekko).toBe('arms');
    expect(ARMOR_SLOT_OF.samurai_geta).toBe('legs');
  });
  it('持ち物から 着て ぬぐと それぞれの マス', () => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    const slots = ['head', 'body', 'arms', 'legs'] as const;
    IDS.forEach((id, i) => {
      expect(armor.slotFor(id)).toBe(slots[i]);
      inv.setSlot(i, { item: id, count: 1 });
      expect(armor.equipFromSlot(i), id).toBe(true);
      expect(armor.equipped(slots[i]!)).toBe(id);
    });
  });
  it('samurai_tekko と ninja_tekko は 同じ arms: 片方を 着ると もう 片方は マスから はずれて もちものへ（今の 防具の 入れかえと 同じ）', () => {
    expect(ARMOR_SLOT_OF.samurai_tekko).toBe(ARMOR_SLOT_OF.ninja_tekko);
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    armor.set(null, null, NINJA_GEAR.arms, null);
    inv.setSlot(0, { item: 'samurai_tekko' as ItemId, count: 1 });
    expect(armor.equipFromSlot(0)).toBe(true);
    expect(armor.equipped('arms')).toBe('samurai_tekko');
    expect(inv.slots()[0]?.item, '前の 忍びの手甲は もちものに もどる').toBe('ninja_tekko');
    expect(armor.equipFromSlot(0)).toBe(true);
    expect(armor.equipped('arms')).toBe('ninja_tekko');
    expect(inv.slots()[0]?.item).toBe('samurai_tekko');
  });
});

describe('AC3 ふせぐ 量', () => {
  it('陣笠: ball 4 → 2、なし → 4。normal は へらさない', () => {
    expect(rig().hurt('ball')).toBe(4);
    expect(rig({ head: 'samurai_jingasa' }).hurt('ball')).toBe(2);
    expect(rig({ head: 'samurai_jingasa' }).hurt('normal')).toBe(4);
  });
  it('羽織: normal 4 → 2（ball は へらさない）', () => {
    expect(rig({ body: 'samurai_haori' }).hurt('normal')).toBe(2);
    expect(rig({ body: 'samurai_haori' }).hurt('ball')).toBe(4);
  });
  it('手甲: normal 4 → 3（ball は へらさない）', () => {
    expect(rig({ arms: 'samurai_tekko' }).hurt('normal')).toBe(3);
    expect(rig({ arms: 'samurai_tekko' }).hurt('ball')).toBe(4);
  });
  it('下駄: 高さ 8 の 落下 5 → 3（なしは 5）。normal・ball は へらさない', () => {
    const a = rig();
    a.drop(8);
    expect(20 - a.combat.hp(), '下駄なし').toBe(5);
    const b = rig({ legs: 'samurai_geta' });
    b.drop(8);
    expect(20 - b.combat.hp(), '下駄').toBe(3);
    expect(rig({ legs: 'samurai_geta' }).hurt('normal')).toBe(4);
    expect(rig({ legs: 'samurai_geta' }).hurt('ball')).toBe(4);
  });
  it('表（armorValue）: 陣笠 ball 2・羽織 normal 2・手甲 normal 1・下駄 fall 2。ほかは 0', () => {
    const v = CRAFT_DEFAULTS.armorValue;
    expect(v.samurai_jingasa).toEqual({ normal: 0, ball: 2, fall: 0 });
    expect(v.samurai_haori).toEqual({ normal: 2, ball: 0, fall: 0 });
    expect(v.samurai_tekko).toEqual({ normal: 1, ball: 0, fall: 0 });
    expect(v.samurai_geta).toEqual({ normal: 0, ball: 0, fall: 2 });
  });
});

describe('AC7 とばされにくさ の 関数 knockbackMulOf（共通）', () => {
  const wearing = (...ids: (ItemId | null)[]) => {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    armor.set(ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null);
    return armor;
  };
  const table = () => NINJA_TUNING.knockbackMul as unknown as Record<string, number>;
  /** 表の 値を 一時的に かえて 戻す */
  const withTable = (patch: Record<string, number>, fn: () => void) => {
    const t = table();
    const saved = { ...t };
    try {
      Object.assign(t, patch);
      fn();
    } finally {
      for (const k of Object.keys(t)) delete t[k];
      Object.assign(t, saved);
    }
  };
  it('表の 初期値は samurai_haori 0.3 だけ', () => {
    expect(table()).toEqual({ samurai_haori: 0.3 });
  });
  it('何も 着て いない → 1。羽織 → 0.3。ほかの 防具だけ → 1', () => {
    expect(knockbackMulOf(wearing())).toBe(1);
    expect(knockbackMulOf(wearing(null, 'samurai_haori'))).toBe(0.3);
    expect(knockbackMulOf(wearing('samurai_jingasa', null, 'samurai_tekko', 'samurai_geta'))).toBe(1);
    expect(knockbackMulOf(wearing('kabuto', 'yoroi', 'kote', 'suneate'))).toBe(1);
  });
  it('表に samurai_jingasa: 0.5 を 足して 両方 着る → 0.3（いちばん 小さい 値。かけ算に しない）。陣笠 だけ → 0.5', () => {
    withTable({ samurai_jingasa: 0.5 }, () => {
      expect(knockbackMulOf(wearing('samurai_jingasa', 'samurai_haori'))).toBe(0.3);
      expect(knockbackMulOf(wearing('samurai_jingasa'))).toBe(0.5);
    });
    expect(knockbackMulOf(wearing('samurai_jingasa'))).toBe(1); // もとに もどった
  });
  it('値は 0〜1 に おさめる（1.5 → 1・−1 → 0）', () => {
    withTable({ samurai_haori: 1.5 }, () => expect(knockbackMulOf(wearing(null, 'samurai_haori'))).toBe(1));
    withTable({ samurai_haori: -1 }, () => expect(knockbackMulOf(wearing(null, 'samurai_haori'))).toBe(0));
  });
  it('防具の マスを 見る のは 1 回の 呼び出しで 4 マス いかい（仕事は 1 ステップで ふえない）', () => {
    let n = 0;
    const armor = { equipped: () => (n++, null) };
    knockbackMulOf(armor as never);
    expect(n).toBeLessThanOrEqual(4);
  });
});

describe('調整表（侍の 行）', () => {
  it('NINJA-1 の 表（NINJA_TUNING）に 侍の 数が 足して ある', () => {
    expect(NINJA_TUNING).toMatchObject({
      jingasaGuardTicks: 30,
      tekkoBladeMul: 1.5,
      tekkoDefIgnore: 10,
      getaStepTicks: 30,
      getaMinSpeed: 1,
      samuraiChestChance: 0.003,
    });
  });
});
