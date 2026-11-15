import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { ShopService } from './shop';
import { ShopSessions, shopFreezesWorld, type ShopSfx } from './shopSession';
import { SHOP_TEXT } from './shopText';
import { SHOP_BOXES, SHOP_ORDER } from './shopTable';

/**
 * TOWN-1 1C: よろずやの 画面の 状態（人ごと）。AC14 の 見える 側（ふきだし）・AC20（1.3: 1 人は 止める／2 人は 止めない・やられたら とじる・街を 出たら とじる）。
 */
const ORB = 'yokai_orb' as ItemId;

function rig() {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  const shop = new ShopService({ inventory: (w) => inv[w], dropAtFeet: () => {}, recipesLeft: () => true }, 7);
  const sfx: ShopSfx[] = [];
  const events: string[] = [];
  const s = new ShopSessions({ shop, play: (e) => sfx.push(e), onOpen: (w) => events.push(`open${w}`), onClose: (w) => events.push(`close${w}`), onResultClose: (w) => events.push(`result${w}`) });
  return { inv, shop, s, sfx, events };
}

describe('開く・えらぶ・こうかん・とじる', () => {
  it('開くと ふきだしは あいさつ。えらぶと selected。とじると 中身も きえる', () => {
    const r = rig();
    expect(r.s.open(1)).toBe(true);
    expect(r.events).toEqual(['open1']);
    expect(r.s.view(1).open).toBe(true);
    expect(r.s.view(1).bubble).toBe(SHOP_TEXT.greet);
    expect(r.s.view(2).open).toBe(false);
    r.s.select(1, 'torch');
    expect(r.s.view(1).selected).toBe('torch');
    r.s.close(1);
    expect(r.events).toEqual(['open1', 'close1']);
    expect(r.s.view(1)).toMatchObject({ open: false, selected: null, result: null });
  });
  it('2 人 同時に 開ける（別々の 画面）', () => {
    const r = rig();
    expect(r.s.open(1)).toBe(true);
    expect(r.s.open(2)).toBe(true);
    r.s.select(2, 'egg');
    expect(r.s.view(1).selected).toBeNull();
    expect(r.s.view(2).selected).toBe('egg');
  });
  it('たりない: ふきだし「ようかいダマが あと □ こ たりないよ」・何も へらない', () => {
    const r = rig();
    r.inv[1].add(ORB, 4);
    r.s.open(1);
    expect(r.s.buy(1, 'obako')).toBe('short');
    expect(r.s.view(1).bubble).toBe(SHOP_TEXT.short(SHOP_BOXES.obako.price - 4));
    expect(r.s.view(1).bubble).toMatch(/ようかいダマ.*あと.*たりない/);
    expect(r.inv[1].count(ORB)).toBe(4);
    expect(r.s.view(1).result).toBeNull();
    expect(r.sfx.at(-1)).toEqual({ k: 'short' });
  });
  it('こばこ: 中身が result に 入る。とじる で result だけ きえて 画面は 開いた まま', () => {
    const r = rig();
    r.inv[1].add(ORB, 40);
    r.s.open(1);
    r.s.select(1, 'kobako');
    expect(r.s.press(1)).toBe('ok');
    const res = r.s.view(1).result;
    expect(res?.box).toBe('kobako');
    expect(res!.items.length).toBeGreaterThan(0);
    expect(r.sfx.some((e) => e.k === 'box')).toBe(true);
    r.s.closeResult(1);
    expect(r.s.view(1).result).toBeNull();
    expect(r.s.view(1).open).toBe(true);
    expect(r.events).toEqual(['open1', 'result1']);
  });
  it('えらんで いない ときの こうかんは 何も しない', () => {
    const r = rig();
    r.inv[1].add(ORB, 40);
    r.s.open(1);
    expect(r.s.press(1)).toBeNull();
    expect(r.inv[1].count(ORB)).toBe(40);
  });
  it('売り切れの まきもの: ふきだし「もう ぜんぶ もってるよ」・ダマ へらない', () => {
    const inv = new InventoryImpl();
    inv.add(ORB, 50);
    const shop = new ShopService({ inventory: () => inv, dropAtFeet: () => {}, recipesLeft: () => false }, 7);
    const s = new ShopSessions({ shop });
    s.open(1);
    expect(s.buy(1, 'recipe_scroll')).toBe('soldOut');
    expect(s.view(1).bubble).toBe(SHOP_TEXT.soldOut);
    expect(inv.count(ORB)).toBe(50);
  });
});

describe('パッドで うごかす（十字・A・B）', () => {
  it('はじめの 十字で いちばん 前、右で つぎ、下で cols 先。A で こうかん、B で とじる', () => {
    const r = rig();
    r.inv[2].add(ORB, 50);
    r.s.open(2);
    r.s.pad(2, 'right', 4);
    expect(r.s.view(2).selected).toBe(SHOP_ORDER[0]);
    r.s.pad(2, 'right', 4);
    expect(r.s.view(2).selected).toBe(SHOP_ORDER[1]);
    r.s.pad(2, 'down', 4);
    expect(r.s.view(2).selected).toBe(SHOP_ORDER[5]);
    r.s.pad(2, 'left', 4);
    expect(r.s.view(2).selected).toBe(SHOP_ORDER[4]);
    r.s.pad(2, 'up', 4);
    expect(r.s.view(2).selected).toBe(SHOP_ORDER[0]);
    r.s.pad(2, 'up', 4);
    expect(r.s.view(2).selected).toBe(SHOP_ORDER[0]);
    r.s.pad(2, 'confirm', 4);
    expect(r.inv[2].count(ORB)).toBeLessThan(50);
    r.s.pad(2, 'back', 4);
    expect(r.s.view(2).open).toBe(false);
  });
  it('中身の 表示の 間は A・B で 中身だけ とじる', () => {
    const r = rig();
    r.inv[1].add(ORB, 50);
    r.s.open(1);
    r.s.buy(1, 'kobako');
    r.s.pad(1, 'back', 4);
    expect(r.s.view(1).result).toBeNull();
    expect(r.s.view(1).open).toBe(true);
  });
});

describe('AC20（1.3）: 止める きまり・やられたら とじる・街を 出たら とじる', () => {
  it('1 人で 開くと 世界を 止める。2 人の ときは 1P でも 2P でも 止めない', () => {
    expect(shopFreezesWorld({ open1: true, joined: false })).toBe(true);
    expect(shopFreezesWorld({ open1: false, joined: false })).toBe(false);
    expect(shopFreezesWorld({ open1: true, joined: true })).toBe(false);
  });
  it('2 人で 開いて いる 人は 当たっても（生きて いれば）とじない。やられたら とじる（1P も 2P も 同じ）', () => {
    for (const who of [1, 2] as const) {
      const r = rig();
      r.s.open(who);
      r.s.step(who, { alive: true, inTown: true });
      expect(r.s.view(who).open).toBe(true);
      r.s.step(who, { alive: false, inTown: true });
      expect(r.s.view(who).open).toBe(false);
      expect(r.events).toEqual([`open${who}`, `close${who}`]);
    }
  });
  it('街の はんいを 出たら 自動で とじる（あける とちゅうでも 中身は もう 入って いる）', () => {
    const r = rig();
    r.inv[1].add(ORB, 50);
    r.s.open(1);
    r.s.buy(1, 'kobako');
    const got = r.shop.opens(1).kobako;
    r.s.step(1, { alive: true, inTown: false });
    expect(r.s.view(1).open).toBe(false);
    expect(r.shop.opens(1).kobako).toBe(got);
  });
  it('街の 外で 開いた とき（テストの 窓口）は 中に 入って 出る までは とじない', () => {
    const r = rig();
    r.s.open(1, false);
    r.s.step(1, { alive: true, inTown: false });
    expect(r.s.view(1).open).toBe(true);
    r.s.step(1, { alive: true, inTown: true });
    r.s.step(1, { alive: true, inTown: false });
    expect(r.s.view(1).open).toBe(false);
  });
});
