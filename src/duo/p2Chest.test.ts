import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { createChestHands, createChestRouter } from './p2Chest';

/**
 * COOP-1 5b（docs/design/COOP-1.md 1.14 §3.7 (c) ①・AC148）の 先行テスト（赤）。ダンジョンの 宝箱: 中身は あけた 人の もちもの。
 * 宝箱の 窓口 `dig.chestPort.open(x, y, z, who)` の who は 1 = 1P・2 = 2P（p2Dig5b.test.ts）。宝箱の 中身を 入れる／あふれた 分を 落とす／ひとことを 出す 先を who で えらぶ 部品。
 *
 * ---- 実装への 約束（developer が 作る 名前・形）----
 *   src/duo/p2Chest.ts（新しく。`game/wire/mine.ts` が 使う）
 *     createChestHands(d: {
 *       inventory(who: 1 | 2): Inventory | null     … who 1 = 1P の もちもの・2 = 2P の もちもの（2P が いなければ null）
 *       feet(who: 1 | 2): Vec3 | null               … その 人の 足もと（いなければ null）
 *       scatter(at: Vec3, item: ItemId, count: number): void   … 落とし物を 出す 口（mine.ts が CHEST_DROP_RISE を 足して DropField.scatter へ）
 *     }): (who: 1 | 2) => ChestHands
 *     ChestHands = { add(item, count): number /* 入りきらない のこり *\/; drop(item, count): void /* その 人の 足もとに scatter *\/ }
 *     - who 2 でも 2P が いない（inventory が null）ときは 1P の 手に する（中身を なくさない）。who の 型は 1 | 2 だけ（0 や 知らない 値は 型で 通さない）。
 *   mine.ts の open の 中身（who に 合わせて 切りかえてから mine.open する）:
 *     createChestRouter(d: { hands: (who: 1 | 2) => ChestHands; say(text: string): void /* 1P の ログ・画面に 出す 口（今の chest.say の 中身） *\/ }): ChestRouter
 *     ChestRouter = {
 *       run(who: 1 | 2, fn: () => void): void   … fn の あいだだけ「あける 人」を who にする。おわったら（fn が 例外でも）1 に もどす。mine.ts は `router.run(who, () => mine.open(x, y, z))`
 *       add(item, count): number / drop(item, count): void   … createMineHook の chest.add・chest.drop に つなぐ。run の 中なら その who の hands、外なら 1P の hands
 *       say(text: string): void                                … chest.say に つなぐ。**who が 2 の ときは d.say を 呼ばない**（PO 決め 2026-11-08: 2P の ときは 1P の ログ・画面に「からっぽ だよ」「もちものが いっぱい」を 出さない。2P の ログは 出さない 決まり。仕様 §3.7 に 1 行）。1P（run の 外も）は d.say を 1 回
 *       busy: Set<string>                                       … ふたが 動いて いる 宝箱の 本体の マス。**2 人で 1 つ**（どちらが あけても 動いて いる 間は 両方 何も 起きない）
 *     }
 *   宝箱の 実績（feedCraft の pickup・feedMine chestOpen）・「はじめて てにいれた」・ふたの 動き・見せる 物（テロップ）は 世界に 1 つ（who に よらず 1P と 同じ）。mine.ts の show() は who を 見ない。
 *   同じ 宝箱は 先に あけた 人。同じ ステップに 2 人が あけたら 1P（1P の dig.update が 先）。
 *   配線は コードレビューで 必ず 見る: mine.ts が open に who を うけて router.run で 包む／chest.add・drop・say が router 経由／busy が router.busy／1P の ふるまい（run の 外・who 1）は 今と 同じ。
 */

const item = (s: string): ItemId => s as ItemId;
function setup(p2Joined = true) {
  const inv1 = new InventoryImpl();
  const inv2 = new InventoryImpl();
  const dropped: Array<{ at: { x: number; y: number; z: number }; item: string; count: number }> = [];
  const hands = createChestHands({
    inventory: (who) => (who === 1 ? inv1 : p2Joined ? inv2 : null),
    feet: (who) => (who === 1 ? { x: 1, y: 2, z: 3 } : p2Joined ? { x: 10, y: 20, z: 30 } : null),
    scatter: (at, i, count) => void dropped.push({ at: { ...at }, item: i, count }),
  });
  return { inv1, inv2, dropped, hands };
}

describe('AC148: 宝箱の 中身は あけた 人の もちもの', () => {
  it('who 2（2P）の add は 2P の もちものに 入り、1P は かわらない', () => {
    const { inv1, inv2, hands } = setup();
    expect(hands(2).add(item('dirt'), 5)).toBe(0);
    expect(inv2.count(item('dirt'))).toBe(5);
    expect(inv1.count(item('dirt'))).toBe(0);
  });

  it('who 1（1P）の add は 1P の もちもの(今までどおり)', () => {
    const { inv1, inv2, hands } = setup();
    expect(hands(1).add(item('dirt'), 3)).toBe(0);
    expect(inv1.count(item('dirt'))).toBe(3);
    expect(inv2.count(item('dirt'))).toBe(0);
  });

  it('いっぱいなら 入りきらない 分を のこりとして 返す(1P と 同じ あつかい)。あふれは その 人の 足もとへ', () => {
    const { inv2, dropped, hands } = setup();
    for (let i = 0; i < inv2.size; i++) inv2.setSlot(i, { item: item('stone'), count: 1 });
    const rest = hands(2).add(item('dirt'), 4);
    expect(rest).toBe(4);
    hands(2).drop(item('dirt'), rest);
    expect(dropped).toEqual([{ at: { x: 10, y: 20, z: 30 }, item: 'dirt', count: 4 }]);
  });

  it('1P の drop は 1P の 足もと', () => {
    const { dropped, hands } = setup();
    hands(1).drop(item('dirt'), 2);
    expect(dropped).toEqual([{ at: { x: 1, y: 2, z: 3 }, item: 'dirt', count: 2 }]);
  });

  it('2P が いない のに who 2 が 来ても、中身は 1P の 手に する（なくさない）', () => {
    const { inv1, dropped, hands } = setup(false);
    expect(hands(2).add(item('dirt'), 2)).toBe(0);
    expect(inv1.count(item('dirt'))).toBe(2);
    hands(2).drop(item('dirt'), 1);
    expect(dropped).toEqual([{ at: { x: 1, y: 2, z: 3 }, item: 'dirt', count: 1 }]);
  });
});

describe('AC148: mine.ts の open の 中身（router）', () => {
  function routerSetup() {
    const s = setup();
    const said: string[] = [];
    const router = createChestRouter({ hands: s.hands, say: (t) => void said.push(t) });
    return { ...s, said, router };
  }

  it('run(2, …) の あいだ add・drop は 2P の 手。おわると 1P の 手に もどる', () => {
    const { inv1, inv2, dropped, router } = routerSetup();
    router.run(2, () => {
      expect(router.add(item('dirt'), 2)).toBe(0);
      router.drop(item('stone'), 1);
    });
    expect(inv2.count(item('dirt'))).toBe(2);
    expect(dropped).toEqual([{ at: { x: 10, y: 20, z: 30 }, item: 'stone', count: 1 }]);
    router.add(item('dirt'), 1); // run の 外は 1P
    expect(inv1.count(item('dirt'))).toBe(1);
  });

  it('fn が 例外を なげても 1P に もどる（次の 1P の 宝箱が 2P の 手に ならない）', () => {
    const { inv1, router } = routerSetup();
    expect(() => router.run(2, () => { throw new Error('x'); })).toThrow('x');
    router.add(item('dirt'), 1);
    expect(inv1.count(item('dirt'))).toBe(1);
  });

  it('say: 1P が あけた とき（run の 外も）は 1P の ログ・画面に 1 回。2P が あけた ときは 出さない', () => {
    const { said, router } = routerSetup();
    router.run(1, () => router.say('からっぽ だよ'));
    router.say('もちものが いっぱい');
    expect(said).toEqual(['からっぽ だよ', 'もちものが いっぱい']);
    router.run(2, () => {
      router.say('からっぽ だよ');
      router.say('もちものが いっぱい');
    });
    expect(said).toHaveLength(2);
  });

  it('busy は 2 人で 1 つ: 1P が あけて 動いている 宝箱は 2P の run の 中からも 動いている と 見える', () => {
    const { router } = routerSetup();
    router.busy.add('5,10,6');
    router.run(2, () => expect(router.busy.has('5,10,6')).toBe(true));
    router.busy.delete('5,10,6');
    router.run(1, () => expect(router.busy.has('5,10,6')).toBe(false));
  });
});
