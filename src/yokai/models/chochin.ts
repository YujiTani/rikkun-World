import * as THREE from 'three';
import { DEG, YokaiBase, boxGeo, makeBlinkRows, makePixelTexture, solid } from '../common';
import type { HitBox, YokaiPoseInput } from '../common';
import { YOKAI_STATS } from '../stats';

const FACE = [
  '................',
  '................',
  '..WWWW......WW..',
  '.WWWWWW....WWWW.',
  '.WWKKWW....WKKW.',
  '.WWKKWW....WKKW.',
  '.WWWWWW....WWWW.',
  '..WWWW......WW..',
  '................',
  '..KKKKKKKKKKKK..',
  '..KRRRRRRRRRRK..',
  '...KRRRRRRRRK...',
  '....KKKKKKKK....',
  '................',
  '................',
  '................',
];
const FACE_CLOSED = makeBlinkRows(FACE, [2, 3, 4, 5, 6, 7], 4, '.', 'WK');

const ST = YOKAI_STATS.chochin;
const BODY = 0xffb347;
const BODY_BRIGHT = 0xfff2a0;
const HANDLE_Y = 1.2;

export const FIREBALL_SPEED = 3.0;
export const FIREBALL_RANGE = 8;
export const FIREBALL_BOX = 0.5;

/** 火の玉（世界に置く）。設計書 5 章。速さ 3.0 ブロック/秒、8 ブロックで消える、当たり判定は 0.5 角 */
export class Fireball {
  readonly group = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly tail1: THREE.Mesh;
  private readonly tail2: THREE.Mesh;
  /** 置いてある座標系での位置 */
  readonly position = new THREE.Vector3();
  readonly dir = new THREE.Vector3(0, 0, -1);
  traveled = 0;
  alive = true;
  private age = 0;

  constructor() {
    this.core = new THREE.Mesh(boxGeo(0.3, 0.3, 0.3), solid(0xffb020));
    this.tail1 = new THREE.Mesh(boxGeo(0.18, 0.18, 0.18), solid(0xff8c1a));
    this.tail2 = new THREE.Mesh(boxGeo(0.1, 0.1, 0.1), solid(0xffe14d));
    this.group.add(this.core, this.tail1, this.tail2);
  }

  start(pos: THREE.Vector3, dir: THREE.Vector3): void {
    this.position.copy(pos);
    this.dir.copy(dir).normalize();
    this.traveled = 0;
    this.age = 0;
    this.alive = true;
    this.group.visible = true;
    this.apply();
  }

  /** 当たり判定の箱（0.5 角）の中心 */
  get boxSize(): number {
    return FIREBALL_BOX;
  }

  update(dt: number): void {
    if (!this.alive) return;
    const step = FIREBALL_SPEED * dt;
    this.position.addScaledVector(this.dir, step);
    this.traveled += step;
    this.age += dt;
    if (this.traveled >= FIREBALL_RANGE - 1e-6) {
      this.alive = false;
      this.group.visible = false;
      return;
    }
    this.apply();
  }

  private apply(): void {
    this.group.position.copy(this.position);
    this.core.rotation.set(Math.PI * 2 * (this.age / 0.5), Math.PI * 2 * (this.age / 0.5), 0); // 0.5 秒で 1 回転
    this.tail1.position.copy(this.dir).multiplyScalar(-0.25);
    this.tail2.position.copy(this.dir).multiplyScalar(-0.45);
  }
}

/** ちょうちんおばけ（遠くから火の玉）。設計書 5 章 */
export class Chochin extends YokaiBase {
  readonly id = 'chochin';
  readonly displayName = 'ちょうちんおばけ';
  readonly attackSeconds = ST.attackSeconds;
  readonly hitAt = ST.hitSeconds;
  readonly moveSpeed = ST.speed;

  /** 火の玉を置く所。null なら root の中（root と一緒に動く）。見本ページは世界（stage）を入れる */
  fireLayer: THREE.Object3D | null = null;
  readonly fireballs: Fireball[] = [];

  private readonly uku = this.group(this.rig, [0, 0.5, 0]);
  private readonly tsuri = this.group(this.uku, [0, HANDLE_Y, 0]);
  private readonly tongue = this.group(this.tsuri, [0, 0.3 - HANDLE_Y, -0.37]);
  private readonly bodyMat = this.mat(BODY);
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor() {
    super();
    this.aim.set(0, 0, -FIREBALL_RANGE);
    const g = this.tsuri;
    const dark = 0x3a3a4a;
    const wood = 0x6b4226;
    const rib = 0xc46a1e;
    const at = (y: number): [number, number, number] => [0, y - HANDLE_Y, 0];
    this.addBox(g, 0.45, 0.08, 0.45, at(0.04), this.mat(dark), dark);
    this.addBox(g, 0.6, 0.12, 0.6, at(0.14), this.bodyMat, BODY);
    this.addBox(g, 0.72, 0.5, 0.72, at(0.45), this.bodyMat, BODY);
    this.addBox(g, 0.74, 0.03, 0.74, at(0.32), this.mat(rib), rib);
    this.addBox(g, 0.74, 0.03, 0.74, at(0.58), this.mat(rib), rib);
    this.addBox(g, 0.6, 0.12, 0.6, at(0.76), this.bodyMat, BODY);
    this.addBox(g, 0.45, 0.08, 0.45, at(0.86), this.mat(dark), dark);
    this.addBox(g, 0.06, 0.25, 0.06, at(1.025), this.mat(wood), wood);
    this.addBox(g, 0.3, 0.06, 0.06, at(1.15), this.mat(wood), wood);
    this.addFace(g, 0.5, [0, 0.45 - HANDLE_Y, -0.375], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    this.addBox(this.tongue, 0.16, 0.05, 0.12, [0, 0, -0.06], this.mat(0xff7a9a), 0xff7a9a);
    this.addBox(this.tongue, 0.16, 0.4, 0.05, [0, -0.18, -0.12], this.mat(0xff7a9a), 0xff7a9a);
    this.finish();
  }

  /** 口（うくから (0,0.3,-0.45)）の、root から見た位置 */
  private mouthLocal(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, this.uku.position.y + 0.3, this.uku.position.z - 0.45);
  }

  protected attackHitBox(): HitBox {
    const m = this.mouthLocal(this.tmp);
    return { cx: m.x, cy: m.y, cz: m.z, w: FIREBALL_BOX, h: FIREBALL_BOX, d: FIREBALL_BOX };
  }

  protected onAttackHit(): void {
    // 出た時点のプレイヤーのからだの中心（足もと +1.0）へ、まっすぐ。重力なし
    const from = this.mouthLocal(this.tmp);
    const dir = this.tmp2.copy(this.aim).setY(this.aim.y + 1.0).sub(from);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    let fb = this.fireballs.find((f) => !f.alive);
    if (!fb) {
      fb = new Fireball();
      this.fireballs.push(fb);
    }
    const layer = this.fireLayer ?? this.root;
    if (layer.parent === null && layer !== this.root) layer.updateMatrixWorld(true);
    if (this.fireLayer) {
      this.root.updateWorldMatrix(true, false);
      from.applyMatrix4(this.root.matrixWorld);
      dir.transformDirection(this.root.matrixWorld);
    }
    fb.start(from, dir);
    if (fb.group.parent !== layer) layer.add(fb.group);
  }

  update(dt: number): void {
    super.update(dt);
    for (const f of this.fireballs) f.update(dt);
  }

  info(): Record<string, number> {
    return { alive: this.fireballs.filter((f) => f.alive).length, ukuY: this.uku.position.y };
  }

  protected pose(p: YokaiPoseInput): void {
    const tau = Math.PI * 2;
    this.uku.position.set(0, 0.5 + 0.08 * Math.sin((tau * p.time) / 2), 0);
    this.uku.rotation.set(0, 0, 0);
    this.tsuri.rotation.z = 8 * DEG * Math.sin((tau * p.time) / 2);
    this.tsuri.scale.set(1, 1, 1);
    this.tongue.rotation.x = 0;
    if (p.moving) {
      this.uku.rotation.x = -10 * DEG;
      this.tongue.rotation.x = 15 * DEG * Math.sin((tau * p.time) / 0.5);
    }
    let color = BODY;
    if (p.attackT >= 0) {
      const t = p.attackT;
      // 0〜0.3 合図: 0.075 秒ずつ点めつ（2 回）
      if (t < 0.3 - 1e-6 && Math.floor((t + 1e-6) / 0.075) % 2 === 0) color = BODY_BRIGHT;
      // 0.3〜0.45 ぷくっ（0.5 まで保つ）
      if (t >= 0.3 - 1e-6 && t < 0.5 - 1e-6) {
        const k = Math.min(1, (t - 0.3) / 0.15);
        this.tsuri.scale.set(1 + 0.15 * k, 1, 1 + 0.15 * k);
      }
      // 0.5 火の玉が出る。反動で後ろへ 0.2、0.8 秒までにもどる
      if (t >= 0.5 - 1e-6) {
        const k = Math.max(0, 1 - (t - 0.5) / 0.3);
        this.uku.position.z = 0.2 * k;
      }
    }
    this.bodyMat.color.setHex(color);
  }

  protected poseDie(p: number): void {
    this.uku.position.y = 0.5 * (1 - p);
    this.uku.rotation.z = 90 * DEG * p;
  }
}
