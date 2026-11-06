import { describe, expect, it } from 'vitest';
import { P2Camera } from './p2Camera';

/**
 * COOP-1 作業 2（#399）の 先行テスト（赤）。AC26（分割の 瞬間の 向き）と §2.5（分割 → 1 画面で 左スティックの 向きが かわらない）。
 * つなぎ目の 約束: src/duo/p2Camera.ts の `P2Camera`（宣言と 約束は p2Camera.ts の 先頭）。
 */

const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe('AC26: 分割した 瞬間の 2P の カメラの 向き', () => {
  it('1 画面・ルーペの あいだは 画面の 向きに ついていく', () => {
    const c = new P2Camera();
    const a = c.step({ view: 'one', screenYawDeg: 10, lookDeltaDeg: 0, stickHeld: false });
    expect(a.camYawDeg).toBeCloseTo(10, 3);
    const b = c.step({ view: 'loupe', screenYawDeg: 200, lookDeltaDeg: 0, stickHeld: false });
    expect(angleDiff(b.camYawDeg, 200)).toBeLessThan(1);
    expect(angleDiff(b.walkYawDeg, 200)).toBeLessThan(1);
  });

  it('分割に かわる ステップで 直前の 画面の 向きと 1° 以内', () => {
    for (const yaw of [0, 90, 179.5, -135, 340]) {
      const c = new P2Camera();
      c.step({ view: 'loupe', screenYawDeg: yaw, lookDeltaDeg: 0, stickHeld: false });
      const r = c.step({ view: 'split', screenYawDeg: yaw, lookDeltaDeg: 0, stickHeld: false });
      expect(angleDiff(r.camYawDeg, yaw), `yaw ${yaw}`).toBeLessThanOrEqual(1);
      expect(angleDiff(r.walkYawDeg, yaw)).toBeLessThanOrEqual(1);
    }
  });

  it('分割の あいだは 右スティックだけで 回り、画面の 向きには 引きずられない', () => {
    const c = new P2Camera();
    c.step({ view: 'one', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    c.step({ view: 'split', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    const turned = c.step({ view: 'split', screenYawDeg: 123, lookDeltaDeg: 30, stickHeld: false });
    expect(angleDiff(turned.camYawDeg, 153)).toBeLessThan(0.01);
    const screenMoved = c.step({ view: 'split', screenYawDeg: 300, lookDeltaDeg: 0, stickHeld: false });
    expect(angleDiff(screenMoved.camYawDeg, 153)).toBeLessThan(0.01);
    expect(angleDiff(screenMoved.walkYawDeg, 153)).toBeLessThan(0.01);
  });
});

describe('§2.5: 分割 → 1 画面に 戻ったとき', () => {
  const toSplitAndTurn = () => {
    const c = new P2Camera();
    c.step({ view: 'one', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    c.step({ view: 'split', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    c.step({ view: 'split', screenYawDeg: 123, lookDeltaDeg: 30, stickHeld: true });
    return c;
  };
  it('左スティックを 倒したままなら、はなすまで 前の 向きで 歩く', () => {
    const c = toSplitAndTurn();
    const a = c.step({ view: 'one', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: true });
    expect(angleDiff(a.walkYawDeg, 153)).toBeLessThan(0.01);
    const b = c.step({ view: 'one', screenYawDeg: 130, lookDeltaDeg: 0, stickHeld: true });
    expect(angleDiff(b.walkYawDeg, 153)).toBeLessThan(0.01);
  });
  it('はなしたら 画面の 向きに もどる', () => {
    const c = toSplitAndTurn();
    c.step({ view: 'one', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: true });
    const r = c.step({ view: 'one', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    expect(angleDiff(r.walkYawDeg, 123)).toBeLessThan(0.01);
  });
  it('倒していなければ すぐ 画面の 向き', () => {
    const c = toSplitAndTurn();
    c.step({ view: 'split', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    const r = c.step({ view: 'one', screenYawDeg: 123, lookDeltaDeg: 0, stickHeld: false });
    expect(angleDiff(r.walkYawDeg, 123)).toBeLessThan(0.01);
  });
});
