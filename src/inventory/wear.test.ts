import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, Vec3, VoxelWorld } from '../contracts';
import { ArmorSystemImpl } from '../craft/ArmorSystem';
import { createCraftConfig } from '../craft/config';
import { DropField } from '../drops/DropField';
import { StorageSystem } from '../storage/StorageSystem';
import { itemClassOf, maxDurability } from '../tools/durability';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { createRng } from '../world/gen/random';
import { InventoryImpl } from './Inventory';

class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
  b = new Map<string, BlockId>();
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.b.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.b.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(x: number, y: number, z: number): boolean {
    return this.getBlock(x, y, z) !== 'air';
  }
}

describe('なかま・新品の 値 (AC25)', () => {
  it('3 つの なかま', () => {
    expect(itemClassOf('katana')).toBe('durable');
    expect(itemClassOf('kabuto')).toBe('durable');
    expect(itemClassOf('kuwa')).toBe('durable');
    for (const it of ['lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa', 'tansu'] as const) expect(itemClassOf(it)).toBe('permanent');
    for (const it of ['dirt', 'ya', 'torch', 'iron_ingot', 'seed_onion', 'tomato'] as const) expect(itemClassOf(it)).toBe('consumable');
  });
  it('WEAPON-6 AC11: 前の保存の きらめく カタナは へった量のまま 最大 400 で 読む（450 → のこり 1・100 → のこり 300）', () => {
    for (const [wear, left] of [[450, 1], [100, 300]] as const) {
      const inv = new InventoryImpl();
      const slots = Array.from({ length: inv.size }, () => null) as unknown[];
      slots[0] = { item: 'crystal_katana', count: 1, wear };
      inv.deserialize({ slots, selected: 0 });
      expect(inv.durability(0)).toEqual({ max: 400, left });
    }
  });
  it('maxDurability は 表を 読む', () => {
    expect(maxDurability('crystal_katana', W2_SETTING_DEFAULTS.toolDurability)).toBe(400);
    expect(maxDurability('dirt', W2_SETTING_DEFAULTS.toolDurability)).toBeNull();
  });
});

describe('持ち物の たいきゅう (AC26〜AC28・AC30)', () => {
  it('新品は max、ずっと/なくなるは null', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'katana', count: 1 });
    inv.setSlot(1, { item: 'lantern', count: 1 });
    inv.setSlot(2, { item: 'ya', count: 5 });
    expect(inv.durability(0)).toEqual({ max: 250, left: 250 });
    expect(inv.durability(1)).toBeNull();
    expect(inv.durability(2)).toBeNull();
    expect(inv.durability(5)).toBeNull();
    expect(inv.wearHeld(1)?.worn).toBe(1);
    expect(inv.wearSlot(1, 1)).toBeNull();
    expect(inv.wearSlot(2, 1)).toBeNull();
  });
  it('へる・のこり わずか 1 回 だけ・こわれる', () => {
    let tick = 7;
    const inv = new InventoryImpl({ tick: () => tick });
    inv.setSlot(0, { item: 'katana', count: 1 });
    inv.setDurability(0, 26);
    const r = inv.wearHeld(1)!;
    expect(r).toEqual({ max: 250, left: 25, worn: 1, broke: false, low: true });
    expect(inv.wearHeld(1)!.low).toBe(false);
    expect(inv.wearHeld(1)!.low).toBe(false);
    expect(inv.peekWearEvents().filter((e) => e.type === 'wearLow')).toEqual([{ type: 'wearLow', tick: 7, item: 'katana', slot: 0 }]);
    inv.setDurability(0, 1);
    tick = 9;
    const b = inv.wearHeld(2)!;
    expect(b).toMatchObject({ left: 0, worn: 1, broke: true });
    expect(inv.held()).toBeNull();
    expect(inv.drainWearEvents().map((e) => e.type)).toEqual(['wearLow', 'toolBreak']);
    expect(inv.drainWearEvents()).toEqual([]);
    expect(inv.peekWearEvents().at(-1)).toEqual({ type: 'toolBreak', tick: 9, item: 'katana', slot: 0 });
    expect(inv.wearHeld(1)).toBeNull();
  });
  it('きの つるはし(59) は 6 で 合図', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'wood_pickaxe', count: 1 });
    inv.setDurability(0, 7);
    expect(inv.wearHeld(1)!.low).toBe(true);
  });
  it('動かす・しまう・すてる・保存でも へった 量を たもつ', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'katana', count: 1, wear: 150 });
    expect(inv.durability(0)).toEqual({ max: 250, left: 100 });
    inv.click(0);
    inv.click(12);
    expect(inv.durability(12)).toEqual({ max: 250, left: 100 });
    inv.shiftMove(12);
    expect(inv.slots()[0]?.wear).toBe(150);
    inv.click(0);
    inv.returnCursor();
    expect(inv.slots()[0]?.wear).toBe(150);
    const copy = new InventoryImpl();
    copy.deserialize(JSON.parse(JSON.stringify(inv.serialize())));
    expect(copy.durability(0)).toEqual({ max: 250, left: 100 });
    inv.click(0);
    const data = inv.serialize() as { slots: Array<ItemStack | null> };
    expect(data.slots[0]?.wear).toBe(150); // カーソルの ものも 保存
    const t = inv.takeFromSlot(0, true);
    expect(t).toBeNull();
    inv.returnCursor();
    expect(inv.takeFromSlot(0, true)).toEqual({ item: 'katana', count: 1, wear: 150 });
  });
  it('前の保存(wear なし) は 新品、おかしい 値も 新品', () => {
    const inv = new InventoryImpl();
    const slots = new Array(36).fill(null);
    slots[0] = { item: 'katana', count: 1 };
    slots[1] = { item: 'katana', count: 1, wear: 'x' };
    slots[2] = { item: 'dirt', count: 3, wear: 5 };
    inv.deserialize({ slots, selected: 0 });
    expect(inv.durability(0)).toEqual({ max: 250, left: 250 });
    expect(inv.durability(1)).toEqual({ max: 250, left: 250 });
    expect(inv.slots()[2]).toEqual({ item: 'dirt', count: 3 });
  });
});

function armorRig() {
  const inv = new InventoryImpl();
  const armor = new ArmorSystemImpl(inv, createCraftConfig());
  return { inv, armor };
}

describe('防具の たいきゅう (AC30・AC32)', () => {
  it('ふせぐ 防具だけ へる。カットは 先に 返す', () => {
    const { armor } = armorRig();
    armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    expect(armor.durability('body')).toEqual({ max: 240, left: 240 });
    expect(armor.cut('normal', 2)).toBe(3);
    expect(armor.durability('body')!.left).toBe(239);
    expect(armor.durability('arms')!.left).toBe(224);
    expect(armor.durability('head')!.left).toBe(165);
    expect(armor.durability('legs')!.left).toBe(195);
    armor.cut('normal', 16);
    expect(armor.durability('body')!.left).toBe(235);
    expect(armor.durability('arms')!.left).toBe(220);
    armor.cut('ball', 2);
    expect(armor.durability('head')!.left).toBe(164);
    armor.cut('fall', 2);
    expect(armor.durability('legs')!.left).toBe(194);
    expect(armor.durability('body')!.left).toBe(235);
  });
  it('amount なしの 古い 呼び方は へらさない', () => {
    const { armor } = armorRig();
    armor.set(null, 'yoroi');
    expect(armor.cut('normal')).toBe(2);
    expect(armor.durability('body')!.left).toBe(240);
  });
  it('left 1 の よろい: その 攻撃は カット込み、そのあと 空・toolBreak・次は カットなし', () => {
    const { armor } = armorRig();
    armor.set(null, 'yoroi', 'kote');
    armor.setDurability('body', 1);
    expect(armor.cut('normal', 2)).toBe(3);
    expect(armor.equipped('body')).toBeNull();
    expect(armor.snapshot().body).toBeNull();
    expect(armor.drainWearEvents()).toEqual([{ type: 'toolBreak', tick: 0, item: 'yoroi', slot: 'body' }]);
    expect(armor.cut('normal', 2)).toBe(1);
  });
  it('のこり わずかは 1 回', () => {
    const { armor } = armorRig();
    armor.set('kabuto', null);
    armor.setDurability('head', 18); // 165 の 10% = 17
    armor.cut('ball', 2);
    armor.cut('ball', 2);
    expect(armor.peekWearEvents().filter((e) => e.type === 'wearLow')).toHaveLength(1);
  });
  it('着る・ぬぐ・入れかえ・保存で へった 量を 運ぶ', () => {
    const { inv, armor } = armorRig();
    inv.setSlot(0, { item: 'yoroi', count: 1, wear: 140 });
    expect(armor.tryEquip('yoroi')).toBe(true);
    expect(armor.durability('body')).toEqual({ max: 240, left: 100 });
    expect(inv.slots()[0]).toBeNull();
    inv.setSlot(0, { item: 'yoroi', count: 1, wear: 190 });
    expect(armor.tryEquip('yoroi')).toBe(true);
    expect(armor.durability('body')!.left).toBe(50);
    expect(inv.durability(0)).toEqual({ max: 240, left: 100 });
    // 保存
    const data = JSON.parse(JSON.stringify(armor.serialize()));
    const b = armorRig().armor;
    b.deserialize(data);
    expect(b.durability('body')!.left).toBe(50);
    expect(b.snapshot().wear).toEqual({ body: 190 });
    // 前の保存(品名だけ)
    b.deserialize({ head: null, body: 'yoroi', arms: null, legs: null });
    expect(b.durability('body')!.left).toBe(240);
    // ぬぐ
    inv.clear();
    armor.unequipToBag('body');
    expect(inv.durability(0)).toEqual({ max: 240, left: 50 });
    // クリック
    inv.click(0);
    armor.click('body');
    expect(armor.durability('body')!.left).toBe(50);
    armor.click('body');
    expect(inv.cursor()?.wear).toBe(190);
    expect(armor.equippedStack('body')).toBeNull();
  });
  it('もちもの画面で 着る(equipFromSlot)', () => {
    const { inv, armor } = armorRig();
    inv.setSlot(10, { item: 'kote', count: 1, wear: 25 });
    expect(armor.equipFromSlot(10)).toBe(true);
    expect(armor.durability('arms')).toEqual({ max: 225, left: 200 });
  });
});

describe('落とし物・たんすでも たもつ (AC30)', () => {
  it('すてて 拾う / ふくろ から 拾う', () => {
    const world = new W();
    for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) world.setBlock(x, 8, z, 'stone');
    const inv = new InventoryImpl();
    const player: Vec3 = { x: 10.5, y: 9, z: 10.5 };
    const f = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3) });
    f.scatter(player, [{ item: 'katana', count: 1, wear: 150 }], { kind: 'death' });
    f.throwItem({ item: 'katana', count: 1, wear: 60 }, 0, 1.62);
    const saved = JSON.parse(JSON.stringify(f.serialize()));
    const g = new DropField({ world, inventory: inv, player: () => player, rng: createRng(3) });
    g.deserialize(saved);
    for (let i = 0; i < 200; i++) g.update(true);
    expect(g.size()).toBe(0);
    const lefts = [0, 1].map((i) => inv.durability(i)?.left).sort();
    expect(lefts).toEqual([100, 190]);
  });
  it('たんす: 保存・こわしたとき', () => {
    const world = new W();
    world.setBlock(5, 5, 5, 'tansu');
    const inv = new InventoryImpl();
    const scattered: ItemStack[][] = [];
    const st = new StorageSystem({
      world,
      inventory: inv,
      player: () => ({ x: 5.5, y: 5, z: 7.5 }),
      scatter: (_p, s) => scattered.push(s),
      inventoryOpen: () => false,
      openScreen: () => {},
      closeScreen: () => {},
    });
    st.set(5, 5, 5, 0, { item: 'katana', count: 1, wear: 150 });
    expect(st.get(5, 5, 5)!.slots[0]).toEqual({ item: 'katana', count: 1, wear: 150 });
    const data = JSON.parse(JSON.stringify(st.serialize()));
    st.deserialize(data);
    expect(st.get(5, 5, 5)!.slots[0]?.wear).toBe(150);
    st.broken(5, 5, 5);
    expect(scattered[0]![0]).toEqual({ item: 'katana', count: 1, wear: 150 });
  });
});
