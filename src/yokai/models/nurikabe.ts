import * as THREE from 'three';
import { DEG, YokaiBase, makeBlinkRows, makePixelTexture } from '../common';
import type { YokaiPoseInput } from '../common';

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
const STONE = 0xa39b8b;
const STONE_DARK = 0x8a8273;
const STONE_LIMB = 0x8e8676;

/** ぬりかべ（大きなかべ）。設計書 5 章 */
export class Nurikabe extends YokaiBase {
  readonly id = 'nurikabe';
  readonly displayName = 'ぬりかべ';
  readonly attackSeconds = 2.2;
  readonly moveSpeed = 0.6;
  protected override knockback = false;

  // よちよちゆれるのは足もとが軸
  private readonly tilt = this.group(this.rig);
  /** たおれこみの軸（前の下のはし） */
  private readonly kabe = this.group(this.tilt, [0, 0.15, -0.25]);
  private readonly bodyMesh: THREE.Mesh;
  private readonly armL = this.group(this.kabe, [-0.9, 1.05, 0.25]);
  private readonly armR = this.group(this.kabe, [0.9, 1.05, 0.25]);
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;

  constructor() {
    super();
    const k = this.kabe;
    const pattern = makePixelTexture(PATTERN, { S: STONE, D: STONE_DARK });
    const bodyMat = new THREE.MeshBasicMaterial({ map: pattern });
    this.bodyMesh = this.addBox(k, 1.8, 2.0, 0.5, [0, 1.0, 0.25], bodyMat, STONE);
    this.addFace(k, 1.2, [0, 1.3, -0.01], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    const moss = 0x6dbe45;
    const mossBig = 0x5aa83a;
    // 子にするので (0, -0.15, +0.25) ずらす
    for (const [x, y, z] of [
      [-0.55, 2.225, 0],
      [0.1, 2.225, 0.05],
      [0.6, 2.225, -0.05],
    ] as const) {
      this.addBox(k, 0.25, 0.15, 0.25, [x, y - 0.15, z + 0.25], this.mat(moss), moss);
    }
    this.addBox(k, 0.35, 0.2, 0.3, [-0.2, 2.1, 0.25], this.mat(mossBig), mossBig);
    for (const [arm, s] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      this.addBox(arm, 0.2, 0.4, 0.2, [0.1 * s, -0.2, 0], this.mat(STONE_LIMB), STONE_LIMB);
    }
    this.legL = this.addBox(this.tilt, 0.3, 0.15, 0.3, [-0.5, 0.075, 0], this.mat(STONE_LIMB), STONE_LIMB);
    this.legR = this.addBox(this.tilt, 0.3, 0.15, 0.3, [0.5, 0.075, 0], this.mat(STONE_LIMB), STONE_LIMB);
    this.finish();
  }

  protected pose(p: YokaiPoseInput): void {
    const tau = Math.PI * 2;
    this.bodyMesh.scale.y = 1.015 - 0.015 * Math.cos((tau * p.time) / 3);
    const a = 10 * DEG * Math.sin((tau * p.time) / 3);
    this.armR.rotation.z = a;
    this.armL.rotation.z = -a;
    this.tilt.rotation.z = 0;
    this.legL.position.y = 0.075;
    this.legR.position.y = 0.075;
    if (p.moving) {
      const s = Math.sin(tau * p.time);
      this.tilt.rotation.z = 6 * DEG * s;
      this.legL.position.y = 0.075 + 0.1 * Math.max(0, s);
      this.legR.position.y = 0.075 + 0.1 * Math.max(0, -s);
    }
    let rx = 0;
    if (p.attackT >= 0) {
      const t = p.attackT;
      if (t < 0.6) rx = 10 * (t / 0.6);
      else if (t < 0.9) rx = 10 - 85 * ((t - 0.6) / 0.3);
      else if (t < 1.4) rx = -75;
      else rx = -75 * Math.max(0, 1 - (t - 1.4) / 0.8);
    }
    this.kabe.rotation.x = rx * DEG;
  }

  protected poseDie(p: number): void {
    this.kabe.rotation.x = -90 * DEG * p;
  }
}
