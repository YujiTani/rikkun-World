import { describe, expect, it } from 'vitest';
import { angleToBox, pickAimAssist, rayHitsBox, type AimAssistBox, type AimAssistInput } from './aimAssist';

// AC46 の場面: AC13 の場所（x0 = 10, G = 9, z0 = 6）・yaw 0・pitch 0
const x0 = 10, G = 9, z0 = 6;
const CAM = { x: x0 + 1.2, y: G + 1.4, z: z0 + 4.5 };
const S = { x: x0 + 1.2, y: G + 1.4, z: z0 + 0.5 };
const P = { x: x0 + 0.5, y: G + 2.12, z: z0 + 0.5 };
const D = { x: 0, y: 0, z: -1 };

/** おくの面を 深さ L に、左はしを 線から e = L × tan(角) 右に置いた箱（高さ G〜G+2.1・はば・おく 2.0） */
function boxAt(id: number, deg: number, L = 8.0): AimAssistBox {
  const e = L * Math.tan((deg * Math.PI) / 180);
  const zFar = CAM.z - L;
  return {
    id,
    min: { x: CAM.x + e, y: G, z: zFar },
    max: { x: CAM.x + e + 2, y: G + 2.1, z: zFar + 2 },
  };
}

function input(boxes: AimAssistBox[], over: Partial<AimAssistInput> = {}): AimAssistInput {
  return { camera: CAM, dir: D, shoulder: S, pivot: P, reach: 3.5, assistDeg: 4, boxes, blocked: () => false, ...over };
}

describe('angleToBox / ねらい補助の えらび方（AC46）', () => {
  it('置き方どおりの角になる（1・2・3・6 度）', () => {
    for (const deg of [1, 2, 3, 6]) {
      const b = boxAt(1, deg);
      expect(angleToBox(CAM, D, b.min, b.max)).toBeCloseTo(deg, 2);
    }
  });
  it('線が箱に当たるときは 0 度', () => {
    const b = boxAt(1, 0);
    b.min.x -= 1;
    b.max.x -= 1;
    expect(angleToBox(CAM, D, b.min, b.max)).toBe(0);
    expect(rayHitsBox(CAM, D, b.min, b.max)).toBe(true);
  });
  it('カメラのうしろの箱は 対象外', () => {
    const b = boxAt(1, 0);
    b.min.z += 20;
    b.max.z += 20;
    expect(angleToBox(CAM, D, b.min, b.max)).toBe(Infinity);
  });
  it('2 度 -> その id。6 度 -> null', () => {
    expect(pickAimAssist(input([boxAt(7, 2)]))).toBe(7);
    expect(pickAimAssist(input([boxAt(7, 6)]))).toBeNull();
  });
  it('2 度でも 届かない（L = 10 で P から 約 4.1）-> null', () => {
    expect(pickAimAssist(input([boxAt(7, 2, 10)]))).toBeNull();
  });
  it('S と箱の中心のあいだに固いブロック -> null', () => {
    expect(pickAimAssist(input([boxAt(7, 2)], { blocked: () => true }))).toBeNull();
  });
  it('1 度と 3 度に 2 こ -> 1 度の方（並び順によらない）', () => {
    expect(pickAimAssist(input([boxAt(3, 3), boxAt(1, 1)]))).toBe(1);
    expect(pickAimAssist(input([boxAt(1, 1), boxAt(3, 3)]))).toBe(1);
  });
  it('同じ角（差 0.01 度未満）なら P に近い方', () => {
    const near = boxAt(1, 2, 6);
    const far = boxAt(2, 2, 8);
    expect(pickAimAssist(input([far, near], { reach: 5 }))).toBe(1);
  });
  it('妖怪の箱がなければ null（ブロックは補助しない）', () => {
    expect(pickAimAssist(input([]))).toBeNull();
  });
  it('補助の角 0 -> 2 度でも null', () => {
    expect(pickAimAssist(input([boxAt(7, 2)], { assistDeg: 0 }))).toBeNull();
  });
});

describe('AC45: S から D の線がからかさの箱に当たる', () => {
  it('pitch 0 でも -25 でも当たり、当たった点は P から 3.5 以内。P から水平の線（5.1 版）は当たらない', () => {
    const min = { x: x0 + 0.5 - 1.05, y: G, z: z0 - 2.5 - 1.05 };
    const max = { x: x0 + 0.5 + 1.05, y: G + 2.1, z: z0 - 2.5 + 1.05 };
    for (const pitch of [0, -25]) {
      const r = (pitch * Math.PI) / 180;
      const s = 0.7 * Math.cos(r);
      const o = { x: x0 + 0.5 + s, y: G + 1.4, z: z0 + 0.5 };
      const d = { x: 0, y: Math.sin(r), z: -Math.cos(r) };
      expect(rayHitsBox(o, d, min, max)).toBe(true);
      // 入る点
      let t = 0;
      while (t < 6 && !(o.z + d.z * t <= max.z && o.y + d.y * t <= max.y && o.y + d.y * t >= min.y)) t += 0.01;
      const hit = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
      expect(Math.hypot(hit.x - P.x, hit.y - P.y, hit.z - P.z)).toBeLessThanOrEqual(3.5);
    }
    expect(rayHitsBox({ x: x0 + 0.5, y: G + 2.12, z: z0 + 0.5 }, { x: 0, y: 0, z: -1 }, min, max)).toBe(false);
  });
});
