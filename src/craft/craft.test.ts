import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, Vec3 } from '../contracts';
import { PlayerCombatImpl } from '../combat/PlayerCombat';
import { createCombatConfig } from '../combat/config';
import { CRAFT_DEFAULTS } from './config';
import { DropField } from '../drops';
import { InventoryImpl } from '../inventory/Inventory';
import { ITEM_TYPES } from '../inventory/items';
import { itemRarity } from '../drops/rarity';
import { ArmorSystemImpl } from './ArmorSystem';
import { CraftSystemImpl } from './CraftSystem';
import { createCraftHook, createFurnaceHook, createPickupHook } from './hook';

class W {
  blocks = new Map<string, BlockId>();
  size = { x: 16, y: 16, z: 16 };
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
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

function rig() {
  const world = new W();
  world.setBlock(3, 5, 3, 'furnace');
  const inv = new InventoryImpl();
  const scattered: ItemStack[] = [];
  const craft = new CraftSystemImpl({
    world,
    inventory: inv,
    drops: {
      scatter: (_p: Vec3, stacks: readonly ItemStack[]) => {
        scattered.push(...stacks);
        return 0;
      },
    },
  });
  const step = (n: number) => {
    for (let i = 0; i < n; i++) craft.update();
  };
  return { world, inv, craft, step, scattered };
}

describe('アイテムの種類表（AC1）', () => {
  it('M4 の 22 こがあり、めずらしさが決まっている', () => {
    const ids = ['furnace', 'kawara', 'brick', 'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'iron_ingot', 'bokuto', 'katana', 'naginata', 'crystal_katana', 'yumi', 'ya', 'kabuto', 'yoroi', 'torch', 'lantern', 'kite', 'futon', 'omamori', 'waraji', 'haniwa'];
    for (const id of ids) expect(ITEM_TYPES.some((t) => t.id === id), id).toBe(true);
    const t = (id: string) => ITEM_TYPES.find((x) => x.id === id)!;
    expect(t('furnace')).toMatchObject({ name: 'かまど', maxStack: 64, placeBlock: 'furnace' });
    expect(t('torch').placeBlock).toBe('torch');
    expect(t('katana')).toMatchObject({ maxStack: 1, placeBlock: null });
    expect(t('ya').maxStack).toBe(64);
    expect(itemRarity('crystal_katana')).toBe('superRare');
    expect(itemRarity('furnace')).toBe('uncommon');
    expect(itemRarity('katana')).toBe('rare');
  });
});

describe('つくる（AC1〜AC4）', () => {
  it('list は 25 こ、持ち物が空なら全部 craftable false', () => {
    const { craft } = rig();
    const l = craft.list();
    expect(l).toHaveLength(25);
    expect(l.every((c) => !c.craftable && c.missing.length === c.inputs.length)).toBe(true);
    expect(l[0].id).toBe('wood_pickaxe');
    expect(craft.bakeList().map((b) => b.id)).toEqual(['iron_ingot', 'kawara', 'brick', 'haniwa']);
  });

  it('き 2 で bokuto が true、wood_pickaxe は き 1 足りない', () => {
    const { craft, inv } = rig();
    inv.add('log', 2);
    const l = craft.list();
    expect(l.find((c) => c.id === 'bokuto')).toMatchObject({ craftable: true, missing: [] });
    expect(l.find((c) => c.id === 'wood_pickaxe')).toMatchObject({ craftable: false, missing: [{ item: 'log', count: 1 }] });
  });

  it('材料はふくろの後ろのマスから先に取る。や は 4 本、たいまつ は 4 こ', () => {
    const { craft, inv } = rig();
    inv.setSlot(0, { item: 'log', count: 2 });
    inv.setSlot(20, { item: 'log', count: 2 });
    expect(craft.make('bokuto')).toMatchObject({ ok: true, reason: null });
    expect(inv.slots()[20]).toBeNull();
    expect(inv.slots()[0]).toEqual({ item: 'log', count: 2 });
    expect(inv.count('bokuto')).toBe(1);
    expect(craft.takeCraftHookEvents().filter((e) => e.type === 'craft')).toHaveLength(1);
    inv.clear();
    inv.add('log', 1);
    inv.add('stone', 1);
    inv.add('paper', 1);
    craft.make('ya');
    expect(inv.count('ya')).toBe(4);
    inv.clear();
    inv.add('log', 1);
    inv.add('oil', 1);
    craft.make('torch');
    expect(inv.count('torch')).toBe(4);
  });

  it('足りないと missing で何も変わらない。カーソルは数えない', () => {
    const { craft, inv } = rig();
    inv.add('log', 1);
    expect(craft.make('bokuto')).toMatchObject({ ok: false, reason: 'missing' });
    expect(inv.count('log')).toBe(1);
    expect(craft.takeCraftHookEvents().map((e) => e.type)).toEqual(['craftFail']);
    inv.clear();
    inv.setSlot(0, { item: 'log', count: 2 });
    inv.click(0);
    inv.setSlot(1, { item: 'log', count: 1 });
    expect(craft.list().find((c) => c.id === 'bokuto')!.craftable).toBe(false);
  });

  it('いっぱい: 材料を取って入るなら つくる。入らなければ full で変えない', () => {
    const { craft, inv } = rig();
    for (let i = 0; i < 35; i++) inv.setSlot(i, { item: 'dirt', count: 64 });
    inv.setSlot(35, { item: 'log', count: 2 });
    expect(craft.make('bokuto').ok).toBe(true);
    inv.clear();
    for (let i = 0; i < 35; i++) inv.setSlot(i, { item: 'dirt', count: 64 });
    inv.setSlot(35, { item: 'log', count: 64 });
    expect(craft.make('bokuto')).toMatchObject({ ok: false, reason: 'full' });
    expect(inv.count('log')).toBe(64);
    expect(craft.make('nothing').reason).toBe('unknown');
  });

  it('click は閉じていると closed', () => {
    const { craft } = rig();
    expect(createCraftHook(craft, { inventoryOpen: () => false }).click('bokuto')).toMatchObject({ ok: false, reason: 'closed' });
  });
});

describe('かまど・やく（AC5〜AC9）', () => {
  it('ひらく・てつ を焼く: 59 では 0、60 で入る', () => {
    const { craft, inv, step } = rig();
    expect(craft.isFurnace(3, 5, 3)).toBe(true);
    craft.openFurnace(3, 5, 3);
    expect(craft.openedFurnace()).toEqual({ x: 3, y: 5, z: 3 });
    inv.add('iron_ore', 1);
    inv.add('coal_ore', 1);
    expect(craft.clickBake('iron_ingot')).toMatchObject({ ok: true, reason: null });
    expect(inv.count('iron_ore')).toBe(0);
    expect(inv.count('coal_ore')).toBe(0);
    expect(craft.furnaceAt(3, 5, 3)!.burning).toBe(true);
    step(59);
    expect(inv.count('iron_ingot')).toBe(0);
    step(1);
    expect(inv.count('iron_ingot')).toBe(1);
    expect(craft.furnaceAt(3, 5, 3)!.burning).toBe(false);
    const ev = craft.takeFurnaceHookEvents().map((e) => e.type);
    expect(ev).toEqual(['bakeStart', 'bakeDone']);
    expect(craft.pickupLog().map((l) => l.item)).toEqual(['iron_ingot']);
  });

  it('ねんど は かわら 2・レンガ 2', () => {
    const { craft, inv, step } = rig();
    inv.add('clay', 2);
    inv.add('coal_ore', 2);
    craft.bake('kawara', 3, 5, 3);
    craft.bake('brick', 3, 5, 3);
    step(120);
    expect(inv.count('kawara')).toBe(2);
    expect(inv.count('brick')).toBe(2);
  });

  it('ねんりょうを えらぶと その物が へる。0 こになったら 自動の順の次', () => {
    const { craft, inv } = rig();
    inv.add('coal_ore', 2);
    inv.add('log', 1);
    inv.add('iron_ore', 3);
    expect(craft.fuel()).toBe('coal_ore');
    expect(craft.setFuel('log')).toBe(true);
    expect(craft.setFuel('dirt')).toBe(false);
    craft.bake('iron_ingot', 3, 5, 3);
    expect([inv.count('coal_ore'), inv.count('log')]).toEqual([2, 0]);
    expect(craft.fuel()).toBe('coal_ore');
    craft.bake('iron_ingot', 3, 5, 3);
    expect(inv.count('coal_ore')).toBe(1);
  });

  it('ねんりょうは せきたん → あぶら → き。60・120・180 ステップ目に入る', () => {
    const { craft, inv, step } = rig();
    inv.add('coal_ore', 1);
    inv.add('oil', 1);
    inv.add('log', 5);
    inv.add('iron_ore', 3);
    craft.bake('iron_ingot', 3, 5, 3);
    expect([inv.count('coal_ore'), inv.count('oil'), inv.count('log')]).toEqual([0, 1, 5]);
    craft.bake('iron_ingot', 3, 5, 3);
    expect([inv.count('oil'), inv.count('log')]).toEqual([0, 5]);
    craft.bake('iron_ingot', 3, 5, 3);
    expect(inv.count('log')).toBe(4);
    for (const n of [60, 120, 180]) {
      step(n === 60 ? 59 : 59);
      expect(inv.count('iron_ingot')).toBe((n - 60) / 60);
      step(1);
      expect(inv.count('iron_ingot')).toBe(n / 60);
    }
  });

  it('ねんりょう 0 は noFuel、じゅんばん 8 のとき 9 回目は queueFull、材料なしは missing', () => {
    const { craft, inv } = rig();
    inv.add('iron_ore', 10);
    expect(craft.bake('iron_ingot', 3, 5, 3)).toMatchObject({ ok: false, reason: 'noFuel' });
    expect(inv.count('iron_ore')).toBe(10);
    inv.add('log', 20);
    for (let i = 0; i < 8; i++) expect(craft.bake('iron_ingot', 3, 5, 3).ok).toBe(true);
    expect(craft.bake('iron_ingot', 3, 5, 3)).toMatchObject({ ok: false, reason: 'queueFull' });
    expect(craft.bake('kawara', 3, 5, 3).reason).toBe('missing');
    expect(craft.bake('iron_ingot', 0, 0, 0).reason).toBe('notFurnace');
  });

  it('焼けたとき いっぱいなら done で待ち、空いた次のステップで入る', () => {
    const { craft, inv, step } = rig();
    inv.add('iron_ore', 1);
    inv.add('coal_ore', 1);
    craft.bake('iron_ingot', 3, 5, 3);
    for (let i = 0; i < 36; i++) inv.setSlot(i, { item: 'dirt', count: 64 });
    step(60);
    expect(craft.furnaceAt(3, 5, 3)!.done).toEqual([{ item: 'iron_ingot', count: 1 }]);
    expect(inv.count('iron_ingot')).toBe(0);
    inv.setSlot(10, null);
    step(1);
    expect(inv.count('iron_ingot')).toBe(1);
    expect(craft.furnaceAt(3, 5, 3)!.done).toEqual([]);
  });

  it('こわすと じゅんばん の材料・ねんりょうが もどる。入らない分は ふくろ', () => {
    const { craft, inv, step, scattered } = rig();
    inv.add('iron_ore', 3);
    inv.add('coal_ore', 3);
    for (let i = 0; i < 3; i++) craft.bake('iron_ingot', 3, 5, 3);
    step(30);
    craft.furnaceBroken(3, 5, 3);
    expect(inv.count('iron_ore')).toBe(3);
    expect(inv.count('coal_ore')).toBe(3);
    // いっぱいのとき
    inv.clear();
    inv.add('clay', 1);
    inv.add('log', 1);
    craft.bake('brick', 3, 5, 3);
    for (let i = 0; i < 36; i++) inv.setSlot(i, { item: 'dirt', count: 64 });
    craft.furnaceBroken(3, 5, 3);
    expect(scattered.map((s) => s.item).sort()).toEqual(['clay', 'log']);
  });

  it('fixedDrop', () => {
    const { craft } = rig();
    expect(craft.fixedDrop('furnace')).toBe(1);
    expect(craft.fixedDrop('kawara')).toBe(1);
    expect(craft.fixedDrop('brick')).toBe(1);
    expect(craft.fixedDrop('stone')).toBeNull();
  });

  it('保存: じゅんばん 2 こ（1 こ目を 30 ステップ）が続きから焼ける', () => {
    const a = rig();
    a.inv.add('iron_ore', 2);
    a.inv.add('coal_ore', 2);
    a.craft.bake('iron_ingot', 3, 5, 3);
    a.craft.bake('iron_ingot', 3, 5, 3);
    a.step(30);
    const data = JSON.parse(JSON.stringify(a.craft.serializeFurnaces()));
    const b = rig();
    b.craft.deserializeFurnaces(data);
    b.step(29);
    expect(b.inv.count('iron_ingot')).toBe(0);
    b.step(1);
    expect(b.inv.count('iron_ingot')).toBe(1);
    b.step(60);
    expect(b.inv.count('iron_ingot')).toBe(2);
    b.craft.deserializeFurnaces([{ x: 1.5 }, 'x', null]);
    expect(b.craft.furnacePositions()).toEqual([]);
  });

  it('furnace フック', () => {
    const { craft, inv } = rig();
    inv.add('iron_ore', 1);
    inv.add('log', 1);
    const h = createFurnaceHook(craft, { inventoryOpen: () => true });
    expect(h.list()[0]).toMatchObject({ id: 'iron_ingot', canBake: true, fuelOk: true });
    expect(h.click('iron_ingot')).toMatchObject({ ok: false, reason: 'closed' }); // かまど を開いていない
    craft.openFurnace(3, 5, 3);
    expect(h.click('iron_ingot').ok).toBe(true);
    expect(h.get(3, 5, 3)!.current).toEqual({ id: 'iron_ingot', progress: 0 });
    expect(h.get(0, 0, 0)).toBeNull();
  });
});

describe('拾ったログ（AC27）', () => {
  it('同じものは足す・5 行まで・180 ステップで消える。add は出さない', () => {
    const { craft, inv, step } = rig();
    const h = createPickupHook(craft);
    inv.add('dirt', 1);
    expect(h.pickupLog()).toEqual([]);
    craft.pickup('dirt', 1);
    expect(h.pickupLog()).toEqual([{ item: 'dirt', count: 1, ticksLeft: 180 }]);
    step(60);
    craft.pickup('dirt', 1);
    expect(h.pickupLog()).toEqual([{ item: 'dirt', count: 2, ticksLeft: 180 }]);
    craft.pickup('paper', 3);
    expect(h.pickupLog()[1]).toMatchObject({ item: 'paper', count: 3 });
    step(179);
    expect(h.pickupLog().map((l) => l.item)).toEqual(['dirt', 'paper']);
    step(1);
    expect(h.pickupLog()).toEqual([]);
    for (const it of ['dirt', 'stone', 'sand', 'grass', 'log', 'leaves'] as const) craft.pickup(it, 1);
    expect(h.pickupLog().map((l) => l.item)).toEqual(['stone', 'sand', 'grass', 'log', 'leaves']);
  });

  it('入らなかった分は数えない', () => {
    const { craft, inv } = rig();
    for (let i = 0; i < 36; i++) inv.setSlot(i, { item: 'dirt', count: 64 });
    inv.setSlot(0, { item: 'stone', count: 63 });
    expect(craft.pickup('stone', 5)).toBe(4);
    expect(craft.pickupLog()[0]).toMatchObject({ item: 'stone', count: 1 });
    expect(craft.pickup('paper', 2)).toBe(2);
    expect(craft.pickupLog()).toHaveLength(1);
  });
});

describe('防具（AC17〜AC19）', () => {
  function armorRig() {
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    return { inv, armor };
  }

  it('手に持って着る・入れかえ・合わないものは着られない', () => {
    const { inv, armor } = armorRig();
    inv.setSlot(0, { item: 'kabuto', count: 1 });
    expect(armor.tryEquip('kabuto')).toBe(true);
    expect(armor.equipped('head')).toBe('kabuto');
    expect(inv.slots()[0]).toBeNull();
    inv.setSlot(0, { item: 'kabuto', count: 1 });
    expect(armor.tryEquip('kabuto')).toBe(true);
    expect(inv.slots()[0]).toEqual({ item: 'kabuto', count: 1 });
    expect(armor.tryEquip('yoroi')).toBe(false);
    expect(armor.tryEquip('log')).toBe(false);
    inv.setSlot(0, { item: 'yoroi', count: 1 });
    inv.click(0);
    armor.click('head');
    expect(armor.equipped('head')).toBe('kabuto'); // よろい は あたま に入らない
    armor.click('body');
    expect(armor.equipped('body')).toBe('yoroi');
    expect(inv.cursor()).toBeNull();
    armor.click('head');
    expect(inv.cursor()).toEqual({ item: 'kabuto', count: 1 });
    expect(armor.equipped('head')).toBeNull();
  });

  it('カットする量: 防具 4 つ × 種類 3 つの表（かぶと=玉 2・よろい=ふつう 2・こて=ふつう 1・すねあて=落下 2）', () => {
    const cutOf = (slot: 0 | 1 | 2 | 3, kind: 'normal' | 'ball' | 'fall') => {
      const { armor } = armorRig();
      const w: Array<'kabuto' | 'yoroi' | 'kote' | 'suneate' | null> = [null, null, null, null];
      w[slot] = (['kabuto', 'yoroi', 'kote', 'suneate'] as const)[slot];
      armor.set(w[0] as 'kabuto' | null, w[1] as 'yoroi' | null, w[2] as 'kote' | null, w[3] as 'suneate' | null);
      return armor.cut(kind);
    };
    const kinds = ['normal', 'ball', 'fall'] as const;
    const table = ([0, 1, 2, 3] as const).map((i) => kinds.map((k) => cutOf(i, k)));
    expect(table).toEqual([
      [0, 2, 0],
      [2, 0, 0],
      [1, 0, 0],
      [0, 0, 2],
    ]);
    const { armor } = armorRig();
    expect(armor.cut('normal')).toBe(0);
  });

  it('hudIcons・take・保存', () => {
    const { armor } = armorRig();
    expect(armor.snapshot().hudIcons).toEqual([]);
    armor.set('kabuto', 'yoroi');
    expect(armor.snapshot()).toMatchObject({ value: 4, hudIcons: ['kabuto', 'yoroi'] });
    const saved = JSON.parse(JSON.stringify(armor.serialize()));
    armor.set(null, null);
    armor.deserialize(saved);
    expect(armor.equipped('body')).toBe('yoroi');
    armor.deserialize({ head: 'yoroi', body: 'zzz' });
    expect(armor.snapshot().hudIcons).toEqual([]);
  });

  it('4 部位: こて は うで・すねあて は あし。カットは種類ごと。古い保存（2 部位）も開ける', () => {
    const { inv, armor } = armorRig();
    expect(armor.slotFor('kote')).toBe('arms');
    expect(armor.slotFor('suneate')).toBe('legs');
    armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    expect([armor.cut('normal'), armor.cut('ball'), armor.cut('fall')]).toEqual([3, 2, 2]);
    expect(armor.snapshot().hudIcons).toEqual(['kabuto', 'yoroi', 'kote', 'suneate']);
    armor.set('kote', null, 'suneate', 'kote'); // 合わない部位には入らない
    expect(armor.snapshot().hudIcons).toEqual([]);
    inv.setSlot(0, { item: 'kote', count: 1 });
    inv.select(0);
    expect(armor.tryEquip('kote')).toBe(true);
    expect(armor.equipped('arms')).toBe('kote');
    inv.setSlot(1, { item: 'suneate', count: 1 });
    inv.select(1);
    expect(armor.tryEquip('suneate')).toBe(true);
    expect(armor.equipped('legs')).toBe('suneate');
    const saved = JSON.parse(JSON.stringify(armor.serialize()));
    armor.set(null, null);
    armor.deserialize(saved);
    expect(armor.snapshot()).toMatchObject({ arms: 'kote', legs: 'suneate', value: 3 });
    armor.deserialize({ head: 'kabuto', body: 'yoroi' }); // 古い保存
    expect(armor.snapshot()).toMatchObject({ head: 'kabuto', body: 'yoroi', arms: null, legs: null });
  });

  it('レシピ: こて = てつ1・ぬの1、すねあて = てつ2・いと1', () => {
    const { craft } = rig();
    const l = craft.list();
    expect(l.find((c) => c.id === 'kote')?.inputs).toEqual([{ item: 'iron_ingot', count: 1 }, { item: 'cloth', count: 1 }]);
    expect(l.find((c) => c.id === 'suneate')?.inputs).toEqual([{ item: 'iron_ingot', count: 2 }, { item: 'string', count: 1 }]);
  });
});

describe('PlayerCombat と防具（AC18・AC19）', () => {
  function combatRig(rngValue = 0) {
    const world = new W();
    const inv = new InventoryImpl();
    const armor = new ArmorSystemImpl(inv, { armorValue: CRAFT_DEFAULTS.armorValue });
    const player = { position: { x: 2.5, y: 9, z: 6.5 }, velocity: { x: 0, y: 0, z: 0 }, yawDeg: 0, pitchDeg: 0, onGround: true, inWater: false, moving: false, facingDeg: 0, running: false };
    const config = createCombatConfig();
    const drops = new DropField({ world: world as never, inventory: inv, player: () => player.position });
    const combat = new PlayerCombatImpl({
      world: world as never,
      player: { get: () => player, set: (v) => Object.assign(player.position, v.position ?? {}) },
      inventory: inv,
      yokai: () => ({ occupies: () => false }) as never,
      spawn: () => ({ x: 1.5, y: 9, z: 1.5, yawDeg: 0, pitchDeg: 0 }),
      config,
      rng: () => rngValue,
      drops,
      armor,
    });
    const step = (n: number) => {
      for (let i = 0; i < n; i++) combat.update();
    };
    return { combat, armor, inv, step, drops };
  }

  it('よろい: ハート1(体力2)の攻撃は 1 に。ぬりかべ(4)は 2。ふせいだ回も むてき', () => {
    const r = combatRig();
    r.armor.set(null, 'yoroi');
    r.combat.damage(2, 'karakasa', { x: 0, y: 9, z: 6.5 });
    expect(r.combat.invincibleTicks()).toBe(30);
    expect(r.combat.hp()).toBe(19);
    r.step(31);
    r.combat.damage(4, 'nurikabe', { x: 0, y: 9, z: 6.5 });
    expect(r.combat.hp()).toBe(17);
    const ev = r.combat.drainEvents().filter((e) => e.type === 'playerHit') as Array<{ amount: number; blocked?: boolean }>;
    expect(ev.map((e) => [e.amount, e.blocked === true])).toEqual([[1, true], [2, true]]);
  });

  it('両方着ても 最低ハート半分(体力 1)。防具なしはそのまま', () => {
    const r = combatRig();
    r.armor.set('kabuto', 'yoroi');
    r.combat.damage(2, 'karakasa', { x: 0, y: 9, z: 6.5 });
    expect(r.combat.hp()).toBe(19);
    r.step(31);
    r.armor.set(null, null);
    r.combat.damage(2, 'karakasa', { x: 0, y: 9, z: 6.5 });
    expect(r.combat.hp()).toBe(17);
  });

  it('むてきで受けなかった回は k に数えない', () => {
    const r = combatRig();
    r.armor.set(null, 'yoroi');
    r.combat.damage(1, 'karakasa', { x: 0, y: 9, z: 6.5 });
    r.combat.damage(1, 'karakasa', { x: 0, y: 9, z: 6.5 });
    expect(r.armor.hitCount()).toBe(1);
  });

  it('やられたら そうびも 落ちる（dropChance 1）。0 なら着たまま。復活で k は 0', () => {
    const r = combatRig(0);
    r.armor.set('kabuto', 'yoroi', 'kote', 'suneate');
    r.combat.setHp(0);
    expect(r.armor.snapshot()).toMatchObject({ head: null, body: null, arms: null, legs: null });
    const items = r.combat.bags().map((b) => b.slots[0].item).sort();
    expect(items).toEqual(['kabuto', 'kote', 'suneate', 'yoroi']);
    r.step(130);
    expect(r.combat.dead()).toBe(false);
    expect(r.armor.hitCount()).toBe(0);

    const q = combatRig(0.99);
    q.armor.set('kabuto', 'yoroi');
    q.combat.setHp(0);
    expect(q.armor.snapshot().hudIcons).toEqual(['kabuto', 'yoroi']);
  });
});
