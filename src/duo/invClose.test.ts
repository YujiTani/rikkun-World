import { describe, expect, it } from 'vitest';
import type { ItemStack } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { closeInvHand } from './invClose';

/**
 * COOP-1 4a（§3.3「とじる とき」・AC89 の 後半）の 先行テスト（赤）。手に もっている 物（つかんだ 物）の あとしまつ。
 *
 * ---- 開発への つなぎ目の 約束（新しい ファイル src/duo/invClose.ts）----
 *   closeInvHand(inventory: Inventory, dropAtFeet: (stack: ItemStack) => void): void
 *       その人の 画面が とじる ステップ（自分で とじた・倒れた・パッドが ぬけた・やめた）に 呼ぶ。1 人の ときの とじ方と 同じ:
 *       手に もっている 物（`inventory.cursor()`）を `returnCursor()` で その人の もちものへ もどす。
 *       もちものが いっぱいで もどしきれなかった 分は `dropAtFeet(stack)` に わたして（その人の 足もとに 落とす）、手は 空に する（`setCursor(null)`）。
 *       手に もっていなければ 何も しない（dropAtFeet を 呼ばない）。
 *       `setCursor` は 契約の `Inventory`（src/contracts/items.ts）に まだ ない ので、引数の 型は `Pick<InventoryImpl, 'cursor' | 'returnCursor' | 'setCursor'>` に する（契約を ふやさない なら）。1P の もちもの・2P の もちもの どちらにも 使う（呼ぶ 側が その人の inventory と 足もとを わたす）。
 *   配線: 2P の パネルを とじる 道（setOpen(false)）と 1P の 画面が 倒れて とじる 道の 両方から。2P の 手の 物は 1P の もちものへ 入らない。
 */

const SLOTS = new InventoryImpl().size;

/** もちもの ぜんぶを 別の 物で うめる（カーソルは からにして おく） */
function fill(inv: InventoryImpl, item: 'dirt' | 'stone' = 'dirt'): void {
  for (let i = 0; i < SLOTS; i++) inv.setSlot(i, { item, count: 64 });
}

describe('AC89: とじる とき 手に もっている 物', () => {
  it('空きが あれば その人の もちものへ もどる（足もとには 落ちない）', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'iron_ingot', count: 5 });
    inv.click(0); // 持ち上げる
    expect(inv.cursor()).toEqual({ item: 'iron_ingot', count: 5 });
    const dropped: ItemStack[] = [];
    closeInvHand(inv, (s) => dropped.push(s));
    expect(inv.cursor()).toBeNull();
    expect(inv.count('iron_ingot')).toBe(5);
    expect(dropped).toEqual([]);
  });

  it('いっぱいで もどせない 分は その人の 足もとに 落ちる。手は 空に なる', () => {
    const inv = new InventoryImpl();
    fill(inv);
    inv.setCursor({ item: 'iron_ingot', count: 7 }); // つかんだ 物（もどす マスは もう うまっている）
    const dropped: ItemStack[] = [];
    closeInvHand(inv, (s) => dropped.push(s));
    expect(inv.cursor()).toBeNull();
    expect(dropped).toEqual([{ item: 'iron_ingot', count: 7 }]);
    expect(inv.count('iron_ingot')).toBe(0);
  });

  it('一部だけ 入る ときは 入る 分は もちものへ、のこりが 足もとへ', () => {
    const inv = new InventoryImpl();
    fill(inv, 'stone');
    inv.setSlot(3, { item: 'iron_ingot', count: 60 }); // 4 こ 入る 余地
    inv.setCursor({ item: 'iron_ingot', count: 10 });
    const dropped: ItemStack[] = [];
    closeInvHand(inv, (s) => dropped.push(s));
    expect(inv.cursor()).toBeNull();
    expect(inv.count('iron_ingot') + dropped.reduce((n, s) => n + s.count, 0)).toBe(70);
    expect(dropped.length).toBe(1);
    expect(dropped[0]!.item).toBe('iron_ingot');
    expect(dropped[0]!.count).toBeGreaterThan(0);
  });

  it('何も もっていなければ 何も しない', () => {
    const inv = new InventoryImpl();
    inv.setSlot(0, { item: 'dirt', count: 3 });
    const dropped: ItemStack[] = [];
    closeInvHand(inv, (s) => dropped.push(s));
    expect(dropped).toEqual([]);
    expect(inv.count('dirt')).toBe(3);
  });

  it('2P の 手の 物は 2P の もちものへ。1P の もちものは かわらない（それぞれの inventory を わたす）', () => {
    const p1 = new InventoryImpl();
    const p2 = new InventoryImpl();
    p1.setSlot(0, { item: 'stone', count: 9 });
    p2.setSlot(0, { item: 'log', count: 4 });
    p2.click(0);
    closeInvHand(p2, () => undefined);
    expect(p2.count('log')).toBe(4);
    expect(p1.count('log')).toBe(0);
    expect(p1.count('stone')).toBe(9);
  });
});
