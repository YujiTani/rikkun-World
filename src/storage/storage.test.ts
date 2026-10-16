import { describe, expect, it } from 'vitest';
import type { BlockId, ItemStack, Vec3, VoxelWorld } from '../contracts';
import { ActionState, actionForKey, bindKeyboardAndMouse } from '../input/actions';
import { InventoryImpl } from '../inventory/Inventory';
import { CRAFT_RECIPES } from '../craft/recipes';
import { ItemDropper, DropController } from './ItemDropper';
import { StorageSystem, facingFromYaw } from './StorageSystem';
import { TANSU_COLORS, tansuPixels, type TansuFace } from './tansuArt';

class W implements VoxelWorld {
  readonly size = { x: 32, y: 32, z: 32 };
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

function rig() {
  const world = new W();
  world.setBlock(5, 5, 5, 'tansu');
  world.setBlock(6, 5, 5, 'tansu');
  const inv = new InventoryImpl();
  const player: Vec3 = { x: 5.5, y: 5, z: 7.5 };
  let open = false;
  const scattered: ItemStack[][] = [];
  const st = new StorageSystem({
    world,
    inventory: inv,
    player: () => player,
    scatter: (_p, s) => scattered.push(s),
    inventoryOpen: () => open,
    openScreen: () => (open = true),
    closeScreen: () => (open = false),
  });
  return { world, inv, st, player, scattered, isOpen: () => open };
}

describe('たんす', () => {
  it('レシピ 21 番目 = き 8・てつの かたまり 2', () => {
    expect(CRAFT_RECIPES[20]).toMatchObject({ id: 'tansu', works: true });
    expect(CRAFT_RECIPES[20]!.inputs).toEqual([{ item: 'log', count: 8 }, { item: 'iron_ingot', count: 2 }]);
  });

  it('向き: 北を向いて置くと 前は 南', () => {
    expect(facingFromYaw(0)).toBe('s');
    expect(facingFromYaw(180)).toBe('n');
    expect(facingFromYaw(90)).toBe('w');
  });

  it('開く・遠いと閉じる', () => {
    const r = rig();
    expect(r.st.open(1, 1, 1)).toBe(false);
    expect(r.st.open(5, 5, 5)).toBe(true);
    expect(r.st.ui()).toMatchObject({ open: true, slots: 54, lookOpen: true });
    r.st.update();
    expect(r.st.ui().open).toBe(true);
    r.player.z = 5.5 + 6.1;
    r.st.update();
    expect(r.st.ui().open).toBe(false);
    expect(r.isOpen()).toBe(false);
  });

  it('シフトクリックで うつす・いっぱいなら変わらない', () => {
    const r = rig();
    r.st.open(5, 5, 5);
    r.inv.setSlot(9, { item: 'dirt', count: 64 });
    r.inv.setSlot(10, { item: 'dirt', count: 10 });
    expect(r.st.shiftClick('inv', 9).moved).toBe(64);
    expect(r.inv.slots()[9]).toBeNull();
    r.st.shiftClick('inv', 10);
    expect(r.st.get(5, 5, 5)!.slots[1]).toEqual({ item: 'dirt', count: 10 });
    r.st.shiftClick('tansu', 0);
    expect(r.inv.slots()[0]).toEqual({ item: 'dirt', count: 64 });
    for (let i = 0; i < 54; i++) r.st.set(5, 5, 5, i, { item: 'stone', count: 1 });
    r.inv.setSlot(12, { item: 'dirt', count: 3 });
    const res = r.st.shiftClick('inv', 12);
    expect(res).toEqual({ moved: 0, reason: 'full' });
    expect(r.inv.slots()[12]!.count).toBe(3);
  });

  it('クリック 2 回で運ぶ・閉じるとき持ち上げたマスへもどる', () => {
    const r = rig();
    r.st.open(5, 5, 5);
    r.st.set(5, 5, 5, 3, { item: 'log', count: 5 });
    r.st.click(3);
    expect(r.inv.cursor()).toEqual({ item: 'log', count: 5 });
    r.inv.returnCursor();
    expect(r.st.get(5, 5, 5)!.slots[3]).toEqual({ item: 'log', count: 5 });
    expect(r.inv.cursor()).toBeNull();
  });

  it('中身はべつべつ・こわすとばらまく・出来事', () => {
    const r = rig();
    r.st.open(5, 5, 5);
    r.inv.setSlot(9, { item: 'log', count: 5 });
    r.st.shiftClick('inv', 9);
    expect(r.st.get(6, 5, 5)!.slots.every((s) => s === null)).toBe(true);
    expect(r.st.drainEvents()).toEqual([{ type: 'store', tick: 0, item: 'log', count: 5 }]);
    r.world.setBlock(5, 5, 5, 'air');
    expect(r.st.broken(5, 5, 5)).toBe(5);
    expect(r.scattered[0]).toEqual([{ item: 'log', count: 5 }]);
    expect(r.st.get(5, 5, 5)).toBeNull();
    expect(r.st.ui().open).toBe(false);
  });

  it('54 マスうめると storeFull', () => {
    const r = rig();
    r.st.open(5, 5, 5);
    for (let i = 0; i < 53; i++) r.st.set(5, 5, 5, i, { item: 'stone', count: 1 });
    r.inv.setSlot(9, { item: 'dirt', count: 1 });
    r.st.shiftClick('inv', 9);
    expect(r.st.drainEvents().map((e) => e.type)).toEqual(['store', 'storeFull']);
  });

  it('保存と読みこみ・古い保存・setBlock で消えたら中身も消える', () => {
    const r = rig();
    r.st.placed(5, 5, 5, 0);
    r.st.set(5, 5, 5, 0, { item: 'dirt', count: 7 });
    const data = JSON.parse(JSON.stringify(r.st.serialize()));
    r.st.deserialize(data);
    expect(r.st.get(5, 5, 5)).toMatchObject({ facing: 's' });
    expect(r.st.get(5, 5, 5)!.slots[0]).toEqual({ item: 'dirt', count: 7 });
    r.st.deserialize(undefined);
    expect(r.st.list()).toHaveLength(0);
    r.st.set(6, 5, 5, 0, { item: 'dirt', count: 1 });
    r.world.setBlock(6, 5, 5, 'stone');
    r.st.update();
    r.world.setBlock(6, 5, 5, 'tansu');
    expect(r.st.get(6, 5, 5)!.slots[0]).toBeNull();
  });
});

describe('ドット絵', () => {
  it('7 色だけ・取っ手 4 つ（金具の光）・前の面は 開くと変わる', () => {
    const allowed = new Set(Object.values(TANSU_COLORS));
    for (const f of ['front', 'frontOpen', 'side', 'top', 'icon'] as TansuFace[]) {
      const px = tansuPixels(f);
      expect(px).toHaveLength(256);
      for (const c of px) expect(allowed.has(c as never)).toBe(true);
    }
    expect(tansuPixels('front').filter((c) => c === TANSU_COLORS.shine)).toHaveLength(4);
    expect(tansuPixels('front')).not.toEqual(tansuPixels('frontOpen'));
    expect(tansuPixels('front')[0]).toBe(TANSU_COLORS.kurogane);
  });
});

describe('すてる', () => {
  function dropRig() {
    const inv = new InventoryImpl();
    const thrown: ItemStack[] = [];
    const dropper = new ItemDropper({ inventory: inv, throwItem: (s) => thrown.push(s) });
    const actions = new ActionState();
    const ctl = new DropController({ actions, dropper, playEnabled: () => true, inventoryOpen: () => false, hover: () => null });
    return { inv, thrown, dropper, actions, ctl };
  }
  it('drop で 1 こ・dropStack でぜんぶ・押しっぱなしでも 1 回・空なら何もしない', () => {
    const r = dropRig();
    r.inv.setSlot(0, { item: 'dirt', count: 5 });
    r.actions.press('drop');
    r.ctl.update();
    r.actions.endFrame();
    for (let i = 0; i < 60; i++) {
      r.ctl.update();
      r.actions.endFrame();
    }
    expect(r.inv.slots()[0]!.count).toBe(4);
    r.actions.release('drop');
    r.actions.press('dropStack');
    r.ctl.update();
    expect(r.inv.slots()[0]).toBeNull();
    expect(r.thrown.map((t) => t.count)).toEqual([1, 4]);
    expect(r.dropper.drainEvents().map((e) => e.type)).toEqual(['drop', 'drop']);
    r.actions.endFrame();
    r.actions.release('dropStack');
    r.actions.press('drop');
    r.ctl.update();
    expect(r.thrown).toHaveLength(2);
  });
  it('そのマス・カーソルからすてる', () => {
    const r = dropRig();
    r.inv.setSlot(5, { item: 'log', count: 9 });
    expect(r.dropper.dropTarget(5, true)).toBe(true);
    expect(r.inv.slots()[5]).toBeNull();
    r.inv.setCursor({ item: 'log', count: 3 });
    expect(r.dropper.dropCursor()).toBe(true);
    expect(r.inv.cursor()).toBeNull();
  });
});

describe('Inventory.shiftMove とキー', () => {
  it('ホットバー ⇄ ふくろ', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'dirt', count: 5 });
    expect(inv.shiftMove(0)).toBe(5);
    expect(inv.slots()[9]).toEqual({ item: 'dirt', count: 5 });
    expect(inv.shiftMove(9)).toBe(5);
    expect(inv.slots()[0]).toEqual({ item: 'dirt', count: 5 });
  });
  it('Shift＋Q は dropStack だけ、Q は drop、ほかのキーは Shift を見ない', () => {
    expect(actionForKey('KeyQ', false)).toBe('drop');
    expect(actionForKey('KeyQ', true)).toBe('dropStack');
    expect(actionForKey('KeyW', true)).toBe('moveForward');
  });
  it('Shift＋Q を押して Shift を先にはなしても dropStack をはなす', () => {
    const target = new EventTarget();
    const state = new ActionState();
    bindKeyboardAndMouse(target as unknown as Window, state);
    const key = (type: string, shiftKey: boolean) => {
      const e = Object.assign(new Event(type), { code: 'KeyQ', shiftKey, preventDefault() {} });
      target.dispatchEvent(e);
    };
    key('keydown', true);
    expect(state.isHeld('dropStack')).toBe(true);
    expect(state.isHeld('drop')).toBe(false);
    key('keyup', false);
    expect(state.isHeld('dropStack')).toBe(false);
  });
});

describe('CRAFT-2: たんす から素材を数える・取り出す', () => {
  it('countItem / takeItem（うしろのマスから・store を出さない・version がふえる）', () => {
    const r = rig();
    r.st.set(5, 5, 5, 0, { item: 'log', count: 2 });
    r.st.set(5, 5, 5, 53, { item: 'log', count: 2 });
    expect(r.st.countItem(5, 5, 5, 'log')).toBe(4);
    expect(r.st.countItem(1, 1, 1, 'log')).toBe(0);
    const v = r.st.version();
    expect(r.st.takeItem(5, 5, 5, 'log', 3)).toBe(3);
    expect(r.st.version()).toBeGreaterThan(v);
    const s = r.st.get(5, 5, 5)!.slots;
    expect(s[53]).toBeNull();
    expect(s[0]).toEqual({ item: 'log', count: 1 });
    expect(r.st.takeItem(5, 5, 5, 'log', 9)).toBe(1);
    expect(r.st.takeItem(5, 5, 5, 'log', 1)).toBe(0);
    expect(r.st.drainEvents()).toEqual([]);
  });
});
