import { describe, expect, it } from 'vitest';
import { GADGET_TUNING } from '../content/items/gadgetTuning';
import { KiteSystem } from './kite';

/** ITEM-FX-1 AC8〜AC10: たこ。約束は docs/tickets/ITEM-FX-1-contract.md §5 */

const P = { x: 10.5, y: 9, z: 20.5 };

describe('たこをあげる（AC8）', () => {
  it('右クリックで 上がり、プレイヤーの上空 表の高さ（約 20 ブロック）のあたりを ゆらゆら揺れる', () => {
    const k = new KiteSystem();
    expect(k.up()).toBe(false);
    expect(k.position()).toBeNull();
    expect(k.height(P)).toBeNull();
    expect(k.toggle(P)).toBe('up');
    expect(k.up()).toBe(true);
    const ys: number[] = [];
    const xs: number[] = [];
    for (let i = 0; i < 600; i++) {
      k.update(P);
      const pos = k.position()!;
      ys.push(pos.y);
      xs.push(pos.x);
    }
    const h = GADGET_TUNING.kite.height;
    // 上がりきったあと（後半）は 表の高さの ±0.5 以内
    const late = ys.slice(300);
    for (const y of late) expect(Math.abs(y - (P.y + h))).toBeLessThanOrEqual(0.5 + 1e-9);
    // ゆらゆら: 高さか よこが 時間でかわる
    expect(Math.max(...late) - Math.min(...late) + Math.max(...xs.slice(300)) - Math.min(...xs.slice(300))).toBeGreaterThan(0.05);
    expect(k.height(P)).toBeCloseTo(h, 0);
  });
  it('最初から一瞬で 20 ブロックにはならない（のぼっていく）', () => {
    const k = new KiteSystem();
    k.toggle(P);
    k.update(P);
    expect(k.height(P)!).toBeLessThan(GADGET_TUNING.kite.height / 2);
  });
  it('プレイヤーが動くと たこもついてくる', () => {
    const k = new KiteSystem();
    k.toggle(P);
    for (let i = 0; i < 400; i++) k.update(P);
    const moved = { x: P.x + 30, y: P.y, z: P.z - 30 };
    for (let i = 0; i < 600; i++) k.update(moved);
    const pos = k.position()!;
    expect(Math.hypot(pos.x - moved.x, pos.z - moved.z)).toBeLessThan(6);
  });
});

describe('たこは 向いている 前方へ ななめに あがる', () => {
  it('東向き(yaw 90)で あげると、東（+x）へ 角度の 分だけ ずれて、高さは 表のまま', () => {
    const k = new KiteSystem();
    k.toggle(P, 90);
    for (let i = 0; i < 600; i++) k.update(P);
    const pos = k.position()!;
    const run = GADGET_TUNING.kite.height / Math.tan((GADGET_TUNING.kite.angleDeg * Math.PI) / 180);
    expect(Math.abs(pos.x - (P.x + run))).toBeLessThanOrEqual(GADGET_TUNING.kite.sway + 0.01);
    expect(Math.abs(pos.z - P.z)).toBeLessThanOrEqual(GADGET_TUNING.kite.sway + 0.01);
    expect(Math.abs(k.height(P)! - GADGET_TUNING.kite.height)).toBeLessThanOrEqual(GADGET_TUNING.kite.sway + 0.01);
    // 地面から 角度は 45〜60 度ぐらい
    const deg = (Math.atan2(k.height(P)!, Math.hypot(pos.x - P.x, pos.z - P.z)) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(40);
    expect(deg).toBeLessThan(65);
  });
  it('北向き(yaw 0)は -z へ', () => {
    const k = new KiteSystem();
    k.toggle(P, 0);
    for (let i = 0; i < 600; i++) k.update(P);
    expect(k.position()!.z).toBeLessThan(P.z - 5);
  });
});

describe('たこを戻す（AC9）', () => {
  it('あげている間にもう一度 右クリックすると 戻る（消える）', () => {
    const k = new KiteSystem();
    k.toggle(P);
    k.update(P);
    expect(k.toggle(P)).toBe('down');
    expect(k.up()).toBe(false);
    expect(k.position()).toBeNull();
    expect(k.toggle(P)).toBe('up'); // また あげられる
  });
  it('たこ以外を持ちかえると 戻る。たこを持っている間は そのまま', () => {
    const k = new KiteSystem();
    k.toggle(P);
    k.onHeld('kite');
    expect(k.up()).toBe(true);
    k.onHeld('dirt');
    expect(k.up()).toBe(false);
    k.toggle(P);
    k.onHeld(null);
    expect(k.up()).toBe(false);
  });
});

describe('たこは遊ぶだけ（AC10）', () => {
  it('当たり判定なし', () => {
    expect(new KiteSystem().solid).toBe(false);
  });
});
