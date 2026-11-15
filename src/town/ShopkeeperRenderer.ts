import * as THREE from 'three';
import { shadeMat } from '../animals/models/animalRenderParts';
import { shopkeeperModel } from './shopkeeperSpec';

/**
 * よろずやさんを 描く 係（TOWN-1 1C）。1 人 ＝ メッシュ 1 つ（描画 1 回）。ねらい中は ふちどり（+1 回）。
 * 遠い・画面の 外・地面が まだ 描かれて いない 時は 描かない。毎フレーム 新しい 物を 作らない。
 */
const DRAW_RADIUS = 96; // これより 遠いと 描かない（ブロック）
const CULL_Y = 0.9; // 画面の 内か しらべる 球の 高さ（足もとから。ブロック）
const CULL_R = 1.2; // その 球の 半径（ブロック）
const OUTLINE = 0x7fe0ff; // ねらい中の ふちどり（建築士さんと 同じ）

export class ShopkeeperRenderer {
  readonly group = new THREE.Group();
  readonly bodyMaterial = shadeMat();
  private readonly hullMaterial = new THREE.MeshBasicMaterial({ color: OUTLINE, fog: false, depthWrite: false });
  private readonly mesh: THREE.Mesh;
  private readonly hull: THREE.Mesh;
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly cam = new THREE.Vector3();

  constructor(private readonly drawn: (x: number, z: number) => boolean = () => true) {
    const m = shopkeeperModel();
    this.hullMaterial.userData.noDim = true;
    this.mesh = new THREE.Mesh(m.geo, this.bodyMaterial);
    this.mesh.renderOrder = 2;
    this.hull = new THREE.Mesh(m.hull, this.hullMaterial);
    this.hull.renderOrder = 1;
    this.hull.visible = false;
    this.group.add(this.mesh, this.hull);
    this.group.visible = false;
  }

  /** 毎フレーム。at ＝ 足もと（いなければ null）、yaw ＝ 向き（0 ＝ 北）、aimed ＝ ねらって いる */
  update(at: { x: number; y: number; z: number; yaw: number } | null, camera: THREE.Camera, aimed: boolean): void {
    if (!at) {
      this.group.visible = false;
      return;
    }
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.cam);
    const dx = at.x - this.cam.x;
    const dz = at.z - this.cam.z;
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.sphere.center.set(at.x, at.y + CULL_Y, at.z);
    this.sphere.radius = CULL_R;
    const vis = dx * dx + dz * dz <= DRAW_RADIUS * DRAW_RADIUS && this.frustum.intersectsSphere(this.sphere) && this.drawn(at.x, at.z);
    this.group.visible = vis;
    if (!vis) return;
    this.group.position.set(at.x, at.y, at.z);
    this.group.rotation.set(0, -at.yaw, 0); // ゲームの 向きは −yaw（建築士さんと 同じ）
    this.hull.visible = aimed;
  }
}
