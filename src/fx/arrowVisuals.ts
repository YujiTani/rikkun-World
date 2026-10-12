import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec3 } from '../contracts';

/** 飛んでいる や の見た目（M4 §2.6）。ひとつの InstancedMesh にまとめ、毎フレーム new しない。 */

export const MAX_ARROWS = 32;

/** combat.arrows() の 1 本分（必要な項目だけ） */
export interface ArrowView {
  id: number;
  position: Vec3;
  dir: Vec3;
}

function part(w: number, h: number, d: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** や 1 本の形: 先が -Z。長さ 0.7（中心が原点） */
export function createArrowGeometry(): THREE.BufferGeometry {
  const parts = [
    part(0.04, 0.04, 0.55, 0, 0, 0, 0xc9a066),
    part(0.08, 0.08, 0.1, 0, 0, -0.3, 0x9aa0a8),
    part(0.12, 0.012, 0.1, 0, 0, 0.27, 0xffffff),
    part(0.012, 0.12, 0.1, 0, 0, 0.27, 0xffffff),
  ];
  const geo = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return geo;
}

export class ArrowVisuals {
  readonly mesh: THREE.InstancedMesh;
  private readonly q = new THREE.Quaternion();
  private readonly m = new THREE.Matrix4();
  private readonly d = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly forward = new THREE.Vector3(0, 0, -1);

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      createArrowGeometry(),
      new THREE.MeshBasicMaterial({ vertexColors: true }),
      MAX_ARROWS,
    );
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  /** 今飛んでいる や の一覧をそのまま写す。毎ステップ呼んでよい */
  sync(arrows: readonly ArrowView[]): void {
    const n = Math.min(arrows.length, MAX_ARROWS);
    for (let i = 0; i < n; i++) {
      const a = arrows[i];
      this.d.set(a.dir.x, a.dir.y, a.dir.z);
      if (this.d.lengthSq() < 1e-9) this.d.copy(this.forward);
      this.d.normalize();
      this.q.setFromUnitVectors(this.forward, this.d);
      this.p.set(a.position.x, a.position.y, a.position.z);
      this.m.compose(this.p, this.q, this.one);
      this.mesh.setMatrixAt(i, this.m);
    }
    if (n > 0) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.count = n;
    this.mesh.visible = n > 0;
  }

  /** 見えている本数（テスト用） */
  get visibleCount(): number {
    return this.mesh.visible ? this.mesh.count : 0;
  }

  addTo(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
