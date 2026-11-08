import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createChestHands } from './p2Chest';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ①・AC148）の 先行テスト（赤）。ダンジョンの 宝箱: 中身は あけた 人の もちもの。
 * 宝箱の 窓口 `dig.chestPort.open(x, y, z, who)` の who は 0 = 1P・1 = 2P（p2Dig5b.test.ts）。宝箱の 中身を 入れる／あふれた 分を 落とす 先を who で えらぶ 部品。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Chest.ts（新しく。`game/wire/mine.ts` が 使う。`mine.open` の 前に who を 決め、`chest.add`・`chest.drop` は その who の 手に 向ける）
 *     createChestHands(d: {
 *       inventory(who: number): Inventory | null     … who 0 = 1P の もちもの・1 = 2P の もちもの（2P が いなければ null）
 *       feet(who: number): Vec3 | null               … その 人の 足もと（いなければ null）
 *       scatter(at: Vec3, item: ItemId, count: number): void   … 落とし物を 出す 口（mine.ts が CHEST_DROP_RISE を 足して DropField.scatter へ）
 *     }): (who: number) => ChestHands
 *     ChestHands = { add(item, count): number /* 入りきらない のこり *\/; drop(item, count): void /* その 人の 足もとに scatter *\/ }
 *     - who が 0 でも 1 でも ない・その 人が いない（inventory が null）ときは 1P の 手に する（中身を なくさない）。
 *   宝箱の 実績・「はじめて てにいれた」・ふたの 動き・見せる 物（テロップ）は 世界に 1 つ（あけた 人に よらず 1P と 同じ）。同じ 宝箱は 先に あけた 人。
 *   ふたが 動いて いる 宝箱は 2 人とも 何も 起きない（mine.ts の busy は 2 人で 1 つ）。同じ ステップに 2 人が あけたら 1P（1P の dig.update が 先）。
 */

const item = (s: string): ItemId => s as ItemId;
function setup(p2Joined = true) {
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  const dropped: Array<{ at: { x: number; y: number; z: number }; item: string; count: number }> = [];
  const hands = createChestHands({
    inventory: (who) => (who === 0 ? inv1 : who === 1 && p2Joined ? inv2 : null),
    feet: (who) => (who === 0 ? { x: 1, y: 2, z: 3 } : who === 1 && p2Joined ? { x: 10, y: 20, z: 30 } : null),
    scatter: (at, i, count) => void dropped.push({ at: { ...at }, item: i, count }),
  });
  return { inv1, inv2, dropped, hands };
}

describe('AC148: 宝箱の 中身は あけた 人の もちもの', () => {
  it('who 1（2P）の add は 2P の もちものに 入り、1P は かわらない', () => {
    const { inv1, inv2, hands } = setup();
    expect(hands(1).add(item('dirt'), 5)).toBe(0);
    expect(inv2.count(item('dirt'))).toBe(5);
    expect(inv1.count(item('dirt'))).toBe(0);
  });

  it('who 0（1P）の add は 1P の もちもの(今までどおり)', () => {
    const { inv1, inv2, hands } = setup();
    expect(hands(0).add(item('dirt'), 3)).toBe(0);
    expect(inv1.count(item('dirt'))).toBe(3);
    expect(inv2.count(item('dirt'))).toBe(0);
  });

  it('いっぱいなら 入りきらない 分を のこりとして 返す(1P と 同じ あつかい)。あふれは その 人の 足もとへ', () => {
    const { inv2, dropped, hands } = setup();
    for (let i = 0; i < inv2.size; i++) inv2.setSlot(i, { item: item('stone'), count: 1 });
    const rest = hands(1).add(item('dirt'), 4);
    expect(rest).toBe(4);
    hands(1).drop(item('dirt'), rest);
    expect(dropped).toEqual([{ at: { x: 10, y: 20, z: 30 }, item: 'dirt', count: 4 }]);
  });

  it('1P の drop は 1P の 足もと', () => {
    const { dropped, hands } = setup();
    hands(0).drop(item('dirt'), 2);
    expect(dropped).toEqual([{ at: { x: 1, y: 2, z: 3 }, item: 'dirt', count: 2 }]);
  });

  it('2P が いない のに who 1 が 来ても、中身は 1P の 手に する（なくさない）', () => {
    const { inv1, dropped, hands } = setup(false);
    expect(hands(1).add(item('dirt'), 2)).toBe(0);
    expect(inv1.count(item('dirt'))).toBe(2);
    hands(1).drop(item('dirt'), 1);
    expect(dropped).toEqual([{ at: { x: 1, y: 2, z: 3 }, item: 'dirt', count: 1 }]);
  });

  it('知らない who(2 など)も 1P の 手', () => {
    const { inv1, hands } = setup();
    hands(2).add(item('dirt'), 1);
    expect(inv1.count(item('dirt'))).toBe(1);
  });
});
