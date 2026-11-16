import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { fakeWallet } from '../../dama/walletTestKit';
import { InventoryImpl } from '../../inventory/Inventory';
import { SHOP_GOODS } from '../shop/shopTable';
import { KaitoriService } from './kaitori';
import { KAITORI_ROWS, KAITORI_TUNING } from './vendorTable';

/** TOWN-1 1E AC35・AC36・AC28（やたいの きょうの 数）: かいとりの やたい */

function rig() {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  let day = 0;
  let joined = true;
  const wallet = fakeWallet(); // 1.6〔1F〕: さいふ（かいとりの ようかいダマは さいふへ。足もとに 落とさない）
  const svc = new KaitoriService({ inventory: (w) => (w === 2 && !joined ? null : inv[w]), wallet, day: () => day });
  return {
    inv,
    wallet,
    svc,
    setDay: (d: number) => {
      day = d;
    },
    leave2: () => {
      joined = false;
    },
  };
}

describe('AC3（1.6）: かいとりの ダマは さいふへ（もちものが いっぱいでも 落とさない）', () => {
  it('もちものが ほかの 物で ぜんぶ うまって いても トマト 10 → ok・さいふ ＋1・もちものの yokai_orb は 0', () => {
    const r = rig();
    const inv = r.inv[1];
    for (let i = 0; i < inv.slots().length; i++) inv.setSlot(i, { item: 'dirt' as ItemId, count: 1 });
    inv.setSlot(0, { item: 'tomato' as ItemId, count: 10 });
    expect(r.svc.give(1, 'tomato')).toBe('ok');
    expect(r.wallet.count(1)).toBe(1);
    expect(inv.count('yokai_orb' as ItemId)).toBe(0);
  });
});

describe('AC35 かいとりの やたい', () => {
  it('トマト 10 → ok・トマト −10・ダマ +1。トマト 9 → short', () => {
    const r = rig();
    r.inv[1].add('tomato', 10);
    expect(r.svc.give(1, 'tomato')).toBe('ok');
    expect(r.inv[1].count('tomato')).toBe(0);
    expect(r.wallet.count(1)).toBe(1);
    r.inv[1].add('tomato', 9);
    expect(r.svc.give(1, 'tomato')).toBe('short');
    expect(r.inv[1].count('tomato')).toBe(9);
    expect(r.wallet.count(1)).toBe(1);
  });

  it('§4.9 の 各行（表を 読む）: need こ わたして ようかいダマ 1。need−1 は short', () => {
    for (const row of KAITORI_ROWS) {
      const r = rig();
      r.inv[1].add(row.item, row.need - 1);
      expect(r.svc.give(1, row.item), `${row.item} たりない`).toBe('short');
      r.inv[1].add(row.item, 1);
      expect(r.svc.give(1, row.item), row.item).toBe('ok');
      expect(r.inv[1].count(row.item)).toBe(0);
      expect(r.wallet.count(1)).toBe(1);
    }
  });

  it('rows は もちものに ある 表の 物だけ（have・need・canGive）', () => {
    const r = rig();
    r.inv[1].add('tomato', 9);
    r.inv[1].add('egg', 4);
    r.inv[1].add('dirt', 30);
    const st = r.svc.state(1);
    expect(st.rows.map((x) => x.item)).toEqual(['tomato', 'egg']);
    expect(st.rows[0]).toEqual({ item: 'tomato', need: 10, have: 9, canGive: false });
    expect(st.rows[1]).toEqual({ item: 'egg', need: 4, have: 4, canGive: true });
    expect(st.cap).toBe(KAITORI_TUNING.dailyCap);
    expect(st.today).toBe(0);
    expect(r.svc.give(1, 'dirt' as ItemId), '表に ない 物').toBe('short');
  });

  it('きょう 上限まで もらうと cap・物は へらない。つぎの ひるの はじめの ステップで today 0', () => {
    const r = rig();
    r.inv[1].add('crystal', 64);
    for (let i = 0; i < KAITORI_TUNING.dailyCap; i++) expect(r.svc.give(1, 'crystal')).toBe('ok');
    expect(r.svc.state(1).today).toBe(KAITORI_TUNING.dailyCap);
    expect(r.svc.give(1, 'crystal')).toBe('cap');
    expect(r.inv[1].count('crystal')).toBe(64 - KAITORI_TUNING.dailyCap);
    expect(r.svc.state(1).rows[0]!.canGive).toBe(false);
    r.setDay(1);
    r.svc.step();
    expect(r.svc.state(1).today).toBe(0);
    expect(r.svc.give(1, 'crystal')).toBe('ok');
  });

  it('1P と 2P の today は 別', () => {
    const r = rig();
    r.inv[1].add('crystal', 3);
    r.inv[2].add('crystal', 3);
    r.svc.give(1, 'crystal');
    r.svc.give(1, 'crystal');
    expect(r.svc.state(1).today).toBe(2);
    expect(r.svc.state(2).today).toBe(0);
    r.svc.give(2, 'crystal');
    expect(r.svc.state(2).today).toBe(1);
    expect(r.wallet.count(1)).toBe(2);
    expect(r.wallet.count(2)).toBe(1);
  });

  it('保存: きょうの 数と その 日が 2 人とも のこる。古い セーブは 0', () => {
    const r = rig();
    r.inv[1].add('crystal', 3);
    r.inv[2].add('crystal', 3);
    r.svc.give(1, 'crystal');
    r.svc.give(2, 'crystal');
    r.svc.give(2, 'crystal');
    const data = JSON.parse(JSON.stringify(r.svc.serialize()));
    const r2 = rig();
    r2.svc.deserialize(data);
    expect(r2.svc.state(1).today).toBe(1);
    expect(r2.svc.state(2).today).toBe(2);
    // 日が かわって いれば 0
    const r3 = rig();
    r3.setDay(5);
    r3.svc.deserialize(data);
    expect(r3.svc.state(1).today).toBe(0);
    const r4 = rig();
    r4.svc.deserialize(null);
    expect(r4.svc.state(1).today).toBe(0);
    r4.svc.deserialize({ v: 99, p: 'x' });
    expect(r4.svc.state(2).today).toBe(0);
  });

  it('2P が いなければ short', () => {
    const r = rig();
    r.leave2();
    expect(r.svc.give(2, 'tomato')).toBe('short');
    expect(r.svc.state(2).rows).toEqual([]);
  });
});

describe('AC36 ぐるぐる 回らない', () => {
  it('§4.9 の どの 行も よろずやで 買う 1 こ あたりの ダマ ＞ やたいで 1 こ あたりに もらえる ダマ（両方の 表に ある 物）', () => {
    let compared = 0;
    for (const row of KAITORI_ROWS) {
      for (const g of SHOP_GOODS) {
        if (g.give.length !== 1 || g.give[0]!.item !== row.item) continue;
        const buy = g.price / g.give[0]!.count;
        const sell = 1 / row.need;
        expect(buy, row.item).toBeGreaterThan(sell);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(0);
  });
});
