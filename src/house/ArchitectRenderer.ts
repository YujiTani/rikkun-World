import * as THREE from 'three';
import { shadeMat } from '../animals/models/animalRenderParts';
import type { BlobSpot } from '../fx/blobShadow';
import { V } from '../animals/models/chickenSpec';
import type { BuiltModel } from '../animals/models/voxelMesh';
import type { Architect } from './architect';
import { poseOf } from './architectPose';
import { ARCH_COL, architectModel } from './architectSpec';

/**
 * 建築士さんを 描く 係（HOUSE-1A。見た目は オーナー OK 済みの 案 A「はっぴの だいくさん」）。
 *  - 形は 1 つ（`architectModel()`）を 全員で 使い、1 人 = 骨つきの SkinnedMesh 1 つ（描画 1 回）。材料も 1 つ（どうぶつと 同じ `shadeMat`）。
 *  - ねらい中の ふちどりは その 1 人だけ（+1 回）。足もとの 影は 自分では 描かず `shadowSpots()` で プレイヤーの 足もとの 影（BlobShadow）の 描画に まぜる（+0 回）。
 *  - 画面の 外・遠い・メッシュが まだ できて いない 所の 建築士さんは 描かない（描画回数を ふやさない）。
 * 使い方: `scene.add(r.group)`、毎フレーム `r.update(architects, camera, aimedId)`。
 */

const D = Math.PI / 180;
/** これより 遠い 建築士さんは 描かない（ブロック） */
const DRAW_RADIUS = 96;
/** 画面の 内か しらべる 球: 足もとからの 高さと 半径（木づちと 腕を 入れて 少し 大きめ） */
const CULL_Y = 0.9;
const CULL_R = 1.3;
/** 足もとの 影の はば（ブロック。見本と 同じ） */
const SHADOW_W = 0.9;
/** 使いまわす 入れ物の 上限（これ以上 いっぺんに 見える ことは ない） */
const POOL_MAX = 8;

type BoneName = 'body' | 'legL' | 'legR' | 'armL' | 'armR' | 'tool' | 'head';

interface Entry {
  id: string;
  root: THREE.Group;
  rig: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  /** 体の 骨の 待機の 位置（上下に ゆれる 元の 高さ） */
  bodyRest: [number, number, number];
  mesh: THREE.SkinnedMesh;
  hull: THREE.SkinnedMesh;
  gen: number;
}

export interface ArchitectRenderStats {
  /** 描いている 建築士さんの 数 */
  shown: number;
  /** 描画回数（体 ＋ ふちどり）と 三角形（影は プレイヤーの 足もとの 影（BlobShadow）に まぜる ので 数えない） */
  draws: number;
  triangles: number;
}

export class ArchitectRenderer {
  readonly group = new THREE.Group();
  /** 体の 材料（`Lighting.register(r.bodyMaterial, 'doll')` で 夜に 暗くなる） */
  readonly bodyMaterial = shadeMat();
  private readonly hullMaterial = new THREE.MeshBasicMaterial({ color: ARCH_COL.outline, fog: false, depthWrite: false });
  private readonly model: BuiltModel = architectModel();
  private readonly entries = new Map<string, Entry>();
  private readonly pool: Entry[] = [];
  private gen = 0;
  private readonly spots: BlobSpot[] = [];
  private stat: ArchitectRenderStats = { shown: 0, draws: 0, triangles: 0 };
  private readonly frustum = new THREE.Frustum();
  private readonly pv = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly camPos = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();

  /** drawn: その 地点の 地面の メッシュが できて いるか（なければ いつも true）。できて いない 所に 浮かせない */
  constructor(private readonly drawn: (x: number, z: number) => boolean = () => true) {
    this.hullMaterial.userData.noDim = true;
  }

  /** 毎フレーム。list = 読みこまれて いる 建築士さん、aimedId = ねらって いる 1 人（なければ null） */
  update(list: readonly Architect[], camera: THREE.Camera, aimedId: string | null): void {
    const gen = ++this.gen;
    camera.updateMatrixWorld();
    camera.getWorldPosition(this.camPos);
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    this.spots.length = 0;
    let draws = 0;
    let tris = 0;
    let shown = 0;
    for (const a of list) {
      let e = this.entries.get(a.id);
      if (!e) {
        e = this.make(a.id);
        this.entries.set(a.id, e);
        this.group.add(e.root);
      }
      e.gen = gen;
      const visible = this.canSee(a);
      e.root.visible = visible;
      if (!visible) continue;
      this.apply(e, a);
      const aimed = a.id === aimedId;
      e.hull.visible = aimed;
      shown++;
      draws += aimed ? 2 : 1;
      tris += this.model.tris + (aimed ? this.model.hullTris : 0);
      this.spots.push({ x: a.x, y: a.y, z: a.z, size: SHADOW_W });
    }
    // 一覧から はずれた（遠くへ はなれた・列が きえた）建築士さんを かたづける
    if (this.entries.size > list.length) for (const e of [...this.entries.values()]) if (e.gen !== gen) this.release(e);
    this.stat = { shown, draws, triangles: tris };
  }

  /** いま 描いて いる 建築士さんの 足もとの 影（`BlobShadow.setExtras` へ。プレイヤーの 影と 同じ 1 回の 描画に まざる） */
  shadowSpots(): readonly BlobSpot[] {
    return this.spots;
  }

  stats(): ArchitectRenderStats {
    return this.stat;
  }

  // ------------------------------------------------------------ 中の 動き

  /** 近くて、画面の 中に あって、足もとの 地面が 描かれて いる */
  private canSee(a: Architect): boolean {
    const dx = a.x - this.camPos.x;
    const dz = a.z - this.camPos.z;
    if (dx * dx + dz * dz > DRAW_RADIUS * DRAW_RADIUS) return false;
    this.sphere.center.set(a.x, a.y + CULL_Y, a.z);
    this.sphere.radius = CULL_R;
    return this.frustum.intersectsSphere(this.sphere) && this.drawn(a.x, a.z);
  }

  private make(id: string): Entry {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.id = id;
      return pooled;
    }
    const m = this.model;
    const root = new THREE.Group();
    const rig = new THREE.Group();
    root.add(rig);
    const bones = m.names.map((n) => {
      const b = new THREE.Bone();
      b.name = n;
      return b;
    });
    bones.forEach((b, i) => {
      b.position.set(m.rest[i][0], m.rest[i][1], m.rest[i][2]);
      const par = m.parents[i];
      if (par >= 0) bones[par].add(b);
      else rig.add(b);
    });
    rig.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(bones);
    const mesh = new THREE.SkinnedMesh(m.geo, this.bodyMaterial);
    mesh.bind(skel, new THREE.Matrix4());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    const hull = new THREE.SkinnedMesh(m.hull, this.hullMaterial);
    hull.bind(skel, new THREE.Matrix4());
    hull.frustumCulled = false;
    hull.renderOrder = 1; // 地面の あと → ふちどり → 体
    hull.visible = false;
    rig.add(mesh, hull);
    const byName = Object.fromEntries(m.names.map((n, i) => [n, bones[i]])) as Record<BoneName, THREE.Bone>;
    const bi = m.names.indexOf('body');
    return { id, root, rig, bones: byName, bodyRest: [m.rest[bi][0], m.rest[bi][1], m.rest[bi][2]], mesh, hull, gen: 0 };
  }

  private release(e: Entry): void {
    e.root.removeFromParent();
    this.entries.delete(e.id);
    if (this.pool.length < POOL_MAX) this.pool.push(e);
  }

  /** 位置・向き・骨の 角度を あわせる */
  private apply(e: Entry, a: Architect): void {
    e.root.position.set(a.x, a.y, a.z);
    e.root.rotation.set(0, -a.yaw, 0); // ゲームの 向きは −yaw（妖怪と 同じ）
    const p = poseOf({ gait: a.gait, gaitAmp: a.gaitAmp, nod: a.nod, wobble: a.wobble, wobbleDir: a.wobbleDir, yaw: a.yaw, hammer: a.hammer, cheer: a.cheer });
    const b = e.bones;
    b.body.position.set(e.bodyRest[0], e.bodyRest[1] + p.bodyUp * V, e.bodyRest[2]);
    b.body.rotation.set(p.bodyX * D, 0, 0);
    b.legL.rotation.set(p.legLX * D, 0, 0);
    b.legR.rotation.set(p.legRX * D, 0, 0);
    b.armL.rotation.set(p.armLX * D, 0, 0);
    b.armR.rotation.set(p.armRX * D, 0, 0);
    b.head.rotation.set(p.headX * D, 0, p.headZ * D);
    b.tool.rotation.set(p.toolX * D, 0, p.toolZ * D);
    // おっとっと: 足もとを 中心に 体ごと かたむく（向きは 建築士さんから 見て。0 = 前 = −z）
    if (p.lean === 0) e.rig.quaternion.identity();
    else e.rig.quaternion.setFromAxisAngle(this.axis.set(-Math.cos(p.leanDir), 0, -Math.sin(p.leanDir)), p.lean * D);
  }
}
