import { describe, expect, it } from 'vitest';
import type { BlockId, CraftEvent, ItemStack, Vec3 } from '../contracts';
import { CraftSystemImpl } from '../craft/CraftSystem';
import { InventoryImpl } from '../inventory/Inventory';
import { StorageSystem } from '../storage/StorageSystem';
import { createP2Craft } from './p2Craft';

/**
 * COOP-1 4a（§2.6「2P が つくる」・AC76）の 先行テスト（赤）。2P の「つくる」の 材料の 数え方と 実績の 共有。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル src/duo/p2Craft.ts）----
 *   createP2Craft(d: P2CraftDeps): P2Craft
 *     P2CraftDeps = {
 *       world: Pick<VoxelWorld, 'getBlock'>              1P の CraftSystemImpl と 同じ 世界
 *       inventory: Inventory                              2P の もちもの（`shared.p2.inventory`）。1P の もちものは 数えない
 *       tansu: TansuMaterialStore & { list(): Vec3[]; version?(): number }   世界の たんす（1P と 共有。`StorageSystem`）
 *       position: () => Vec3                              2P の 足もと（たんすの きょりの はかり始め。1P の 足もとでは ない）
 *       tansuRange: () => number                          使える たんすの きょり（`craft2Settings.craftTansuRange`。1P と 同じ 設定）
 *       requestSave: () => void
 *       drops?, config?                                   1P の CraftSystemImpl に わたす 物と 同じ
 *       feedCraft: (events: CraftEvent[]) => void         実績へ（`achievements.feedCraft`。実績は 2 人で 共有）
 *     }
 *     P2Craft = { craft: CraftSystem（2P の `InventoryScreen` に わたす。CraftSystemImpl）; step(): void }
 *       craft: 材料の 順・つくる 決まりは 1P の CraftSystemImpl と まったく 同じ（もちもの → 足りない 分は 近い たんす から。できた 物は 2P の もちものへ）。
 *       step(): 毎ステップ 1 回。`craft.drainEvents()` を 取り出し、1 つでも あれば `feedCraft(events)` に わたす（なければ 呼ばない）。
 *               できごとログ・とぶ 絵は 2P の パネルの 中だけ（2P の ログは 出さない。§13）なので ここでは 実績へ わたす だけ。
 *   配線: wireDuo が 2P の 初参加で 作り、毎ステップ step()。`createDuoInventory`（2P の InventoryScreen）の `craft` に `p2Craft.craft` を わたす。
 */

class W {
  blocks = new Map<string, BlockId>();
  size = { x: 256, y: 64, z: 256 };
  isLoaded(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.size.x && z < this.size.z;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: this.size.x, z1: this.size.z };
  }
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

const log = (n: number): ItemStack => ({ item: 'log', count: n });
const RANGE = 40;

/** 1P は 原点の あたり、2P は 遠く（100 マス）。たんすは 共有 */
function rig() {
  const world = new W();
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  const p1: Vec3 = { x: 0.5, y: 5, z: 0.5 };
  const p2: Vec3 = { x: 100.5, y: 5, z: 100.5 };
  const st = new StorageSystem({
    world,
    inventory: inv1,
    player: () => p1,
    scatter: () => undefined,
    inventoryOpen: () => false,
    openScreen: () => undefined,
    closeScreen: () => undefined,
  });
  const craft1 = new CraftSystemImpl({ world, inventory: inv1, tansu: st, player: () => p1, tansuRange: () => RANGE });
  const fed: CraftEvent[][] = [];
  const p2c = createP2Craft({ world, inventory: inv2, tansu: st, position: () => p2, tansuRange: () => RANGE, requestSave: () => undefined, feedCraft: (e) => fed.push(e) });
  const put = (x: number, y: number, z: number, slot: number, stack: ItemStack | null) => {
    world.setBlock(x, y, z, 'tansu');
    st.set(x, y, z, slot, stack);
  };
  return { inv1, inv2, p1, p2, st, craft1, p2c, fed, put };
}

describe('AC76: 2P の つくる（材料の 数え方）', () => {
  it('2P の もちものの 材料で つくれて、できた 物は 2P の もちものへ。1P の もちものは かわらない', () => {
    const { inv1, inv2, p2c } = rig();
    inv1.setSlot(0, { item: 'stone', count: 5 });
    inv2.setSlot(0, log(3));
    expect(p2c.craft.status('wood_pickaxe').craftable).toBe(true);
    const r = p2c.craft.make('wood_pickaxe');
    expect(r.ok).toBe(true);
    expect(inv2.count('wood_pickaxe')).toBe(1);
    expect(inv2.count('log')).toBe(0);
    expect(inv1.count('wood_pickaxe')).toBe(0);
    expect(inv1.count('stone')).toBe(5);
    expect(inv1.count('log')).toBe(0);
  });

  it('材料が 1P の もちもの だけに ある ときは「つくれる」に ならない（1P の もちものは 数えない・へらさない）', () => {
    const { inv1, inv2, p2c } = rig();
    inv1.setSlot(0, log(9));
    const st = p2c.craft.status('wood_pickaxe');
    expect(st.craftable).toBe(false);
    expect(st.missing).toEqual([log(3)]);
    expect(p2c.craft.make('wood_pickaxe')).toMatchObject({ ok: false, reason: 'missing' });
    expect(inv1.count('log')).toBe(9);
    expect(inv2.count('wood_pickaxe')).toBe(0);
  });

  it('順は 1P と 同じ: 2P の もちものが 先、足りない 分だけ 2P の 足もとから 近い たんす の 順', () => {
    const { inv1, inv2, p2, p2c, st, put } = rig();
    inv2.setSlot(0, log(1));
    put(Math.floor(p2.x) + 3, 5, Math.floor(p2.z), 0, log(1)); // 近い（3）
    put(Math.floor(p2.x) + 10, 5, Math.floor(p2.z), 0, log(5)); // 遠い（10）
    const r = p2c.craft.make('wood_pickaxe');
    expect(r.ok).toBe(true);
    expect(r.used?.inv).toEqual([log(1)]);
    expect(r.used?.tansu).toEqual([
      { x: Math.floor(p2.x) + 3, y: 5, z: Math.floor(p2.z), item: 'log', count: 1 },
      { x: Math.floor(p2.x) + 10, y: 5, z: Math.floor(p2.z), item: 'log', count: 1 },
    ]);
    expect(st.get(Math.floor(p2.x) + 3, 5, Math.floor(p2.z))!.slots[0]).toBeNull();
    expect(st.get(Math.floor(p2.x) + 10, 5, Math.floor(p2.z))!.slots[0]).toEqual(log(4));
    expect(inv2.count('wood_pickaxe')).toBe(1);
    expect(inv1.count('wood_pickaxe')).toBe(0);
  });

  it('たんすの きょりは 2P の 足もとから はかる（1P の 近くの たんすは 2P には 遠くて 使えない。2P の 近くの たんすは 1P から 遠くても 使える）', () => {
    const { p2, p2c, craft1, st, put, inv2 } = rig();
    put(3, 5, 0, 0, log(9)); // 1P の 近く（2P からは 約 140 マス）
    expect(p2c.craft.status('wood_pickaxe').craftable).toBe(false);
    expect(p2c.craft.tansuInRange()).toEqual([]);
    expect(craft1.status('wood_pickaxe').craftable).toBe(true); // 1P からは 使える（比べ）
    put(Math.floor(p2.x) + 2, 5, Math.floor(p2.z), 0, log(3)); // 2P の 近く（1P からは 遠い）
    expect(p2c.craft.status('wood_pickaxe').craftable).toBe(true);
    expect(p2c.craft.make('wood_pickaxe').ok).toBe(true);
    expect(inv2.count('wood_pickaxe')).toBe(1);
    expect(st.get(3, 5, 0)!.slots[0]).toEqual(log(9)); // 1P の 近くの たんすは そのまま
  });

  it('たんすは 共有: 2P が とった 分は 1P の 数えにも すぐ 反映する', () => {
    const { p2, p2c, craft1, put, p1 } = rig();
    // 2 人の 間に ある たんす（2P から 近く、1P からも 範囲 内に 置く ため 1P を 2P の 近くへ）
    p1.x = p2.x - 2;
    p1.z = p2.z;
    put(Math.floor(p2.x) + 1, 5, Math.floor(p2.z), 0, log(4));
    expect(craft1.total('log')).toBe(4);
    expect(p2c.craft.make('wood_pickaxe').ok).toBe(true);
    expect(craft1.total('log')).toBe(1);
  });

  it('いっぱいで 入らない ときは 1P と 同じに つくれない（何も かわらない）', () => {
    const { inv2, p2c } = rig();
    for (let i = 0; i < inv2.size; i++) inv2.setSlot(i, { item: 'dirt', count: 64 });
    inv2.setSlot(inv2.size - 1, log(3)); // き だけ 入った マス → つくると このマスが あく ので ok
    expect(p2c.craft.make('wood_pickaxe')).toMatchObject({ ok: true });
    const again = rig();
    for (let i = 0; i < again.inv2.size; i++) again.inv2.setSlot(i, { item: 'dirt', count: 64 });
    again.put(Math.floor(again.p2.x) + 1, 5, Math.floor(again.p2.z), 0, log(3)); // 材料は たんす だけ → 空きが ふえない
    expect(again.p2c.craft.make('wood_pickaxe')).toMatchObject({ ok: false, reason: 'full' });
    expect(again.p2c.craft.sources('wood_pickaxe').tansu.length).toBeGreaterThan(0); // 予定は あっても
    expect(again.st.get(Math.floor(again.p2.x) + 1, 5, Math.floor(again.p2.z))!.slots[0]).toEqual(log(3)); // たんすは へらない
  });
});

describe('AC76: 2P が つくった 物も 実績に 数える（共有）', () => {
  it('つくった ステップの step() で feedCraft に 出来事が わたる', () => {
    const { inv2, p2c, fed } = rig();
    inv2.setSlot(0, log(3));
    p2c.step();
    expect(fed).toEqual([]); // 何も 起きていなければ 呼ばない
    p2c.craft.make('wood_pickaxe');
    p2c.step();
    expect(fed).toHaveLength(1);
    expect(fed[0]).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'craft', recipe: 'wood_pickaxe', item: 'wood_pickaxe', count: 1 })]));
    p2c.step();
    expect(fed).toHaveLength(1); // 取り出した 出来事は 二度 わたさない
  });

  it('1P の CraftSystem の 出来事は 2P の 側に 混ざらない（それぞれ 別の craft）', () => {
    const { inv1, craft1, p2c, fed } = rig();
    inv1.setSlot(0, log(3));
    expect(craft1.make('wood_pickaxe').ok).toBe(true);
    p2c.step();
    expect(fed).toEqual([]);
  });
});
