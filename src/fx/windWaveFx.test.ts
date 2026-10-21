import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { WindWaveFx } from './windWaveFx';

/**
 * WEAPON-8 §3.8・AC34: 風神剣の 真空波の 見た目は K1「みかづきの 刃」（カメラに 正面の 板 1 まい）。
 *
 * 期待が 変わった（理由: オーナーの ことば Y9「ふつうの 攻撃は もっと 小さな 風の 刃」・2026-10-21 決定「ふつうの 攻撃は K1」。
 * docs/design/WEAPON-8.md §9）。ART-PIPE-1 AC19「真空波は 十字の まま（たて板・よこ板の 2 まい）」「カメラを 回しても
 * 板の 向きは 変わらない」は、この 仕様で 置きかわった（docs/design/ART-PIPE-1.md §4.8 AC19）。
 * ここは 1 まい・カメラ正面・描く 位置は `drawPos` を 見る。`drawPos` の 計算（剣の 側へ 0.4）と `face` は WaveSystem 側のテスト（developer）。
 */
beforeAll(() => {
  // TextureLoader が 使う document を 最小に まねる（絵は 読まない）
  (globalThis as unknown as { document: unknown }).document = {
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, set src(_v: string) {} }),
  };
});

describe('AC34: 真空波は カメラに 正面の 板 1 まい（K1）', () => {
  const wave = {
    dir: { x: 0, y: 0, z: -1 },
    position: { x: 3, y: 5, z: 4 },
    drawPos: { x: 3.4, y: 5, z: 4 },
    traveled: 2,
    face: 0,
  } as never;
  const visiblePlanes = (fx: WindWaveFx, scene: THREE.Scene) => {
    fx.step([wave]);
    const group = scene.children[0] as THREE.Group;
    group.updateMatrixWorld(true);
    return group.children.filter((m) => m.visible && (m as THREE.Mesh).isMesh) as THREE.Mesh[];
  };
  const normalOf = (m: THREE.Mesh) => new THREE.Vector3(0, 0, 1).transformDirection(m.matrixWorld);

  it('1 つの 波に 見える 板が 1 まい（十字の 2 まいでは ない）', () => {
    const scene = new THREE.Scene();
    const fx = new WindWaveFx({ scene, camera: new THREE.PerspectiveCamera() });
    expect(visiblePlanes(fx, scene)).toHaveLength(1);
  });
  it('板は 見た目の 位置 drawPos に ある（当たりの position では ない）', () => {
    const scene = new THREE.Scene();
    const fx = new WindWaveFx({ scene, camera: new THREE.PerspectiveCamera() });
    const [m] = visiblePlanes(fx, scene);
    const p = new THREE.Vector3().setFromMatrixPosition(m!.matrixWorld);
    expect(p.x).toBeCloseTo(3.4, 5);
    expect(p.y).toBeCloseTo(5, 5);
    expect(p.z).toBeCloseTo(4, 5);
  });
  it('カメラを 回しても 板は いつも カメラに 正面（板の 向きが カメラの 向きと そろう）', () => {
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera();
    const fx = new WindWaveFx({ scene, camera: cam });
    for (const [yaw, pos] of [[0, [3, 5, 10]], [Math.PI / 2, [10, 5, 4]], [Math.PI, [3, 5, -3]]] as const) {
      cam.rotation.set(0, yaw, 0);
      cam.position.set(pos[0], pos[1], pos[2]);
      cam.updateMatrixWorld(true);
      const [m] = visiblePlanes(fx, scene);
      const camBack = new THREE.Vector3(0, 0, 1).transformDirection(cam.matrixWorld);
      expect(Math.abs(normalOf(m!).dot(camBack)), `yaw ${yaw}`).toBeGreaterThan(0.999);
    }
  });
});
