import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { DomeView } from '../legend/LegendSystem';
import { createChargeLight } from '../legend/chargeLight';
import { ShiningFx, ringRadius, shiningLook } from './shiningFx';

/** WEAPON-7 PR3 §5.3: 虹の ドームの 見た目（4 描画・150 三角形以下・点滅なし・一人称・動きを へらす） */
beforeAll(() => {
  (globalThis as unknown as { document: unknown }).document = {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v: string) {} }),
  };
});

const dome = (phase: DomeView['phase'], t: number, radius = 7, centerY = 12.9): DomeView => ({ phase, t, radius, centerY });
const mk = () => {
  const scene = new THREE.Scene();
  const fx = new ShiningFx({ scene, camera: new THREE.PerspectiveCamera() });
  return { scene, fx };
};
const inp = (d: DomeView | null, o: { firstPerson?: boolean; reduced?: boolean } = {}) => ({ dome: d, x: 5, z: 6, firstPerson: false, reduced: false, ...o });

describe('数', () => {
  it('4 描画・124 三角形（150 以下）', () => {
    const { fx } = mk();
    expect(fx.stats()).toEqual({ draws: 4, triangles: 124 });
    expect(fx.group.children).toHaveLength(4);
  });
});

describe('大きさと opacity（点滅なし）', () => {
  it('うかぶで 0 → 1、おりるで 1 → 0', () => {
    expect(shiningLook(dome('rise', 0.25, 1.75))).toEqual({ s: 0.25, opacity: 0.25 });
    expect(shiningLook(dome('rise', 1, 7)).opacity).toBe(1);
    expect(shiningLook(dome('fall', 0.5, 3.5))).toEqual({ s: 0.5, opacity: 0.5 });
    expect(shiningLook(null)).toEqual({ s: 0, opacity: 0 });
  });
  it('とどまる 間は ずっと 一定（s 1・opacity 1）', () => {
    const { fx } = mk();
    const seen = new Set<string>();
    for (let k = 0; k < 160; k++) {
      fx.step(inp(dome('hold', k / 160)));
      const l = fx.look();
      seen.add(`${l.s}/${l.opacity}/${l.opacities.join(',')}`);
    }
    expect(seen.size).toBe(1);
    expect(fx.look().opacity).toBe(1);
  });
  it('出てから 消えるまで opacity は うかぶ 間 増えるだけ・おりる 間 減るだけ', () => {
    const { fx } = mk();
    let prev = -1;
    for (let k = 1; k <= 40; k++) {
      fx.step(inp(dome('rise', k / 40, 7 * (k / 40))));
      expect(fx.look().opacity).toBeGreaterThanOrEqual(prev);
      prev = fx.look().opacity;
    }
    for (let k = 1; k <= 39; k++) {
      fx.step(inp(dome('fall', k / 40, 7 * (1 - k / 40))));
      expect(fx.look().opacity).toBeLessThanOrEqual(prev);
      prev = fx.look().opacity;
    }
    fx.step(inp(null));
    expect(fx.group.visible).toBe(false);
  });
  it('地面の わ = √(球² − 高さ²)', () => {
    expect(ringRadius(7, 2.9)).toBeCloseTo(6.37, 2);
    expect(ringRadius(1, 3)).toBe(0);
  });
});

describe('カメラが ドームの 中', () => {
  it('中に いる 間は まくを 出さず まん中の 光だけ。外では 両方', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const fx = new ShiningFx({ scene, camera });
    camera.position.set(5, 12.9, 6 + 4); // 体の 中心から 4（半径 7 の 中）
    fx.step(inp(dome('hold', 0.5)));
    const cd = fx.group.children[0] as THREE.Mesh;
    expect(fx.look().filmOn).toBe(false);
    expect(cd.geometry.drawRange).toEqual({ start: 6, count: 6 });
    expect(fx.look().cdVisible).toBe(true);
    camera.position.set(5, 12.9, 6 + 12);
    fx.step(inp(dome('hold', 0.5)));
    expect(fx.look().filmOn).toBe(true);
    expect(cd.geometry.drawRange).toEqual({ start: 0, count: 12 });
  });
});

describe('一人称・動きを へらす', () => {
  it('一人称は まん中の 光と まくを 出さない（ほかは 出す）', () => {
    const { fx } = mk();
    fx.step(inp(dome('hold', 0.5), { firstPerson: true }));
    expect(fx.look().cdVisible).toBe(false);
    expect(fx.group.visible).toBe(true);
    fx.step(inp(dome('hold', 0.5)));
    expect(fx.look().cdVisible).toBe(true);
  });
  it('帯は 回る（6 秒で 1 周）・動きを へらすと 止まる', () => {
    const a = mk().fx;
    for (let k = 0; k < 360; k++) a.step(inp(dome('hold', k / 360)));
    expect(a.look().bandOffset.x).toBeCloseTo(0, 5); // 1 周
    const b = mk().fx;
    for (let k = 0; k < 90; k++) b.step(inp(dome('hold', k / 90)));
    expect(b.look().bandOffset.x).toBeCloseTo(0.25, 5);
    const c = mk().fx;
    for (let k = 0; k < 90; k++) c.step(inp(dome('hold', k / 90), { reduced: true }));
    expect(c.look().bandOffset).toEqual({ x: 0, y: 0 });
  });
  it('かけら: 動きを へらすと 位置が 動かない', () => {
    const { fx } = mk();
    const sp = fx.group.children[3] as THREE.InstancedMesh;
    fx.step(inp(dome('hold', 0), { reduced: true }));
    const a = Array.from(sp.instanceMatrix.array as Float32Array);
    for (let k = 0; k < 30; k++) fx.step(inp(dome('hold', k / 160), { reduced: true }));
    expect(Array.from(sp.instanceMatrix.array as Float32Array)).toEqual(a);
  });
});

describe('ため中の 手もとの 光（虹は 90）', () => {
  it('虹の 色（niji）・満タンは 90・88 までは あつまる・90 で 輪', () => {
    const cl = createChargeLight();
    const v89 = { ...cl.step({ ticks: 89, kind: 'shining', full: 90, reduced: false }) };
    expect(v89.palette).toBe('niji');
    expect(v89.phase).toBe('gather');
    expect(v89.ring).toBe(0);
    const v90 = { ...cl.step({ ticks: 90, kind: 'shining', full: 90, reduced: false }) };
    expect(v90.phase).toBe('burst');
    expect(v90.ring).toBeGreaterThan(0);
    expect(v90.core).toBe(5);
    expect({ ...cl.step({ ticks: 96, kind: 'shining', full: 90, reduced: false }) }.orbit).toBe(2);
  });
  it('雷・風は 今までどおり 60', () => {
    const cl = createChargeLight();
    expect({ ...cl.step({ ticks: 59, kind: 'lightning', reduced: false }) }.phase).toBe('gather');
    expect({ ...cl.step({ ticks: 60, kind: 'lightning', reduced: false }) }.phase).toBe('burst');
  });
});
