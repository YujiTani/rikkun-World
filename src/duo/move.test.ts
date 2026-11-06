import { describe, expect, it } from 'vitest';
import { walkHeadingDeg } from './move';

/**
 * COOP-1 作業 1（#395）の 先行テスト（赤）。AC4（1 画面のとき 2P の 左スティック上は「画面の奥」へ 歩く。カメラの 向きから 10° 以内）。
 * つなぎ目の 約束: src/duo/move.ts の `walkHeadingDeg(forward, right, cameraYawDeg)`（宣言は move.ts）。
 *   向きの 決まりは PlayerController と 同じ: 向き θ の 前 = (sin θ, -cos θ)、右 = (cos θ, sin θ)。
 *   配線: 1 画面・ルーペの あいだ 2P の PlayerController の yawDeg を この 向きに して 歩かせる（作業 1 の 2P の 体）。
 */

const angDiff = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe('AC4: 画面の 向きで 歩く', () => {
  it.each([0, 45, 90, 180, 217.5, 300])('スティック上は カメラの 向き %s° の 奥へ（ずれ 10° 以内）', (yaw) => {
    const h = walkHeadingDeg(1, 0, yaw);
    expect(h).not.toBeNull();
    expect(angDiff(h as number, yaw)).toBeLessThanOrEqual(10);
  });
  it('少し 右へ ずれて 倒しても 10° 以内（右 0.1）', () => {
    expect(angDiff(walkHeadingDeg(0.99, 0.1, 130) as number, 130)).toBeLessThanOrEqual(10);
  });
  it('下に 倒すと 手前（180° 反対）、右に 倒すと 画面の 右（+90°）', () => {
    expect(angDiff(walkHeadingDeg(-1, 0, 40) as number, 220)).toBeLessThanOrEqual(1);
    expect(angDiff(walkHeadingDeg(0, 1, 40) as number, 130)).toBeLessThanOrEqual(1);
  });
  it('倒していない ときは null', () => {
    expect(walkHeadingDeg(0, 0, 123)).toBeNull();
  });
});
