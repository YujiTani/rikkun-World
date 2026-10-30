import { describe, expect, it } from 'vitest';
import type { ItemId } from '../contracts';
import { InventoryImpl } from '../inventory/Inventory';
import { ITEM_TYPES, itemType } from '../inventory/items';
import { KURA_MAX, Kura, type KuraBag } from './kura';

/** HOUSE-1A AC5〜AC8・AC32（くらの 読み書き）: 建築士さん どうしで 共有の くら。1 種類 999 こ まで・種類は 無制限 */

const stackable = ITEM_TYPES.filter((t) => t.maxStack >= 2).map((t) => t.id);

function bagWith(items: Record<string, number>): InventoryImpl {
  const inv = new InventoryImpl();
  for (const [item, n] of Object.entries(items)) inv.add(item as ItemId, n);
  return inv;
}

describe('AC5 あずける: 持ち物が へり、くらが ふえる', () => {
  it('deposit(log, 10): 持ち物の き が 10 へり kura の log が 10', () => {
    const kura = new Kura();
    const bag = bagWith({ log: 20 });
    expect(kura.deposit(bag, 'log', 10)).toBe(10);
    expect(bag.count('log')).toBe(10);
    expect(kura.count('log')).toBe(10);
    expect(kura.totals()).toEqual({ log: 10 });
  });

  it('同じ 種類を 重ねて あずけられる。ほかの 種類とは 別', () => {
    const kura = new Kura();
    const bag = bagWith({ log: 30, stone: 5 });
    kura.deposit(bag, 'log', 10);
    kura.deposit(bag, 'log', 5);
    kura.deposit(bag, 'stone', 5);
    expect(kura.totals()).toEqual({ log: 15, stone: 5 });
    expect(bag.count('log')).toBe(15);
    expect(bag.count('stone')).toBe(0);
  });

  it('持っている より 多く たのむと 持っている ぶんだけ。持っていない・0 以下・小数・知らない id は 0 こ', () => {
    const kura = new Kura();
    const bag = bagWith({ log: 4 });
    expect(kura.deposit(bag, 'log', 100)).toBe(4);
    expect(kura.deposit(bag, 'log', 1)).toBe(0); // もう ない
    expect(kura.deposit(bagWith({ log: 4 }), 'stone', 3)).toBe(0);
    for (const n of [0, -3, Number.NaN]) expect(kura.deposit(bagWith({ log: 4 }), 'log', n)).toBe(0);
    expect(kura.deposit(bagWith({ log: 4 }), 'log', 2.9)).toBe(2); // 小数は 切りすて
    expect(kura.deposit(bag, 'no_such_item' as ItemId, 3)).toBe(0);
  });

  it('メニューが とじていても 使える（ゲームの 状態に よらない）: 窓口は Kura 単体で 動く', () => {
    const kura = new Kura();
    expect(kura.totals()).toEqual({});
    expect(kura.count('log')).toBe(0);
  });
});

describe('AC6 1 種類 999 こ まで・種類は 無制限', () => {
  it('999 こ', () => {
    expect(KURA_MAX).toBe(999);
  });

  it('998 こ ある 所に 5 こ あずけると 1 こ だけ 入り、4 こは 持ち物に のこる', () => {
    const kura = new Kura();
    kura.restore({ log: 998 });
    const bag = bagWith({ log: 5 });
    expect(kura.deposit(bag, 'log', 5)).toBe(1);
    expect(kura.count('log')).toBe(KURA_MAX);
    expect(bag.count('log')).toBe(4);
    // いっぱいの あとは 0 こ
    expect(kura.deposit(bag, 'log', 4)).toBe(0);
    expect(bag.count('log')).toBe(4);
  });

  it('種類を 50 種 あずけても 全部 入る（重ねられる 物は ぜんぶの 種類が 入る）', () => {
    // 実際の 登録表の 重ねられる 物ぜんぶ
    const kura = new Kura();
    for (const id of stackable) {
      const bag = bagWith({ [id]: 5 });
      expect(kura.deposit(bag, id, 5), id).toBe(5);
    }
    expect(Object.keys(kura.totals())).toHaveLength(stackable.length);
    // 登録表に 無い 50 種でも（重ね数だけ 差しかえて）上限なく 入る
    const fake = new Kura((id) => (id.startsWith('k') ? 64 : 0));
    const inv = {
      store: new Map<string, number>(),
      count(item: string) {
        return this.store.get(item) ?? 0;
      },
      remove(item: string, n: number) {
        const have = this.store.get(item) ?? 0;
        const t = Math.min(have, n);
        this.store.set(item, have - t);
        return t;
      },
      add(_item: string, n: number) {
        return n;
      },
    };
    for (let i = 0; i < 50; i++) inv.store.set(`k${i}`, 7);
    for (let i = 0; i < 50; i++) expect(fake.deposit(inv as unknown as KuraBag, `k${i}` as ItemId, 7)).toBe(7);
    expect(Object.keys(fake.totals())).toHaveLength(50);
  });
});

describe('AC7 とりだす: 好きな 数・ぜんぶ・入る 分だけ', () => {
  it('1 こ・37 こ・ぜんぶ', () => {
    const kura = new Kura();
    kura.restore({ log: 100 });
    const bag = new InventoryImpl();
    expect(kura.withdraw(bag, 'log', 1)).toBe(1);
    expect(kura.withdraw(bag, 'log', 37)).toBe(37);
    expect(kura.count('log')).toBe(62);
    expect(kura.withdraw(bag, 'log', kura.count('log'))).toBe(62); // ぜんぶ
    expect(kura.count('log')).toBe(0);
    expect(kura.totals()).toEqual({});
    expect(bag.count('log')).toBe(100);
  });

  it('持ち物の 空きが 1 マス（き 64 こ ぶん）で 100 こ たのむと 64 こ だけ 出て、のこりは くらに ある', () => {
    const kura = new Kura();
    kura.restore({ log: 100 });
    const bag = new InventoryImpl();
    // 35 マスを ほかの もので うめる（き を 重ねられない 物）
    const filler = ITEM_TYPES.filter((t) => t.id !== 'log' && t.maxStack === 1).slice(0, 35);
    expect(filler).toHaveLength(35);
    for (const t of filler) expect(bag.add(t.id, 1)).toBe(0);
    expect(kura.withdraw(bag, 'log', 100)).toBe(64);
    expect(bag.count('log')).toBe(64);
    expect(kura.count('log')).toBe(36);
    // もう 空きが ない: 0 こ
    expect(kura.withdraw(bag, 'log', 10)).toBe(0);
    expect(kura.count('log')).toBe(36);
  });

  it('くらに ある より 多く たのむと ある ぶんだけ。ない 種類・0 以下は 0 こ', () => {
    const kura = new Kura();
    kura.restore({ log: 10 });
    const bag = new InventoryImpl();
    expect(kura.withdraw(bag, 'log', 500)).toBe(10);
    expect(kura.withdraw(bag, 'log', 1)).toBe(0);
    expect(kura.withdraw(bag, 'stone', 1)).toBe(0);
    for (const n of [0, -1, Number.NaN]) expect(kura.withdraw(bag, 'log', n)).toBe(0);
  });
});

describe('AC8 1 マスに 1 こ しか 重ならない 物は あずけられない', () => {
  it('刀・みずもり・どうづき・防具・道具は 0 こ 動く（持ち物も くらも そのまま）', () => {
    const ones = ['katana', 'mizumori', 'dotsuki', 'kabuto', 'wood_pickaxe', 'kuwa'] as const;
    for (const id of ones) {
      expect(itemType(id)!.maxStack, id).toBe(1);
      const kura = new Kura();
      const bag = bagWith({ [id]: 1 });
      expect(kura.deposit(bag, id, 1), id).toBe(0);
      expect(bag.count(id), id).toBe(1);
      expect(kura.totals(), id).toEqual({});
    }
  });

  it('1 マスに 1 こ の 物は くらに あっても（ふるい データでも）出てこない', () => {
    const kura = new Kura();
    kura.restore({ katana: 3, log: 2 });
    expect(kura.totals()).toEqual({ log: 2 });
  });
});

describe('くらの 並びと 読み書き（AC32）', () => {
  it('totals・entries は 1 こ以上の 種類だけ。登録表（ITEM_TYPES）の 並び', () => {
    const kura = new Kura();
    kura.restore({ stone: 3, log: 2, dirt: 1, grass: 0 });
    const order = ITEM_TYPES.map((t) => t.id as string);
    const ids = kura.entries().map((e) => e.item as string);
    expect(ids).toEqual(['dirt', 'stone', 'log'].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(Object.keys(kura.totals())).toEqual(ids);
    expect(kura.entries().find((e) => e.item === 'grass')).toBeUndefined();
  });

  it('serialize → restore で 同じ（往復）。1 こ以上だけ 書く', () => {
    const a = new Kura();
    const bag = bagWith({ log: 30, dirt: 12 });
    a.deposit(bag, 'log', 30);
    a.deposit(bag, 'dirt', 12);
    const data = JSON.parse(JSON.stringify(a.serialize()));
    expect(data).toEqual({ log: 30, dirt: 12 });
    const b = new Kura();
    b.restore(data);
    expect(b.totals()).toEqual(a.totals());
  });

  it('古いセーブ・こわれた データは 空の くら。ひとつ 悪くても ほかは 読む。999 を こえた 数は 999', () => {
    const k = new Kura();
    for (const bad of [undefined, null, 5, 'x', [], [1, 2]]) {
      k.restore(bad);
      expect(k.totals(), String(bad)).toEqual({});
    }
    k.restore({ log: '3', stone: -4, dirt: 2.7, sand: Number.NaN, no_such: 5, grass: 5000 });
    expect(k.totals()).toEqual({ dirt: 2, grass: KURA_MAX });
  });

  it('restore は 前の 中身を すてる（セーブを 読みなおす）', () => {
    const k = new Kura();
    k.restore({ log: 5 });
    k.restore({ stone: 2 });
    expect(k.totals()).toEqual({ stone: 2 });
    k.clear();
    expect(k.totals()).toEqual({});
  });
});

describe('canHold（あずけられる 物か）', () => {
  it('重ねられる 物は true、道具・武器・知らない id は false', () => {
    const kura = new Kura();
    expect(kura.canHold('log')).toBe(true);
    expect(kura.canHold('mizumori')).toBe(false);
    expect(kura.canHold('no_such_item')).toBe(false);
    for (const id of stackable) expect(kura.canHold(id), id).toBe(true);
  });
});
