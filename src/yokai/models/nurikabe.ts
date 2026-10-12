import * as THREE from 'three';
import { DEG, Smoke, YokaiBase, makeBlinkRows, makePixelTexture } from '../common';
import type { HitBox, YokaiPoseInput } from '../common';
import { YOKAI_STATS } from '../stats';

const FACE = [
  '................',
  '................',
  '................',
  '................',
  '....KK....KK....',
  '....KK....KK....',
  '....KK....KK....',
  '................',
  '..PP........PP..',
  '................',
  '....K......K....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
  '................',
];
const FACE_CLOSED = makeBlinkRows(FACE, [4, 5, 6], 5, '.', 'K');

const PATTERN = [
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSS',
  'SSDSSSSSSSSSSSSS',
  'SSDDSSSSSSSDSSSS',
  'SSSSSSSSSSSDSSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSSDSSSSSSSSSS',
  'SSSSSDDSSSSSSSDS',
  'SSSSSSSSSSSSSSDS',
  'SSSSSSSSSSSSSSSS',
  'SDSSSSSSSDSSSSSS',
  'SDSSSSSSSDDSSSSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSDSS',
  'SSSSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSSSS',
];
const ST = YOKAI_STATS.nurikabe;
const STONE = 0xa39b8b;
const STONE_DARK = 0x8a8273;
const STONE_LIMB = 0x8e8676;
/** かべの たおれこみの軸（前の下のはし） */
const PIVOT: readonly [number, number, number] = [0, 0.15, -0.4];

/** ぬりかべ（大きな かべ、のけぞって どすーん）。設計書 6 章 */
export class Nurikabe extends YokaiBase {
  readonly id = 'nurikabe';
  readonly displayName = 'ぬりかべ';
  readonly attackSeconds = ST.attackSeconds;
  readonly hitAt = ST.hitSeconds;
  readonly moveSpeed = ST.speed;
  protected override knockback = false;

  // のっしのっしゆれるのは足もとが軸
  private readonly tilt = this.group(this.rig);
  private readonly kabe = this.group(this.tilt, PIVOT);
  private readonly bodyMesh: THREE.Mesh;
  private readonly face: THREE.Mesh;
  private readonly armL = this.group(this.kabe, [-1.3, 1.6 - PIVOT[1], -PIVOT[2]]);
  private readonly armR = this.group(this.kabe, [1.3, 1.6 - PIVOT[1], -PIVOT[2]]);
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  /** どすーん のけむり（白い立方体 6 こ） */
  readonly smoke = new Smoke(6, 0.3, 1.2, 0.6);

  constructor() {
    super();
    this.root.add(this.smoke.group);
    const k = this.kabe;
    const pattern = makePixelTexture(PATTERN, { S: STONE, D: STONE_DARK });
    const bodyMat = new THREE.MeshBasicMaterial({ map: pattern });
    // 子にするので (0, -0.15, +0.4) ずらす
    const dy = -PIVOT[1];
    const dz = -PIVOT[2];
    this.bodyMesh = this.addBox(k, 2.6, 2.7, 0.8, [0, 1.5 + dy, dz], bodyMat, STONE);
    this.face = this.addFace(k, 1.6, [0, 1.9 + dy, -0.41 + dz], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    const moss = 0x6dbe45;
    const mossBig = 0x5aa83a;
    for (const [x, y, z] of [
      [-0.8, 2.925, 0],
      [0.15, 2.925, 0.1],
      [0.9, 2.925, -0.1],
    ] as const) {
      this.addBox(k, 0.35, 0.15, 0.35, [x, y + dy, z + dz], this.mat(moss), moss);
    }
    this.addBox(k, 0.5, 0.2, 0.4, [-0.3, 2.95 + dy, dz], this.mat(mossBig), mossBig);
    for (const [arm, s] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      this.addBox(arm, 0.25, 0.5, 0.25, [0.125 * s, -0.25, 0], this.mat(STONE_LIMB), STONE_LIMB);
    }
    this.legL = this.addBox(this.tilt, 0.4, 0.15, 0.4, [-0.7, 0.075, 0], this.mat(STONE_LIMB), STONE_LIMB);
    this.legR = this.addBox(this.tilt, 0.4, 0.15, 0.4, [0.7, 0.075, 0], this.mat(STONE_LIMB), STONE_LIMB);
    this.finish();
  }

  /** 前の地面に はば 2.6 × 高さ 1.0 × 長さ 3.0（前のはしから -Z へ） */
  protected attackHitBox(): HitBox {
    return { cx: 0, cy: 0.5, cz: PIVOT[2] - 1.5, w: 2.6, h: 1.0, d: 3.0 };
  }

  protected onAttackHit(): void {
    this.smoke.start(0, 0, PIVOT[2] - 0.2);
  }

  update(dt: number): void {
    super.update(dt);
    this.smoke.update(dt);
  }

  info(): Record<string, number> {
    return { leanDeg: (this.kabe.rotation.x * 180) / Math.PI, faceShakeX: this.face.position.x };
  }

  protected pose(p: YokaiPoseInput): void {
    const tau = Math.PI * 2;
    this.bodyMesh.scale.y = 1.015 - 0.015 * Math.cos((tau * p.time) / 4);
    const a = 10 * DEG * Math.sin((tau * p.time) / 4);
    this.armR.rotation.set(0, 0, a);
    this.armL.rotation.set(0, 0, -a);
    this.tilt.rotation.z = 0;
    this.legL.position.y = 0.075;
    this.legR.position.y = 0.075;
    this.face.position.x = 0;
    if (p.moving && p.attackT < 0) {
      const s = Math.sin((tau * p.time) / 1.6);
      this.tilt.rotation.z = 6 * DEG * s;
      this.legL.position.y = 0.075 + 0.1 * Math.max(0, s);
      this.legR.position.y = 0.075 + 0.1 * Math.max(0, -s);
    }
    let rx = 0;
    if (p.attackT >= 0) {
      const t = p.attackT;
      if (t < 1.1) {
        // 合図: ゆっくり後ろへのけぞり、バンザイ
        const k = t / 1.1;
        rx = 25 * k;
        this.armR.rotation.z = 60 * DEG * k;
        this.armL.rotation.z = -60 * DEG * k;
      } else if (t < 1.4) {
        rx = 25;
        this.armR.rotation.z = 60 * DEG;
        this.armL.rotation.z = -60 * DEG;
      } else if (t < 1.5) {
        // すごい速さで前にたおれる（0.1 秒）
        rx = 25 - 115 * ((t - 1.4) / 0.1);
        this.armR.rotation.z = 60 * DEG;
        this.armL.rotation.z = -60 * DEG;
      } else if (t < 3.0) {
        rx = -90;
        const f = 20 * DEG * Math.sin((tau * (t - 1.5)) / 0.3);
        this.armR.rotation.set(f, 0, 0);
        this.armL.rotation.set(-f, 0, 0);
      } else {
        rx = -90 * Math.max(0, 1 - (t - 3.0) / 1.0);
      }
      // 0.6 秒から顔の板を 0.1 秒ごとに左右へ 0.03 ずらしてプルプル（のけぞりの間）
      if (t >= 0.6 && t < 1.4) this.face.position.x = Math.floor((t - 0.6 + 1e-6) / 0.1) % 2 === 0 ? 0.03 : -0.03;
    }
    this.kabe.rotation.x = rx * DEG;
  }

  protected poseDie(p: number): void {
    this.kabe.rotation.x = -90 * DEG * p;
  }
}
