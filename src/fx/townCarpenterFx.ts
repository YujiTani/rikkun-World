import * as THREE from 'three';
import { shadeMat } from '../animals/models/animalRenderParts';
import { V } from '../animals/models/chickenSpec';
import { cachedModel, type BuiltModel } from '../animals/models/voxelMesh';
import type { BlobSpot } from './blobShadow';
import { architectModel } from '../house/architectSpec';
import { architectRepairSpec } from '../house/architectRepairSpec';
import data from '../town/repairFinal.json';
import type { TownCarpenter } from '../town/townCarpenter';
import { BONE_NAMES, newPose, poseAt, type MotionName, type Pose } from '../town/townCarpenterPose';
import { BoxBuf } from './repairBoxes';
import { RepairAtlas } from './repairAtlas';
import { texOf } from './townScaffoldFx';

/**
 * TOWN-1 1.4 §2.16 の 9〜11・設計 repair-final: 街の だいくさん（こやの 建築士さん）の 絵と、るすの ふだ。
 * 休みの 形と なおし用の 形の 2 つの 骨つき メッシュを 同じ 骨に かぶせ、るすの あいだ だけ なおし用に 入れかえる（描画は 1 回）。
 * しぐさは 設計 JSON の コマの 表（townCarpenterPose）。回す 順は x → y → z（Euler 'ZYX'）。足もとの 影は プレイヤーの 影に まぜる（+0）。
 * ふだは 竹の 立てふだ（るすの 間 だけ。出て いる 間は 描画 +1）。
 */
const D = Math.PI / 180;
/** これより 遠い ときは 描かない（ブロック） */
const DRAW_RADIUS = 96;
const CULL_Y = 0.9;
const CULL_R = 1.3;
const SHADOW_W = 0.9;

const SIGN_ATLAS = (): RepairAtlas =>
  new RepairAtlas(512, 256, [
    { name: 'take', x: 0, y: 0, w: 16, h: 16, url: 'town_take.png', color: '#6FA04A' },
    { name: 'wara', x: 16, y: 0, w: 16, h: 16, url: 'town_wara.png', color: '#D8BE7A' },
    { name: 'ita', x: 32, y: 0, w: 16, h: 16, color: '#D9B27A' },
    { name: 'board', x: 0, y: 32, w: 304, h: 192, url: 'rusu_board_text.png', color: '#D9B27A' },
  ]);

export class TownCarpenterFx {
  readonly group = new THREE.Group();
  /** 体の 材料（`Lighting.register(fx.bodyMaterial, 'doll')` で 夜に 暗くなる） */
  readonly bodyMaterial = shadeMat();
  private readonly signMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly signAtlas = SIGN_ATLAS();
  private readonly rest: THREE.Mesh;
  private readonly work: THREE.Mesh;
  private readonly signMesh: THREE.Mesh;
  private readonly root = new THREE.Group();
  private readonly rig = new THREE.Group();
  private readonly bones: Record<(typeof BONE_NAMES)[number], THREE.Bone>;
  private readonly bodyRest: [number, number, number];
  private readonly pose: Pose = newPose();
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly camPos = new THREE.Vector3();
  private readonly spots: BlobSpot[] = [];
  /** いま 描いて いるか・なおし用か・ふだが 出て いるか（テスト窓口・描画の 数え） */
  shown = { body: false, repairForm: false, sign: false };

  constructor(
    scene: THREE.Object3D,
    private readonly home: { x: number; y: number; z: number; yaw: number },
  ) {
    const a: BuiltModel = architectModel();
    const b: BuiltModel = cachedModel('architect-repair', architectRepairSpec);
    const bones = a.names.map((n) => {
      const bone = new THREE.Bone();
      bone.name = n;
      bone.rotation.order = 'ZYX';
      return bone;
    });
    bones.forEach((bone, i) => {
      bone.position.set(a.rest[i]![0], a.rest[i]![1], a.rest[i]![2]);
      const par = a.parents[i]!;
      if (par >= 0) bones[par]!.add(bone);
      else this.rig.add(bone);
    });
    this.rig.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones);
    this.rest = new THREE.SkinnedMesh(a.geo, this.bodyMaterial);
    this.work = new THREE.SkinnedMesh(b.geo, this.bodyMaterial);
    for (const m of [this.rest, this.work] as THREE.SkinnedMesh[]) {
      m.bind(skel, new THREE.Matrix4());
      m.frustumCulled = false;
      m.renderOrder = 2;
      this.rig.add(m);
    }
    this.work.visible = false;
    this.root.add(this.rig);
    this.bones = Object.fromEntries(a.names.map((n, i) => [n, bones[i]])) as Record<(typeof BONE_NAMES)[number], THREE.Bone>;
    const bi = a.names.indexOf('body');
    this.bodyRest = [a.rest[bi]![0], a.rest[bi]![1], a.rest[bi]![2]];
    this.root.visible = false;

    // るすの ふだ（原点 ＝ 建築士さんが 立つ 所の ゆか。前 ＝ −z）
    const buf = new BoxBuf(this.signAtlas);
    for (const [, spec] of data.sign.boxes as unknown as [string, [number, number, number, number, number, number, string]][]) {
      buf.box([0, 0, 0], [spec[0], spec[1], spec[2], spec[3], spec[4], spec[5]], texOf(spec[6], 'ita'));
    }
    this.signMaterial.map = this.signAtlas.texture;
    this.signMesh = new THREE.Mesh(buf.build(), this.signMaterial);
    this.signMesh.position.set(home.x, home.y, home.z);
    this.signMesh.rotation.y = -home.yaw;
    this.signMesh.frustumCulled = false;
    this.signMesh.renderOrder = 2;
    this.signMesh.visible = false;
    this.group.add(this.root, this.signMesh);
    scene.add(this.group);
  }

  get signMat(): THREE.Material {
    return this.signMaterial;
  }

  update(c: TownCarpenter, camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.camPos);
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.spots.length = 0;
    // ふだ: るすの 間 だけ
    const nearSign = this.near(this.home.x, this.home.z);
    this.signMesh.visible = c.sign() && nearSign;
    this.shown.sign = this.signMesh.visible;
    // 体
    const visible = this.near(c.x, c.z) && this.sees(c.x, c.y, c.z);
    this.root.visible = visible;
    this.shown.body = visible;
    this.shown.repairForm = c.out;
    if (!visible) return;
    this.rest.visible = !c.out;
    this.work.visible = c.out;
    this.root.position.set(c.x, c.y, c.z);
    this.root.rotation.set(0, -c.yaw, 0);
    this.apply(c.motion, c.frame);
    this.spots.push({ x: c.x, y: c.y, z: c.z, size: SHADOW_W });
  }

  /** 足もとの 影（プレイヤーの 影に まぜる） */
  shadowSpots(): readonly BlobSpot[] {
    return this.spots;
  }

  private near(x: number, z: number): boolean {
    const dx = x - this.camPos.x;
    const dz = z - this.camPos.z;
    return dx * dx + dz * dz <= DRAW_RADIUS * DRAW_RADIUS;
  }

  private sees(x: number, y: number, z: number): boolean {
    this.sphere.center.set(x, y + CULL_Y, z);
    this.sphere.radius = CULL_R;
    return this.frustum.intersectsSphere(this.sphere);
  }

  private apply(m: MotionName | 'rest', frame: number): void {
    const p = this.pose;
    if (m === 'rest') {
      for (const n of BONE_NAMES) p[n][0] = p[n][1] = p[n][2] = 0;
      p.tool[0] = 28;
      p.tool[2] = -10;
      p.bodyUp = 0;
    } else poseAt(m, frame, p);
    for (const n of BONE_NAMES) this.bones[n].rotation.set(p[n][0] * D, p[n][1] * D, p[n][2] * D);
    this.bones.body.position.set(this.bodyRest[0], this.bodyRest[1] + p.bodyUp * V, this.bodyRest[2]);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.signMesh.geometry.dispose();
    this.signMaterial.dispose();
    this.signAtlas.dispose();
    this.bodyMaterial.dispose();
  }
}
