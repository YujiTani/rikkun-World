import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { WindWaveFx } from './windWaveFx';

/**
 * ART-PIPE-1 AC19（docs/design/ART-PIPE-1.md §4.8）: 風神剣の 真空波は 十字の まま（2 まいの たて板）。
 * カメラを 90° 回しても 板の 向きは 変わらない（たて軸の 板に するのは 雷だけ）。今も 通る こと（実装で こわさない 見はり）。
 */
beforeAll(() => {
  // TextureLoader が 使う document を 最小に まねる（絵は 読まない）
  (globalThis as unknown as { document: unknown }).document = {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v: string) {} }),
  };
});

describe('AC19: 真空波は 十字の まま', () => {
  const wave = { dir: { x: 0, y: 0, z: -1 }, position: { x: 3, y: 5, z: 4 }, traveled: 2 } as never;
  const planes = (fx: WindWaveFx, scene: THREE.Scene) => {
    fx.step([wave]);
    const group = scene.children[0] as THREE.Group;
    return group.children.filter((m) => m.visible && (m as THREE.Mesh).isMesh).slice(0, 2) as THREE.Mesh[];
  };
  it('1 つの 波に 板が 2 まい（たて板・よこ板）。たて板の 上は 世界の 上', () => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera();
    const fx = new WindWaveFx({ scene, camera: cam });
    const [vert, flat] = planes(fx, scene);
    expect(vert).toBeDefined();
    expect(flat).toBeDefined();
    const up = (m: THREE.Mesh) => new THREE.Vector3(0, 1, 0).transformDirection(m.matrix);
    expect(up(vert!).y).toBeCloseTo(1, 6);
    expect(Math.abs(up(flat!).y)).toBeLessThan(1e-6);
  });
  it('カメラを 90° 回しても 板の 向き（行列）は 変わらない', () => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera();
    const fx = new WindWaveFx({ scene, camera: cam });
    const before = planes(fx, scene).map((m) => m.matrix.toArray());
    cam.rotation.y += Math.PI / 2;
    cam.position.set(10, 5, -3);
    cam.updateMatrixWorld(true);
    const after = planes(fx, scene).map((m) => m.matrix.toArray());
    expect(after).toEqual(before);
  });
});
