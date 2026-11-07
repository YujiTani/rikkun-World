import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { CRAFT_DEFAULTS } from './config';
import { CraftSystemImpl } from './CraftSystem';
import { FurnaceWorld } from './FurnaceWorld';

/** COOP-1 4c レビュー差し戻し 軽微 3・4: 世界の かまどを わたさない 形（1 人）と、わたす 形の 出来事 */

class W {
  size = { x: 64, y: 64, z: 64 };
  isLoaded(): boolean {
    return true;
  }
  loadedBounds() {
    return { x0: 0, z0: 0, x1: 64, z1: 64 };
  }
  getBlock(x: number, y: number, z: number): BlockId | 'outside' {
    return x === 3 && y === 5 && z === 3 ? 'furnace' : 'air';
  }
  setBlock(): boolean {
    return true;
  }
  isSolid(): boolean {
    return false;
  }
}

const BAKE = CRAFT_DEFAULTS.bakeTicks;

describe('軽微 4: furnaces を わたさない つくるは by:2 の 保存を 読んでも 出来事が 自分に 来る', () => {
  it('by:2 の じゅんばんを 読みこんでも bakeDone が 自分の drainEvents に 出て、やけた 物は 自分の もちものへ', () => {
    const inv = new InventoryImpl();
    const craft = new CraftSystemImpl({ world: new W() as never, inventory: inv });
    craft.deserializeFurnaces([{ x: 3, y: 5, z: 3, queue: [{ recipe: 'iron_ingot', fuel: 'coal_ore', by: 2 }], progress: 0, done: [] }]);
    for (let i = 0; i < BAKE + 2; i++) craft.update();
    const types = craft.drainEvents().map((e) => e.type);
    expect(types).toContain('bakeDone');
    expect(inv.count('iron_ingot')).toBeGreaterThan(0);
  });
});

describe('軽微 3: かまどから 入る pickup の tick は bakeDone と そろう（世界の かまどを わたす 形でも 1 人と 同じ）', () => {
  it('shared の かまどで craft.update のあとに fw.update が 走っても pickup.tick == bakeDone.tick', () => {
    const inv = new InventoryImpl();
    inv.add('iron_ore', 1);
    inv.add('coal_ore', 1);
    const box: { craft: CraftSystemImpl | null } = { craft: null };
    const world = new W() as never;
    const fw = new FurnaceWorld({ world, inventoryOf: () => inv, joined: () => false, onDelivered: (_w, item, count, tick) => box.craft!.notifyPickup(item, count, tick) });
    const craft = new CraftSystemImpl({ world, inventory: inv, furnaces: fw, who: 1 });
    box.craft = craft;
    craft.bake('iron_ingot', 3, 5, 3);
    for (let i = 0; i < BAKE + 3; i++) {
      craft.update();
      fw.update();
    }
    const ev = craft.drainEvents();
    const done = ev.find((e) => e.type === 'bakeDone');
    const pick = ev.find((e) => e.type === 'pickup');
    expect(done).toBeDefined();
    expect(pick).toBeDefined();
    expect((pick as { tick: number }).tick).toBe((done as { tick: number }).tick);
  });
});
