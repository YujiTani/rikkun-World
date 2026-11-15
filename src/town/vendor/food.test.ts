import { describe, expect, it } from 'vitest';
import type { ItemId } from '../../contracts';
import { InventoryImpl } from '../../inventory/Inventory';
import { FoodService } from './food';
import { FOOD_TABLE, FOOD_TUNING } from './vendorTable';

/** TOWN-1 1E AC48: やたいの 食事（だんご・ごはん で 体力 回復）。もぐもぐ の あと ハートが 1 こずつ ふえる */
const ORB = 'yokai_orb' as ItemId;
const MAX = 20;

class Body {
  hpNow: number;
  constructor(hp: number, readonly max = MAX) {
    this.hpNow = hp;
  }
  hp(): number {
    return this.hpNow;
  }
  maxHp(): number {
    return this.max;
  }
  dead(): boolean {
    return this.hpNow <= 0;
  }
  heal(n: number): number {
    const b = this.hpNow;
    this.hpNow = Math.min(this.max, this.hpNow + n);
    return this.hpNow - b;
  }
}

function rig(hp1: number, hp2 = MAX, orbs = 10) {
  const inv = { 1: new InventoryImpl(), 2: new InventoryImpl() };
  inv[1].add(ORB, orbs);
  inv[2].add(ORB, orbs);
  const body = { 1: new Body(hp1), 2: new Body(hp2) };
  const pops: number[] = [];
  const food = new FoodService({ inventory: (w) => inv[w], vitals: (w) => body[w], popped: (w) => void pops.push(w) });
  const run = (n = 200): void => {
    for (let i = 0; i < n; i++) food.step();
  };
  return { inv, body, food, run, pops };
}

const dangoHeal = FOOD_TABLE.dango.heal as number;

describe('AC48 食事', () => {
  it('体力 10/20 で だんご → ok・ダマ −1・体力 16（表を 読む）', () => {
    const r = rig(10);
    expect(r.food.eat(1, 'dango')).toBe('ok');
    expect(r.inv[1].count(ORB)).toBe(10 - FOOD_TABLE.dango.price);
    expect(r.body[1].hp(), 'すぐには ふえない（もぐもぐ）').toBe(10);
    r.run(FOOD_TUNING.munchSteps);
    expect(r.food.munching(1)).toBe(true);
    r.run();
    expect(r.body[1].hp()).toBe(10 + dangoHeal);
    expect(r.food.munching(1)).toBe(false);
    expect(r.pops.length, 'ハートが 1 こずつ').toBe(dangoHeal / FOOD_TUNING.popHp);
  });

  it('体力 18/20 で だんご → 20（こえない）', () => {
    const r = rig(18);
    expect(r.food.eat(1, 'dango')).toBe('ok');
    r.run();
    expect(r.body[1].hp()).toBe(MAX);
  });

  it('体力 4/20 で ごはん → ok・ダマ −3・体力 20（いちばん 多い 体力まで）', () => {
    const r = rig(4);
    expect(r.food.eat(1, 'gohan')).toBe('ok');
    expect(r.inv[1].count(ORB)).toBe(10 - FOOD_TABLE.gohan.price);
    r.run();
    expect(r.body[1].hp()).toBe(MAX);
  });

  it('体力 まんたんで → full・ダマ へらない', () => {
    const r = rig(MAX);
    expect(r.food.eat(1, 'dango')).toBe('full');
    expect(r.food.eat(1, 'gohan')).toBe('full');
    expect(r.inv[1].count(ORB)).toBe(10);
  });

  it('ダマ 2 で ごはん → short・何も かわらない', () => {
    const r = rig(4, MAX, 2);
    expect(r.food.eat(1, 'gohan')).toBe('short');
    expect(r.inv[1].count(ORB)).toBe(2);
    r.run();
    expect(r.body[1].hp()).toBe(4);
    expect(r.food.short(1, 'gohan')).toBe(1);
  });

  it('2P が 食べても 1P の 体力・ダマは かわらない', () => {
    const r = rig(10, 10);
    expect(r.food.eat(2, 'dango')).toBe('ok');
    r.run();
    expect(r.body[2].hp()).toBe(10 + dangoHeal);
    expect(r.body[1].hp()).toBe(10);
    expect(r.inv[1].count(ORB)).toBe(10);
  });

  it('もぐもぐ の 間に 当たっても 回復は へらない（当たった 分と 回復の 分は べつ）', () => {
    const r = rig(4);
    r.food.eat(1, 'gohan');
    r.run(10);
    r.body[1].hpNow -= 3; // 当たった
    r.run();
    expect(r.body[1].hp(), '4 − 3 ＋ 16').toBe(17);
  });

  it('もぐもぐ の とちゅうで やられたら 回復は 入らない。食べて いる 間は もう 1 回 食べられない（full・ダマ へらない）', () => {
    const r = rig(10);
    r.food.eat(1, 'dango');
    expect(r.food.eat(1, 'dango')).toBe('full');
    expect(r.inv[1].count(ORB)).toBe(9);
    r.body[1].hpNow = 0;
    r.run();
    expect(r.body[1].hp()).toBe(0);
    expect(r.food.munching(1)).toBe(false);
  });
});
