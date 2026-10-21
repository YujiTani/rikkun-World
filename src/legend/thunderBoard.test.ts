import { describe, expect, it } from 'vitest';
import { boltBillboard, sinkFade } from './thunderModel';

/**
 * ART-PIPE-1 AC5・AC6（docs/design/ART-PIPE-1.md 1.1 §4.3）: カメラを 向く 板（近すぎる カメラ）と ささる 所（A 案）の かけ率。
 * 要る 名前（developer が `src/legend/thunderModel.ts` に 作る）:
 *   boltBillboard(S, cam, prev) → { yaw, near, layers: [{ layer, center }] }（layers は 重ね 0・1・2。center = 板の 下の はしの まん中）
 *     yaw = 板の おもての 向き（水平）。おもて = (sin yaw, 0, cos yaw)。カメラが S の 水平 0.5 未満 なら 前の yaw（prev?.yaw。なければ 0）、near = true
 *   sinkFade(d)  … 板と 面（ブロック・地面）の 深さの 差 d（ブロック）の かけ率
 */

const S = { x: 20.5, y: 9, z: 12.5 };

describe('AC5: 近すぎる カメラ', () => {
  it('ふつうの きょりでは カメラの 方へ 向く。3 まいは 奥 −0.3・中 0・手前 +0.3、下の はしは S.y − 0.375', () => {
    const cam = { x: S.x + 8, y: S.y + 2, z: S.z };
    const b = boltBillboard(S, cam, null);
    expect(b.near).toBe(false);
    expect(Math.sin(b.yaw)).toBeCloseTo(1, 6);
    expect(Math.cos(b.yaw)).toBeCloseTo(0, 6);
    expect(b.layers.map((l) => l.layer)).toEqual([0, 1, 2]);
    const off = [-0.3, 0, 0.3];
    b.layers.forEach((l, i) => {
      expect(l.center.x).toBeCloseTo(S.x + off[i]!, 6);
      expect(l.center.z).toBeCloseTo(S.z, 6);
      expect(l.center.y).toBeCloseTo(S.y - 0.375, 6);
    });
  });
  it('水平の きょりが 0.5 未満 → 向きは 前の ステップと 同じ。数に NaN・無限が ない', () => {
    const prev = { yaw: 1.234 };
    for (const cam of [
      { x: S.x, y: S.y + 10, z: S.z },
      { x: S.x + 0.1, y: S.y - 5, z: S.z - 0.2 },
      { x: S.x + 0.49, y: S.y + 3, z: S.z },
      { x: S.x, y: S.y, z: S.z },
    ]) {
      const b = boltBillboard(S, cam, prev);
      expect(b.near).toBe(true);
      expect(b.yaw).toBeCloseTo(prev.yaw, 12);
      for (const l of b.layers) for (const v of [l.center.x, l.center.y, l.center.z]) expect(Number.isFinite(v)).toBe(true);
      expect(Number.isFinite(b.yaw)).toBe(true);
    }
  });
  it('前の ステップが ないときは 0。0.5 ちょうどは 近くない（向く）', () => {
    expect(boltBillboard(S, { x: S.x, y: S.y + 5, z: S.z }, null).yaw).toBe(0);
    const edge = boltBillboard(S, { x: S.x, y: S.y + 5, z: S.z + 0.5 }, { yaw: 2 });
    expect(edge.near).toBe(false);
    expect(Math.cos(edge.yaw)).toBeCloseTo(1, 6);
  });
  it('8 方向（45° ごと・8 ブロック）で 板の おもてが カメラへ 向く（ずれ ≦ 1°）', () => {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const cam = { x: S.x + 8 * Math.sin(a), y: S.y + 3, z: S.z + 8 * Math.cos(a) };
      const b = boltBillboard(S, cam, null);
      const dx = Math.sin(b.yaw) - Math.sin(a);
      const dz = Math.cos(b.yaw) - Math.cos(a);
      expect(Math.hypot(dx, dz)).toBeLessThan(Math.PI / 180);
    }
  });
});

describe('AC6: ささる 所（A 案）のかけ率', () => {
  it('d = 0 → 0、1/16 → 0、1/8 → 1/4、3/16 → 1/4、2/8 → 2/4、3/8 → 3/4、1/2 → 1、1 → 1', () => {
    const cases: [number, number][] = [
      [0, 0],
      [1 / 16, 0],
      [1 / 8, 1 / 4],
      [3 / 16, 1 / 4],
      [2 / 8, 2 / 4],
      [3 / 8, 3 / 4],
      [1 / 2, 1],
      [1, 1],
    ];
    for (const [d, want] of cases) expect(sinkFade(d), `d=${d}`).toBeCloseTo(want, 9);
  });
  it('値は 0・1/4・2/4・3/4・1 の 5 つ だけ（0 から 1 まで 上がる 段は 4 つ）。なめらかに しない', () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 2000; i++) seen.add(Math.round(sinkFade(i / 1000) * 1e9) / 1e9);
    expect([...seen].sort()).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it('深く なるほど こく なる（へらない）。地面の 下（負の d）も 0', () => {
    let last = 0;
    for (let i = 0; i <= 200; i++) {
      const f = sinkFade(i / 100);
      expect(f).toBeGreaterThanOrEqual(last - 1e-12);
      last = f;
    }
    expect(sinkFade(-0.5)).toBe(0);
  });
});
