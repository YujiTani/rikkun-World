import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FIRST_PERSON_HAND, computeHand, newHandInfo } from './handPos';

/** WEAPON-8 §3.5: 剣を 持つ 手の 位置（三人称は 体から・一人称は 画面の 右下の 剣の にぎり）。 */
const cam = () => {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 100);
  c.position.set(10, 12, 10);
  c.lookAt(10, 11.5, 5);
  c.updateMatrixWorld(true);
  return c;
};

describe('三人称', () => {
  it('手は 体の 右がわ・頭の あたり（足もと ＋ 1.1 の 胸では ない）。歩くと ついてくる', () => {
    const c = cam();
    const a = computeHand({ first: false, pos: { x: 10, y: 9, z: 8 }, yawDeg: 0, camera: c }, newHandInfo());
    expect(a.first).toBe(false);
    expect(a.world.x).toBeGreaterThan(10.2);
    expect(a.world.y - 9).toBeGreaterThan(1.5);
    expect(Math.abs(a.world.y - 9 - 1.1)).toBeGreaterThan(0.1);
    const b = computeHand({ first: false, pos: { x: 10, y: 9, z: 6 }, yawDeg: 0, camera: c }, newHandInfo());
    expect(a.world.z - b.world.z).toBeCloseTo(2, 5);
    expect(a.tip.y).toBeGreaterThan(a.world.y);
  });
  it('向きを かえると 右も まわる（東向き → 右は 南 +z）', () => {
    const e = computeHand({ first: false, pos: { x: 0, y: 0, z: 0 }, yawDeg: 90, camera: cam() }, newHandInfo());
    expect(e.world.z).toBeGreaterThan(0.3);
  });
});

describe('一人称', () => {
  it('手の 世界の 位置を 画面に うつすと 決めた 画面の 位置（右下）に なる', () => {
    const c = cam();
    const h = computeHand({ first: true, pos: { x: 10, y: 9, z: 8 }, yawDeg: 0, camera: c }, newHandInfo());
    expect(h.first).toBe(true);
    expect(h.screen!.x).toBeCloseTo(FIRST_PERSON_HAND.x, 3);
    expect(h.screen!.y).toBeCloseTo(FIRST_PERSON_HAND.y, 3);
    expect(h.screen!.x).toBeGreaterThanOrEqual(0.5);
    expect(h.screen!.y).toBeGreaterThanOrEqual(0.5);
    // 照準（画面の まん中）の まわり 10%（40〜60%）には 入らない
    expect(Math.abs(h.screen!.y - 0.5) > 0.1 || Math.abs(h.screen!.x - 0.5) * (16 / 9) > 0.1).toBe(true);
  });
  it('三人称でも screen は 手の 画面の 位置（見える とき）', () => {
    const h = computeHand({ first: false, pos: { x: 10, y: 9, z: 8 }, yawDeg: 0, camera: cam() }, newHandInfo());
    expect(h.screen).not.toBeNull();
  });
});
