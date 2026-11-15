import { describe, expect, it } from 'vitest';
import { InventoryImpl } from '../../inventory/Inventory';
import { ShopService } from './shop';
import { ShopSessions, shopFreezesWorld, type ShopSfx } from './shopSession';
import { SHOP_TEXT } from './shopText';
import { SHOP_BOXES, SHOP_ORDER, SHOP_TUNING } from './shopTable';
import { ORB, SPOTS, rig as boxRig } from './shopTestKit';

/**
 * TOWN-1 1C: よろずやの 画面の 状態（人ごと）。AC14 の 見える 側（ふきだし）・AC20（1.3: 1 人は 止める／2 人は 止めない・やられたら とじる・街を 出たら とじる）。
 * 1.5: たからばこを こうかん すると 画面が とじて ふきだし「おみせの まえに おいたよ！」が のこる。置けない ときは 開いた まま。
 */

function rig() {
  const b = boxRig();
  const sfx: ShopSfx[] = [];
  const events: string[] = [];
  const s = new ShopSessions({ shop: b.shop, play: (e) => sfx.push(e), onOpen: (w) => events.push(`open${w}`), onClose: (w) => events.push(`close${w}`) });
  return { inv: b.inv, shop: b.shop, s, sfx, events, b };
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
    expect(r.s.view(1)).toMatchObject({ open: false, selected: null, bubble: null });
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
    expect(r.shop.boxes!.list()).toEqual([]);
    expect(r.sfx.at(-1)).toEqual({ k: 'short' });
  });
  it('こばこ（1.5）: 画面が とじ、ふきだし「おいたよ」が とじた あとも 読める・画面に 出す のは saySteps の 間', () => {
    const r = rig();
    r.inv[1].add(ORB, 40);
    r.s.open(1);
    r.s.select(1, 'kobako');
    expect(r.s.press(1)).toBe('ok');
    expect(r.s.view(1).open).toBe(false);
    expect(r.events).toEqual(['open1', 'close1']);
    expect(r.s.view(1).bubble).toBe(SHOP_TEXT.placed);
    expect(r.shop.boxes!.list().length).toBe(1);
    expect(r.s.saying(1)).toBe(SHOP_TEXT.placed);
    expect(r.s.saying(2)).toBeNull();
    for (let i = 0; i < SHOP_TUNING.saySteps; i++) r.s.tickSay();
    expect(r.s.saying(1)).toBeNull();
    expect(r.s.view(1).bubble, '窓口では まだ 読める').toBe(SHOP_TEXT.placed);
    r.s.open(1);
    expect(r.s.view(1).bubble, 'また 開くと あいさつ').toBe(SHOP_TEXT.greet);
  });
  it('置き場が いっぱい → full・画面は 開いた まま・いっぱいの 文。人で 置けない ときは べつの 文', () => {
    const r = rig();
    r.inv[1].add(ORB, 200);
    for (let i = 0; i < SPOTS.length; i++) {
      r.s.open(1);
      expect(r.s.buy(1, 'kobako')).toBe('ok');
    }
    r.s.open(1);
    expect(r.s.buy(1, 'kobako')).toBe('full');
    expect(r.s.view(1)).toMatchObject({ open: true, bubble: SHOP_TEXT.full });
    expect(r.sfx.at(-1)).toEqual({ k: 'short' });
    const q = rig();
    q.inv[1].add(ORB, 50);
    for (const s of SPOTS) q.b.bodies.add(q.b.key(s.main.x, s.main.y, s.main.z));
    q.s.open(1);
    expect(q.s.buy(1, 'kobako')).toBe('full');
    expect(q.s.view(1).bubble).toBe(SHOP_TEXT.blocked);
    expect(SHOP_TEXT.blocked).not.toBe(SHOP_TEXT.full);
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
  it('A で 箱を こうかん すると 画面は とじる（1.5）', () => {
    const r = rig();
    r.inv[1].add(ORB, 50);
    r.s.open(1);
    r.s.select(1, 'kobako');
    r.s.pad(1, 'confirm', 3);
    expect(r.s.view(1).open).toBe(false);
    expect(r.shop.boxes!.list().length).toBe(1);
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
  it('街の はんいを 出たら 自動で とじる', () => {
    const r = rig();
    r.inv[1].add(ORB, 50);
    r.s.open(1);
    r.s.buy(1, 'torch');
    r.s.step(1, { alive: true, inTown: false });
    expect(r.s.view(1).open).toBe(false);
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
