import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ParryFx, crossYaw } from './parryFx';

// 画像の 読み込みは node に ないので 空の 画像に する
vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());

function build() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(3, 3, 3);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const fx = new ParryFx({ scene, camera, basePath: './models/fx/' });
  return { scene, camera, fx };
}

/** 板の 法線（ワールド） */
function normalOf(m: THREE.Object3D): THREE.Vector3 {
  m.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);
}

describe('パリィの 十字の 板（#233）', () => {
  it('火花は たて板 2 まいが 直交し、カメラに 向けない', () => {
    const { scene, camera, fx } = build();
    fx.spark({ x: 0, y: 1, z: 0 }, false, 90);
    fx.step({ visible: false, level: 0, position: { x: 0, y: 0, z: 0 }, reduced: false, facingDeg: 90 });
    fx.update();
    const g = scene.children.find((c) => c.type === 'Group' && c.visible) as THREE.Group;
    expect(g.children).toHaveLength(2);
    const [a, b] = g.children.map(normalOf) as [THREE.Vector3, THREE.Vector3];
    expect(Math.abs(a.y)).toBeLessThan(1e-6);
    expect(Math.abs(b.y)).toBeLessThan(1e-6);
    expect(Math.abs(a.dot(b))).toBeLessThan(1e-6);
    // 1 まいめの 法線 = 攻撃の 向き（東向き 90 度 = +x）
    expect(Math.abs(a.x)).toBeCloseTo(1, 5);
    // カメラの 回転を そのまま 使っていない
    const cq = camera.getWorldQuaternion(new THREE.Quaternion());
    expect(g.quaternion.angleTo(cq)).toBeGreaterThan(0.1);
  });

  it('光も たて板 2 まいの 十字（体の まん中・直交）', () => {
    const { scene, fx } = build();
    fx.step({ visible: true, level: 1, position: { x: 1, y: 0, z: 2 }, reduced: true, facingDeg: 0 });
    fx.update();
    const g = scene.children.find((c) => c.type === 'Group' && c.visible) as THREE.Group;
    expect(g.children).toHaveLength(2);
    const [a, b] = g.children.map(normalOf) as [THREE.Vector3, THREE.Vector3];
    expect(Math.abs(a.dot(b))).toBeLessThan(1e-6);
    expect(Math.abs(a.y) + Math.abs(b.y)).toBeLessThan(1e-6);
    expect(g.position.toArray()).toEqual([1, 0.9, 2]);
  });

  it('crossYaw: 北(0 度)は z 軸の 法線', () => {
    const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), crossYaw(0));
    expect(Math.abs(n.z)).toBeCloseTo(1, 5);
  });
});
