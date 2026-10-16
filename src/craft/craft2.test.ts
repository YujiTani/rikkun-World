import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, Vec3 } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { StorageSystem } from '../storage/StorageSystem';
import { CraftSystemImpl } from './CraftSystem';
import { createCraftHook, createFurnaceHook } from './hook';

class W {
  blocks = new Map<string, BlockId>();
  size = { x: 256, y: 64, z: 256 };
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return this.blocks.get(`${x},${y},${z}`) ?? 'air';
  }
  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    this.blocks.set(`${x},${y},${z}`, id);
    return true;
  }
  isSolid(): boolean {
    return false;
  }
}

function rig() {
  const world = new W();
  const inv = new InventoryImpl();
  const player: Vec3 = { x: 0.5, y: 5, z: 0.5 };
  const st = new StorageSystem({
    world,
    inventory: inv,
    player: () => player,
    scatter: () => undefined,
    inventoryOpen: () => false,
    openScreen: () => undefined,
    closeScreen: () => undefined,
  });
  const craft = new CraftSystemImpl({ world, inventory: inv, tansu: st, player: () => player });
  const put = (x: number, y: number, z: number, slot: number, stack: ItemStack | null) => {
    world.setBlock(x, y, z, 'tansu');
    st.set(x, y, z, slot, stack);
  };
  return { world, inv, st, craft, player, put };
}

const log = (n: number): ItemStack => ({ item: 'log', count: n });

describe('たんす の素材（CRAFT-2 §2.2〜§2.4）', () => {
  it('AC1: もちもの 1 + たんす 2 で き 3 が そろう。空にすると すぐ false', () => {
    const { inv, craft, put } = rig();
    inv.setSlot(0, log(1));
    put(3, 5, 0, 0, log(2));
    const row = () => craft.list().find((c) => c.id === 'wood_pickaxe')!;
    expect(row()).toMatchObject({ craftable: true, missing: [] });
    expect(craft.sources('wood_pickaxe')).toMatchObject({ ok: true, inv: [{ item: 'log', count: 1 }], tansu: [{ x: 3, y: 5, z: 0, item: 'log', count: 2 }] });
    put(3, 5, 0, 0, null);
    expect(row()).toMatchObject({ craftable: false, missing: [{ item: 'log', count: 2 }] });
    expect(craft.canCraftAny()).toBe(false);
  });

  it('AC2: もちもの が先（うしろのマスから）、たんす は足りない分だけ', () => {
    const { inv, craft, put, st } = rig();
    inv.setSlot(0, log(1));
    inv.setSlot(20, log(1));
    put(3, 5, 0, 0, log(5));
    const r = craft.make('wood_pickaxe');
    expect(r.ok).toBe(true);
    expect(r.used).toEqual({ inv: [{ item: 'log', count: 2 }], tansu: [{ x: 3, y: 5, z: 0, item: 'log', count: 1 }] });
    expect(inv.count('log')).toBe(0);
    expect(inv.slots()[20]).toBeNull();
    expect(st.get(3, 5, 0)!.slots[0]).toEqual(log(4));
    expect(inv.count('wood_pickaxe')).toBe(1);
    const ev = craft.takeCraftHookEvents();
    expect(ev[0]).toMatchObject({ type: 'craft', fromTansu: [{ x: 3, y: 5, z: 0, item: 'log', count: 1 }] });
    // もちもの だけで足りれば たんす は そのまま
    inv.setSlot(1, log(3));
    const r2 = craft.make('wood_pickaxe');
    expect(r2.used!.tansu).toEqual([]);
    expect(st.get(3, 5, 0)!.slots[0]).toEqual(log(4));
  });

  it('AC3: 近い たんす から。同じきょりなら x → z → y。たんす の中は うしろのマスから', () => {
    const { craft, put, st } = rig();
    put(3, 5, 0, 0, log(1));
    put(10, 5, 0, 0, log(5));
    expect(craft.make('wood_pickaxe').ok).toBe(true);
    expect(st.get(3, 5, 0)!.slots[0]).toBeNull();
    expect(st.get(10, 5, 0)!.slots[0]).toEqual(log(3));

    const b = rig();
    b.put(0, 5, 4, 0, log(1)); // dist 4 (z)
    b.put(4, 5, 0, 0, log(1)); // dist 4 (x) → x が小さい方 = z=4 の方が x=0
    b.put(-3, 5, 0, 0, log(1));
    expect(b.craft.tansuInRange().map((t) => [t.x, t.z])).toEqual([[-3, 0], [0, 4], [4, 0]]);

    const c = rig();
    c.put(3, 5, 0, 0, log(2));
    c.st.set(3, 5, 0, 53, log(2));
    expect(c.craft.make('wood_pickaxe').ok).toBe(true);
    const s = c.st.get(3, 5, 0)!.slots;
    expect(s[53]).toBeNull();
    expect(s[0]).toEqual(log(1));
  });

  it('AC4/AC5: 足りなければ何も変えない', () => {
    const { inv, craft, put, st } = rig();
    inv.setSlot(0, log(1));
    put(3, 5, 0, 0, log(1));
    expect(craft.make('wood_pickaxe')).toEqual({ ok: false, reason: 'missing', used: null });
    expect(inv.count('log')).toBe(1);
    expect(st.get(3, 5, 0)!.slots[0]).toEqual(log(1));
    expect(craft.takeCraftHookEvents()[0]).toMatchObject({ type: 'craftFail', reason: 'missing' });
  });

  it('AC6: いっぱい は 何も変えない。き のマスが空けば ok', () => {
    const { inv, craft, put, st } = rig();
    for (let i = 0; i < 36; i++) inv.setSlot(i, { item: 'dirt', count: 64 });
    put(3, 5, 0, 0, log(3));
    expect(craft.make('wood_pickaxe')).toMatchObject({ ok: false, reason: 'full' });
    expect(st.get(3, 5, 0)!.slots[0]).toEqual(log(3));
    inv.setSlot(35, log(1));
    put(3, 5, 0, 0, log(2));
    expect(craft.make('wood_pickaxe')).toMatchObject({ ok: true });
  });

  it('AC7: やく は 材料もねんりょうも たんす から（ねんりょうは合計で決める）', () => {
    const { inv, craft, put, st, world } = rig();
    inv.setSlot(0, log(5));
    put(3, 5, 0, 0, { item: 'iron_ore', count: 1 });
    put(10, 5, 0, 0, { item: 'coal_ore', count: 1 });
    world.setBlock(0, 5, 3, 'furnace');
    craft.openFurnace(0, 5, 3);
    expect(craft.bakeList().find((b) => b.id === 'iron_ingot')).toMatchObject({ canBake: true, fuelOk: true });
    expect(craft.sources('iron_ingot')).toMatchObject({ ok: true, tansu: [{ item: 'iron_ore', count: 1 }, { item: 'coal_ore', count: 1 }] });
    expect(craft.inTansuCount('coal_ore')).toBe(1);
    const r = craft.clickBake('iron_ingot');
    expect(r.ok).toBe(true);
    expect(r.used).toEqual({ inv: [], tansu: [{ x: 3, y: 5, z: 0, item: 'iron_ore', count: 1 }, { x: 10, y: 5, z: 0, item: 'coal_ore', count: 1 }] });
    expect(st.get(10, 5, 0)!.slots[0]).toBeNull();
    expect(inv.count('log')).toBe(5);
    for (let i = 0; i < 60; i++) craft.update();
    expect(inv.count('iron_ingot')).toBe(1);
  });

  it('AC8: きょり ちょうど 80 は使える・81 は使えない・壁ごしでも使える', () => {
    const { craft, put, player, st, world } = rig();
    put(81, 5, 0, 0, log(3));
    expect(craft.list().find((c) => c.id === 'wood_pickaxe')).toMatchObject({ craftable: false, missing: [{ item: 'log', count: 3 }] });
    expect(craft.make('wood_pickaxe')).toMatchObject({ ok: false, reason: 'missing' });
    expect(st.get(81, 5, 0)!.slots[0]).toEqual(log(3));
    expect(craft.sources('wood_pickaxe').tansu).toEqual([]);
    expect(craft.tansuInRange()).toEqual([]);
    put(81, 5, 0, 0, null);
    put(80, 5, 0, 0, log(3));
    for (const [x, y, z] of [[79, 5, 0], [81, 5, 0], [80, 4, 0], [80, 6, 0], [80, 5, 1], [80, 5, -1]]) world.setBlock(x, y, z, 'stone');
    expect(craft.list().find((c) => c.id === 'wood_pickaxe')!.craftable).toBe(true);
    expect(craft.tansuInRange()).toEqual([{ x: 80, y: 5, z: 0, dist: 80 }]);
    player.x = 0.49; // 80.01
    expect(craft.tansuInRange()).toEqual([]);
  });

  it('AC9/AC9b: かなづち の印は ブロックが変わったときだけ しらべ直す', () => {
    const { craft, put, player, st, world } = rig();
    put(60, 5, 0, 0, log(3));
    expect(craft.canCraftAny()).toBe(true);
    const n0 = craft.debugCounts().tansuFilterCount;
    for (let i = 0; i < 600; i++) craft.update(), craft.canCraftAny();
    expect(craft.debugCounts().tansuFilterCount).toBe(n0);
    player.x = -20.5; // 80.5 → 範囲の外
    expect(craft.canCraftAny()).toBe(false);
    expect(craft.debugCounts().tansuFilterCount).toBeGreaterThan(n0);
    player.x = 0.5;
    expect(craft.canCraftAny()).toBe(true);
    // たんす を こわす（中身が変わる）→ false
    st.broken(60, 5, 0);
    world.setBlock(60, 5, 0, 'air');
    expect(craft.canCraftAny()).toBe(false);
    const n1 = craft.debugCounts().tansuFilterCount;
    craft.refreshTansu();
    expect(craft.debugCounts().tansuFilterCount).toBe(n1 + 1);
  });

  it('AC10: たんす から使っても store の出来事は出ない・ひらいていても使える', () => {
    const { craft, put, st } = rig();
    put(3, 5, 0, 0, log(2));
    st.open(3, 5, 0, { screenOpens: true });
    expect(craft.make('bokuto').ok).toBe(true);
    expect(st.get(3, 5, 0)!.slots[0]).toBeNull();
    expect(st.drainEvents()).toEqual([]);
  });

  it('カーソルのものは数えない', () => {
    const { inv, craft, put, st } = rig();
    put(3, 5, 0, 0, log(2));
    st.open(3, 5, 0, { screenOpens: true });
    st.click(0);
    expect(inv.cursor()).toEqual(log(2));
    inv.setSlot(0, log(1));
    expect(craft.list().find((c) => c.id === 'wood_pickaxe')!.craftable).toBe(false);
  });

  it('AC27: たんす 30 こ でも しぼるのは 1 回・何度数えても 変わらない', () => {
    const { craft, put } = rig();
    for (let i = 0; i < 30; i++) put(i + 1, 5, 0, 0, log(1));
    craft.list();
    const n = craft.debugCounts().tansuFilterCount;
    for (let i = 0; i < 100; i++) craft.list();
    expect(craft.debugCounts().tansuFilterCount).toBe(n);
  });

  it('hook: click・sources・tansuInRange・debug', () => {
    const { craft, put } = rig();
    put(3, 5, 0, 0, log(3));
    const h = createCraftHook(craft, { inventoryOpen: () => true });
    expect(h.sources('wood_pickaxe').ok).toBe(true);
    expect(h.tansuInRange()).toHaveLength(1);
    expect(h.click('wood_pickaxe')).toMatchObject({ ok: true, used: { tansu: [{ count: 3 }] } });
    expect(typeof h.debug().tansuFilterCount).toBe('number');
    expect(createFurnaceHook(craft, { inventoryOpen: () => false }).click('iron_ingot')).toEqual({ ok: false, reason: 'closed', used: null });
  });
});
