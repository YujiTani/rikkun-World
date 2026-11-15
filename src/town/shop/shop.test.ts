import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { ITEM_DEFS } from '../../content/items/registry';
import { KONGO_IDS } from '../../content/items/ids';
import { InventoryImpl } from '../../inventory/Inventory';
import { rarityTier } from '../../drops/rarityTable';
import { rollChest } from '../../world/gen/mineChest';
import { chestTableOf } from '../../world/gen/mineChestTable';
import { ShopService, boxSample, boxSeed, rollBox, shopGivenItems, type ShopPorts } from './shop';
import { SHOP_BOXES, SHOP_GOODS, SHOP_ORDER, shopPrice, type ShopGive } from './shopTable';

/**
 * TOWN-1 区切り 1C（TOWN-1-shop.md §2.6・§2.7・§4.2・§4.3）の ユニットテスト。数は 決め打ちせず 表（SHOP_GOODS・SHOP_BOXES・宝箱の 表）から 読む（#311）。
 * AC13（こうかん 全部の 行）・AC14（たりない・売り切れ）・AC15（売らない 物）・AC16（こばこの くじ）・AC17（おおばこ）・AC18（いっぱい）・AC28（保存）。
 */

const ORB = 'yokai_orb' as ItemId;
const SEED = 1234;

function rig(opts: { learnedAll?: boolean } = {}) {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  const dropped: { who: 1 | 2; stacks: ShopGive[] }[] = [];
  let joined2 = true;
  const ports: ShopPorts = {
    inventory: (who) => (who === 2 && !joined2 ? null : inv[who]),
    dropAtFeet: (who, stacks) => dropped.push({ who, stacks: stacks.map((s) => ({ ...s })) }),
    recipesLeft: () => !opts.learnedAll,
  };
  const shop = new ShopService(ports, SEED);
  return {
    shop,
    inv,
    dropped,
    give: (who: 1 | 2, n: number) => inv[who].add(ORB, n),
    leave2: () => {
      joined2 = false;
    },
  };
}

describe('AC13: こうかん（§4.2 の 各行）', () => {
  it('ダマ 10 で たいまつ → ok・ダマ 8・torch ＋8（数は 表から）', () => {
    const r = rig();
    r.give(1, 10);
    const torch = SHOP_GOODS.find((g) => g.id === 'torch')!;
    expect(r.shop.buy(1, 'torch').status).toBe('ok');
    expect(r.shop.dama(1)).toBe(10 - torch.price);
    expect(r.inv[1].count('torch')).toBe(torch.give[0]!.count);
  });
  it('表の 全部の 品の 行で ダマが ねだん だけ へり 中身が 入る', () => {
    for (const g of SHOP_GOODS) {
      const r = rig();
      r.give(1, 200);
      const before = new Map(g.give.map((s) => [s.item, r.inv[1].count(s.item)]));
      expect(r.shop.buy(1, g.id).status, g.id).toBe('ok');
      expect(r.shop.dama(1), g.id).toBe(200 - g.price);
      for (const s of g.give) expect(r.inv[1].count(s.item), `${g.id} の ${s.item}`).toBe(before.get(s.item)! + s.count);
    }
  });
  it('カードの 順は 表の 順。いちばん 後ろ 2 つが こばこ・おおばこ。ねだんは 表と 同じ', () => {
    const r = rig();
    const rows = r.shop.rows(1);
    expect(rows.map((x) => x.id)).toEqual([...SHOP_GOODS.map((g) => g.id), 'kobako', 'obako']);
    for (const x of rows) expect(x.price).toBe(shopPrice(x.id));
    expect(SHOP_BOXES.obako.price).toBe(shopPrice('obako'));
  });
  it('2P が こうかんしても 1P の ダマ・もちものは かわらない', () => {
    const r = rig();
    r.give(1, 30);
    r.give(2, 30);
    expect(r.shop.buy(2, 'torch').status).toBe('ok');
    expect(r.shop.dama(1)).toBe(30);
    expect(r.inv[1].count('torch')).toBe(0);
  });
});

describe('AC14: たりない・売り切れ', () => {
  it('ダマ 1 で ねだん 2 の 品 → short・ダマ 1 の まま・canBuy false', () => {
    const r = rig();
    r.give(1, 1);
    const g = SHOP_GOODS.find((x) => x.price === 2)!;
    expect(r.shop.rows(1).find((x) => x.id === g.id)!.canBuy).toBe(false);
    expect(r.shop.buy(1, g.id).status).toBe('short');
    expect(r.shop.dama(1)).toBe(1);
    expect(r.shop.short(1, g.id)).toBe(g.price - 1);
    for (const s of g.give) expect(r.inv[1].count(s.item)).toBe(0);
  });
  it('レシピを ぜんぶ おぼえて いると まきものは soldOut・soldOut・ダマ へらない', () => {
    const r = rig({ learnedAll: true });
    r.give(1, 100);
    const row = r.shop.rows(1).find((x) => x.id === 'recipe_scroll')!;
    expect(row.soldOut).toBe(true);
    expect(row.canBuy).toBe(false);
    expect(r.shop.buy(1, 'recipe_scroll').status).toBe('soldOut');
    expect(r.shop.dama(1)).toBe(100);
    expect(r.inv[1].count('recipe_scroll')).toBe(0);
  });
  it('まだ おぼえて いない レシピが あれば まきものは 売り物（1 まい）', () => {
    const r = rig();
    r.give(1, 100);
    expect(r.shop.buy(1, 'recipe_scroll').status).toBe('ok');
    expect(r.inv[1].count('recipe_scroll')).toBe(1);
    expect(r.shop.opens(1).scroll).toBe(1);
  });
});

describe('AC15: 売らない 物', () => {
  it('売り物の 表に レジェンダリー（★7）・金剛そうび・ようかいダマ が ない', () => {
    const items = shopGivenItems();
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) {
      expect(ITEM_DEFS[it as keyof typeof ITEM_DEFS].rarity, it).not.toBe('legendary');
      expect(KONGO_IDS as readonly string[], it).not.toContain(it);
      expect(it).not.toBe(ORB);
    }
    expect(SHOP_ORDER).not.toContain(ORB);
  });
});

describe('AC16: こばこ（宝箱と 同じ くじ・たねは 世界の シード・人・回数）', () => {
  it('ダマ −ねだん。中身は 同じ たねの rollChest(kodo) と 同じ。あける たびに たねが かわる', () => {
    const r = rig();
    r.give(1, 100);
    const a = r.shop.buy(1, 'kobako');
    expect(a.status).toBe('ok');
    expect(r.shop.dama(1)).toBe(100 - SHOP_BOXES.kobako.price);
    const want0 = rollChest('kodo', boxSeed(SEED, 1, 'kobako', 0)).items;
    expect(a.result!.items.map((x) => ({ item: x.item, count: x.count }))).toEqual(want0);
    for (const x of a.result!.items) expect(x.rarity).toBe(rarityTier(ITEM_DEFS[x.item as keyof typeof ITEM_DEFS].rarity).stars);
    expect(r.shop.opens(1).kobako).toBe(1);
    const b = r.shop.buy(1, 'kobako');
    expect(b.result!.items.map((x) => ({ item: x.item, count: x.count }))).toEqual(rollChest('kodo', boxSeed(SEED, 1, 'kobako', 1)).items);
    expect(boxSeed(SEED, 1, 'kobako', 0)).not.toBe(boxSeed(SEED, 1, 'kobako', 1));
  });
  it('同じ セーブ・同じ 順なら いつも 同じ 中身', () => {
    const run = () => {
      const r = rig();
      r.give(1, 100);
      return [r.shop.buy(1, 'kobako').result, r.shop.buy(1, 'kobako').result];
    };
    expect(run()).toEqual(run());
  });
  it('1P と 2P の 回数は 別（2P が あけても 1P の つぎの 中身は かわらない）', () => {
    const a = rig();
    a.give(1, 100);
    const solo = a.shop.buy(1, 'kobako').result;
    const b = rig();
    b.give(1, 100);
    b.give(2, 100);
    b.shop.buy(2, 'kobako');
    b.shop.buy(2, 'kobako');
    expect(b.shop.buy(1, 'kobako').result).toEqual(solo);
    expect(b.shop.opens(1).kobako).toBe(1);
    expect(b.shop.opens(2).kobako).toBe(2);
    expect(boxSeed(SEED, 1, 'kobako', 0)).not.toBe(boxSeed(SEED, 2, 'kobako', 0));
  });
  it('世界の シードが ちがえば たねも ちがう', () => {
    expect(boxSeed(1, 1, 'kobako', 0)).not.toBe(boxSeed(2, 1, 'kobako', 0));
    expect(boxSeed(1, 1, 'kobako', 0)).not.toBe(boxSeed(1, 1, 'obako', 0));
  });
});

describe('AC17: おおばこ（段 4 かくてい・★7 は 1 回 あけて 10%）', () => {
  it('ダマ −ねだん。中身は 5 こで ★6 が 1 こ 以上', () => {
    const r = rig();
    r.give(1, 300);
    const res = r.shop.buy(1, 'obako');
    expect(res.status).toBe('ok');
    expect(r.shop.dama(1)).toBe(300 - SHOP_BOXES.obako.price);
    expect(res.result!.items.length).toBe(5);
    expect(res.result!.items.some((x) => x.rarity >= 6)).toBe(true);
    expect(r.shop.opens(1).obako).toBe(1);
  });
  it('10,000 回で ★7 が 1 こ 以上 出る 回の わりあい ＝ 表から 計算した 値 ±0.01（決定の 0.10 ± 0.01）', () => {
    const T = chestTableOf(SHOP_BOXES.obako.table);
    const row = T.tiers.find((t) => t.chance > 0)!;
    const random = row.slots - (row.sure ? 1 : 0);
    const want = 1 - (1 - T.legendary) ** random;
    expect(Math.abs(want - 0.1)).toBeLessThanOrEqual(0.01);
    const N = 10_000;
    let hit = 0;
    let five = 0;
    let mythic = 0;
    for (let n = 0; n < N; n++) {
      const items = rollBox('obako', boxSeed(SEED, 1, 'obako', n));
      if (items.some((x) => x.rarity === 7)) hit++;
      if (items.length === 5) five++;
      if (items.some((x) => x.rarity >= 6)) mythic++;
    }
    expect(Math.abs(hit / N - want)).toBeLessThanOrEqual(0.01);
    expect(five).toBe(N);
    expect(mythic).toBe(N);
  });
  it('おおばこの 表は 段 4 だけ（ほかの 段の わりあい 0）', () => {
    const T = chestTableOf(SHOP_BOXES.obako.table);
    for (const t of T.tiers) expect(t.chance, `段 ${t.tier}`).toBe(t.tier === 4 ? 1 : 0);
    expect(T.tiers.find((t) => t.tier === 4)!.sure).toBe('mythic');
  });
});

describe('AC18: もちものが いっぱいに 近い とき', () => {
  it('あきが 2 マスで おおばこ → 入らない 分は 足もとに 落ち、合わせて 5 こ', () => {
    const r = rig();
    const inv = r.inv[1];
    const size = inv.slots().length;
    // ダマ 1 マス ＋ ほかを うめて あき 2
    inv.add(ORB, 100);
    for (let i = 0; i < size; i++) if (!inv.slots()[i]) inv.setSlot(i, { item: 'dirt' as ItemId, count: 1 });
    // あき 2: うしろの 2 マスを あける（ダマの マス は のこす）
    let freed = 0;
    for (let i = size - 1; i >= 0 && freed < 2; i--) {
      if (inv.slots()[i]?.item === 'dirt') {
        inv.setSlot(i, null);
        freed++;
      }
    }
    const res = r.shop.buy(1, 'obako');
    expect(res.status).toBe('ok');
    const items = res.result!.items;
    expect(items.length).toBe(5);
    // もちものに 入った 数 ＋ 足もとの 数 ＝ 中身の 数（しゅるいごと）
    const want = new Map<string, number>();
    for (const x of items) want.set(x.item, (want.get(x.item) ?? 0) + x.count);
    const dropped = new Map<string, number>();
    for (const d of r.dropped) for (const s of d.stacks) dropped.set(s.item, (dropped.get(s.item) ?? 0) + s.count);
    expect(r.dropped.length).toBeGreaterThan(0);
    for (const [item, n] of want) expect(inv.count(item as ItemId) + (dropped.get(item) ?? 0), item).toBe(n);
    // 入った マスは 2 つ まで（かさなる 物は 同じ マスへ）
    expect(inv.slots().filter((s) => s === null).length).toBe(0);
  });
});

describe('AC28: 保存（箱と まきものの 回数。人ごと）', () => {
  it('セーブして 開きなおすと 1P・2P の 回数が 同じ。つぎの 中身も つづき', () => {
    const r = rig();
    r.give(1, 100);
    r.give(2, 100);
    r.shop.buy(1, 'kobako');
    r.shop.buy(2, 'kobako');
    r.shop.buy(2, 'kobako');
    const data = JSON.parse(JSON.stringify(r.shop.serialize()));
    const r2 = rig();
    r2.shop.deserialize(data);
    expect(r2.shop.opens(1)).toEqual(r.shop.opens(1));
    expect(r2.shop.opens(2)).toEqual(r.shop.opens(2));
    r2.give(1, 100);
    expect(r2.shop.buy(1, 'kobako').result!.items.map((x) => ({ item: x.item, count: x.count }))).toEqual(rollChest('kodo', boxSeed(SEED, 1, 'kobako', 1)).items);
  });
  it('古い セーブ（記録 なし・形ちがい）は 2 人とも 0 回', () => {
    const r = rig();
    for (const d of [null, undefined, 3, { v: 99 }, { v: 1, opens: 'x' }]) {
      r.shop.deserialize(d);
      expect(r.shop.opens(1)).toEqual({ kobako: 0, obako: 0, scroll: 0 });
      expect(r.shop.opens(2)).toEqual({ kobako: 0, obako: 0, scroll: 0 });
    }
  });
});

describe('2P が いない とき', () => {
  it('2P の こうかんは できない（ダマ 0・short）', () => {
    const r = rig();
    r.leave2();
    expect(r.shop.dama(2)).toBe(0);
    expect(r.shop.buy(2, 'torch').status).toBe('short');
  });
});

describe('「こんな ものが でるかも」（§2.7 の 5）', () => {
  it('こばこは ★1〜★6（★7 は とても すくない ので 見せない）、おおばこは ★2〜★7（★6 かくてい・★7 あり）', () => {
    expect(boxSample('kobako')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(boxSample('obako')).toEqual([2, 3, 4, 5, 6, 7]);
  });
});
