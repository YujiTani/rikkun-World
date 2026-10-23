import { describe, expect, it } from 'vitest';
import { techDamage } from '../tools/blade/BladeSystem';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { FIGHT, inReach, isUpperPunch, pickFighters, punchDamage, punchPlan, resolveCue, round2 } from './fight';

/** LIVE-4 の 小さな 計算（docs/design/LIVE-4.md §2.2・§2.3・§4.1） */
describe('パンチ の 時間（刀 の 突き を 読む）', () => {
  it('今 の 数 4・2・35: 5 ステップ目 に 当たる・1 回 41 ステップ', () => {
    expect(punchPlan(W2_SETTING_DEFAULTS.bladeTech.thrust)).toEqual({ hitAt: 5, total: 41 });
  });
  it('6・2・40: 7 ステップ目・48 ステップ（刀 の 数 に あわせて かわる）', () => {
    expect(punchPlan({ startup: 6, active: 2, recovery: 40 })).toEqual({ hitAt: 7, total: 48 });
  });
  it('0 や 小数 でも こわれない（当たる コマ は 1 以上・ながさ は 当たる コマ 以上）', () => {
    const p = punchPlan({ startup: 0, active: 0, recovery: 0 });
    expect(p.hitAt).toBe(1);
    expect(p.total).toBeGreaterThanOrEqual(p.hitAt);
  });
});

describe('きりあげ は 3 回 に 1 回', () => {
  it('当てた 数 0,1 → ふつう、2 → きりあげ、3,4 → ふつう、5 → きりあげ', () => {
    expect([0, 1, 2, 3, 4, 5, 8].map(isUpperPunch)).toEqual([false, false, true, false, false, true, true]);
  });
  it('ダメージ: ふつう = 2、きりあげ = 2 × 1.15 = 2.3（刀 の techDamage と 同じ 丸め）', () => {
    const mul = W2_SETTING_DEFAULTS.bladeDamageMul.kiriage;
    expect(punchDamage(2, false, mul)).toBe(2);
    expect(punchDamage(2, true, mul)).toBe(2.3);
    for (const [a, m] of [[2, 1.15], [2, 1.333], [3, 0.77], [1, 2.5]] as const) expect(round2(a * m)).toBe(techDamage(a, m));
  });
});

describe('たたかう 子 を えらぶ', () => {
  const c = (id: number, joinNo: number) => ({ id, joinNo });
  it('なかま に なった 順 の いちばん 早い 1 わ', () => {
    expect(pickFighters([c(5, 3), c(2, 1), c(9, 2)], 1)).toEqual([2]);
  });
  it('同じ 順 なら id の 小さい 方。2 わ・0 わ も いえる', () => {
    expect(pickFighters([c(7, 1), c(3, 1), c(4, 2)], 2)).toEqual([3, 7]);
    expect(pickFighters([c(7, 1)], 0)).toEqual([]);
    expect(pickFighters([], 1)).toEqual([]);
    expect(pickFighters([c(1, 1)], -3)).toEqual([]);
  });
});

describe('きっかけ から ねらい を きめる', () => {
  it('りっくん が たたいた が さき（さいご の 1 体）', () => {
    expect(resolveCue([4, 6], [2])).toEqual({ yokai: 6, cause: 'playerHit' });
  });
  it('たたかれた だけ なら id の いちばん 小さい 妖怪', () => {
    expect(resolveCue([], [9, 3, 5])).toEqual({ yokai: 3, cause: 'playerHurt' });
  });
  it('どちら も なければ null', () => {
    expect(resolveCue([], [])).toBeNull();
  });
});

describe('とどく か', () => {
  it('当たり の 箱 の ふち まで 1.2 以内・高さ 2 以内', () => {
    expect(inReach(1.8, 0, 0.6, 1.2)).toBe(true);
    expect(inReach(1.81, 0, 0.6, 1.2)).toBe(false);
    expect(inReach(1.0, 2, 0.6, 1.2)).toBe(true);
    expect(inReach(1.0, 2.01, 0.6, 1.2)).toBe(false);
    expect(inReach(1.0, -2.5, 0.6, 1.2)).toBe(false);
  });
  it('ゆとり を 足すと その ぶん だけ ひろい', () => {
    expect(inReach(1.9, 0, 0.6, 1.2, FIGHT.hitSlack)).toBe(true);
  });
});
