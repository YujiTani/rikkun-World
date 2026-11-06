import { describe, expect, it } from 'vitest';
import { P2Camera } from './p2Camera';

/**
 * COOP-1 作業 3e（#422。docs/design/COOP-1.md 1.8 §2.5）の 先行テスト（赤）。AC26（参加した 瞬間の 2P の 向き）と AC86（2P の 歩く 向き = 2P の カメラ）。
 * 1.7 の「1 画面・ルーペ ⇔ 分割」で 向きが かわる テストは 消した（2P は いつも 自分の カメラ）。
 *
 * ---- 実装への 約束（src/duo/p2Camera.ts）----
 *   new P2Camera()
 *   step({ screenYawDeg, lookDeltaDeg }): { camYawDeg, walkYawDeg }     ← `view`・`stickHeld` を なくす。固定ステップごとに 1 回。
 *     screenYawDeg = 1P の カメラの 向き（`player.get().yawDeg` と 同じ 決まり）。lookDeltaDeg = 2P の 右スティックの この ステップの 回転（度。+ が 右）。
 *     作った あと（または reset() の あと）の 最初の step: camYawDeg = screenYawDeg（参加した 瞬間は 1P の カメラと 同じ。1° 以内。そのステップの lookDeltaDeg も 足す）。
 *     そのあと: camYawDeg は lookDeltaDeg の 合計だけで 回る。screenYawDeg（1P の 向き）には ひきずられない。
 *     walkYawDeg = いつも camYawDeg（左スティック上は 2P の カメラの 奥へ 歩く。1P と 同じ）。
 *   reset()    2P が やめた とき 呼ぶ。つぎの step は また 最初の step と 同じ（そのときの screenYawDeg に そろえる）。
 *   配線: `walkActions.ts`（1 画面の 向きの 置きかえ）・`move.ts` は なくす。
 */

const angleDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe('AC26: 参加した 瞬間の 2P の カメラの 向き', () => {
  it('最初の step で 1P の カメラの 向きと 1° 以内（いろいろな 向き）', () => {
    for (const yaw of [0, 90, 179.5, -135, 340]) {
      const c = new P2Camera();
      const r = c.step({ screenYawDeg: yaw, lookDeltaDeg: 0 });
      expect(angleDiff(r.camYawDeg, yaw), `yaw ${yaw}`).toBeLessThanOrEqual(1);
    }
  });
  it('そのあとは 右スティックだけで 回り、1P の 向きには ひきずられない', () => {
    const c = new P2Camera();
    c.step({ screenYawDeg: 123, lookDeltaDeg: 0 });
    const turned = c.step({ screenYawDeg: 123, lookDeltaDeg: 30 });
    expect(angleDiff(turned.camYawDeg, 153)).toBeLessThan(0.01);
    const p1Turned = c.step({ screenYawDeg: 300, lookDeltaDeg: 0 });
    expect(angleDiff(p1Turned.camYawDeg, 153)).toBeLessThan(0.01);
    const more = c.step({ screenYawDeg: 10, lookDeltaDeg: -200 });
    expect(angleDiff(more.camYawDeg, 153 - 200)).toBeLessThan(0.01);
  });
  it('近くても（1P と 同じ 向きの まま）自分の カメラで 回る: 1P が 回っても 2P は かわらない', () => {
    const c = new P2Camera();
    c.step({ screenYawDeg: 90, lookDeltaDeg: 0 });
    for (let i = 0; i < 100; i++) c.step({ screenYawDeg: 90 + i * 3, lookDeltaDeg: 0 });
    expect(angleDiff(c.step({ screenYawDeg: 1, lookDeltaDeg: 0 }).camYawDeg, 90)).toBeLessThan(0.01);
  });
  it('reset() の あと (やめて また 参加) は そのときの 1P の 向きに そろう', () => {
    const c = new P2Camera();
    c.step({ screenYawDeg: 10, lookDeltaDeg: 0 });
    c.step({ screenYawDeg: 10, lookDeltaDeg: 45 });
    c.reset();
    const r = c.step({ screenYawDeg: 200, lookDeltaDeg: 0 });
    expect(angleDiff(r.camYawDeg, 200)).toBeLessThanOrEqual(1);
  });
});

describe('AC86: 2P の 左スティック上は 2P の カメラの 奥へ 歩く（1P と 同じ）', () => {
  it('walkYawDeg は いつも camYawDeg（ずれ 10° 以内どころか 同じ）', () => {
    const c = new P2Camera();
    c.step({ screenYawDeg: 77, lookDeltaDeg: 0 });
    for (const [screen, look] of [[77, 0], [200, 25], [5, -90], [310, 12.5], [0, 0]] as const) {
      const r = c.step({ screenYawDeg: screen, lookDeltaDeg: look });
      expect(angleDiff(r.walkYawDeg, r.camYawDeg)).toBeLessThanOrEqual(0.01);
    }
  });
  it('1P の カメラが 反対を むいていても 2P は 自分の カメラの 奥へ（1P の 向きは 関係ない）', () => {
    const c = new P2Camera();
    c.step({ screenYawDeg: 0, lookDeltaDeg: 0 });
    const r = c.step({ screenYawDeg: 180, lookDeltaDeg: 0 });
    expect(angleDiff(r.walkYawDeg, 0)).toBeLessThanOrEqual(10);
  });
});
