import * as THREE from 'three';
import { DEG, YokaiBase, makePixelTexture } from '../common';
import type { HitBox, YokaiPoseInput } from '../common';
import { YOKAI_STATS } from '../stats';

const SKIN = 0xf2c9a0;
const FACE = [
  'KKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKK',
  'KKSSSKKKKKKSSSKK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSKKSSSSKKSSSK',
  'KSSKSSKSSKSSKSSK',
  'KSSSSSSSSSSSSSSK',
  'KSPPSSSSSSSSPPSK',
  'KSSSSSKKKKSSSSSK',
  'KSSSSSKRRKSSSSSK',
  'KSSSSSSKKSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
];
// にっこり目をとじた形（目の行だけ、まっすぐな線にする）
const FACE_CLOSED = FACE.map((r, y) => {
  if (y === 5) return 'KSSSSSSSSSSSSSSK';
  if (y === 6) return 'KSSKKKKSSKKKKSSK';
  return r;
});

const FACE_SCARY = [
  'KKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKK',
  'KKSSSKKKKKKSSSKK',
  'KSKKSSSSSSSSKKSK',
  'KSSSKKSSSSKKSSSK',
  'KSSSSSSSSSSSSSSK',
  'KSSWWKKSSKKWWSSK',
  'KSSSSSSSSSSSSSSK',
  'KSKKKKKKKKKKKKSK',
  'KSKWWWWWWWWWWKSK',
  'KSKRWRWRWRWRRKSK',
  'KSKRRWRWRWRWRKSK',
  'KSKWWWWWWWWWWKSK',
  'KSKKKKKKKKKKKKSK',
  'KSSSSSSSSSSSSSSK',
  'KSSSSSSSSSSSSSSK',
];

const ST = YOKAI_STATS.rokurokubi;
const NODES = 4;
const NODE_LEN = 0.3;
const NECK_BASE_Y = 1.0;
/** 首のつけ根からあたまの根もとまで（まっすぐ立てたとき） */
const NECK_REST = NODES * NODE_LEN;
/** あたまの中心は あたま の原点の 0.25 上 */
const HEAD_CENTER = 0.25;
const BENT_NODES = 16;
const HEAD_TARGET_Y = 1.3; // プレイヤーの足もと +1.3

/** ろくろくび（首をのばして かみつく）。設計書 7 章 */
export class Rokurokubi extends YokaiBase {
  readonly id = 'rokurokubi';
  readonly displayName = 'ろくろくび';
  readonly attackSeconds = ST.attackSeconds;
  readonly hitAt = ST.hitSeconds;
  readonly moveSpeed = ST.speed;

  private readonly body = this.group(this.rig);
  private readonly sleeveL = this.group(this.body, [-0.3, 1.0, 0]);
  private readonly sleeveR = this.group(this.body, [0.3, 1.0, 0]);
  private readonly nodes: THREE.Group[] = [];
  private readonly necks: THREE.Mesh[] = [];
  private readonly head: THREE.Group;
  /** 攻撃を始めた時点のねらい（あたまの中心がめざす所、root から見た位置） */
  private readonly target = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  /** 首の曲がり角（root から見た位置。まっすぐなら空） */
  private route: THREE.Vector3[] = [];
  private readonly bentBoxes: THREE.Mesh[] = [];
  /** 曲がった首の節（つけ根から あたまの根もとまで BENT_NODES + 1 こ） */
  private readonly bentPts: THREE.Vector3[] = [];
  private bentOn = false;
  private readonly poly: THREE.Vector3[] = [];
  private readonly polyStart = new THREE.Vector3();
  private readonly polyEnd = new THREE.Vector3();
  private readonly upVec = new THREE.Vector3(0, 1, 0);
  private polyLen = 0;

  constructor() {
    super();
    this.aim.set(0, 0, -ST.reach);
    const b = this.body;
    const blue = 0x6f84e8;
    this.addBox(b, 0.7, 0.3, 0.45, [0, 0.15, 0], this.mat(0x5b6fd6), 0x5b6fd6);
    this.addBox(b, 0.6, 0.7, 0.35, [0, 0.65, 0], this.mat(blue), blue);
    this.addBox(b, 0.62, 0.15, 0.37, [0, 0.6, 0], this.mat(0xf2c14e), 0xf2c14e);
    this.addBox(this.sleeveL, 0.25, 0.45, 0.35, [-0.125, -0.225, 0], this.mat(blue), blue);
    this.addBox(this.sleeveR, 0.25, 0.45, 0.35, [0.125, -0.225, 0], this.mat(blue), blue);
    // 首: 節のグループを順につなぐ。のびは「箱の長さ」と「次の節の位置」に同じ倍率をかける
    let parent: THREE.Object3D = b;
    for (let i = 0; i < NODES; i++) {
      const g = this.group(parent, [0, i === 0 ? NECK_BASE_Y : NODE_LEN, 0]);
      this.necks.push(this.addBox(g, 0.14, NODE_LEN, 0.14, [0, NODE_LEN / 2, 0], this.mat(SKIN), SKIN));
      this.nodes.push(g);
      parent = g;
    }
    this.nodes[0]!.rotation.order = 'YXZ';
    this.head = this.group(parent, [0, NODE_LEN, 0]);
    this.head.rotation.order = 'XYZ';
    const k = 0x222222;
    const dark = this.mat(k);
    const skin = this.mat(SKIN);
    // 面の順: +x, -x, +y, -y, +z, -z
    this.addBox(this.head, 0.5, 0.5, 0.5, [0, 0.25, 0], [dark, dark, dark, skin, dark, skin], SKIN);
    this.addFace(
      this.head,
      0.5,
      [0, 0.25, -0.26],
      makePixelTexture(FACE, { S: SKIN }),
      makePixelTexture(FACE_CLOSED, { S: SKIN }),
      true,
      makePixelTexture(FACE_SCARY, { S: SKIN }),
    );
    this.addBox(this.head, 0.25, 0.2, 0.25, [0, 0.6, 0.05], dark, k);
    const pin = this.addBox(this.head, 0.4, 0.04, 0.04, [0, 0.62, 0.05], this.mat(0xff7a9a), 0xff7a9a);
    pin.rotation.z = 20 * DEG;
    for (let i = 0; i <= BENT_NODES; i++) this.bentPts.push(new THREE.Vector3(0, NECK_BASE_Y, 0));
    for (let i = 0; i < BENT_NODES; i++) {
      const m = this.addBox(this.body, 0.14, 1, 0.14, [0, NECK_BASE_Y, 0], this.mat(SKIN), SKIN);
      m.visible = false;
      this.bentBoxes.push(m);
    }
    this.finish();
  }

  /** 首の曲がり角を渡す（root から見た位置。[] ならまっすぐ）。attack() の前に呼ぶ */
  setNeckRoute(corners: ReadonlyArray<{ x: number; y: number; z: number }>): void {
    this.route.length = 0;
    for (const c of corners) this.route.push(new THREE.Vector3(c.x, c.y, c.z));
  }

  /** 曲がった首の節の位置（root から見た位置）。テスト用。曲がっていないときは空 */
  neckNodes(): THREE.Vector3[] {
    return this.bentOn ? this.bentPts.map((p) => p.clone()) : [];
  }

  /** 首が曲がって のびているか */
  neckBent(): boolean {
    return this.bentOn;
  }

  private setBent(on: boolean): void {
    if (on === this.bentOn) return;
    this.bentOn = on;
    this.nodes[0]!.visible = !on;
    for (const b of this.bentBoxes) b.visible = on;
    if (on) {
      this.body.add(this.head);
      this.head.rotation.set(0, 0, 0);
    } else {
      this.nodes[NODES - 1]!.add(this.head);
      this.head.position.set(0, NODE_LEN, 0);
    }
  }

  private pointAt(s: number, out: THREE.Vector3): THREE.Vector3 {
    let left = Math.max(0, Math.min(this.polyLen, s));
    for (let i = 0; i + 1 < this.poly.length; i++) {
      const a = this.poly[i]!;
      const b = this.poly[i + 1]!;
      const l = a.distanceTo(b);
      if (left <= l || i + 2 === this.poly.length) return out.copy(a).lerp(b, l > 1e-9 ? Math.min(1, left / l) : 0);
      left -= l;
    }
    return out.copy(this.poly[0]!);
  }

  private poseBent(t: number): void {
    const target = this.target;
    this.poly.length = 0;
    this.polyStart.set(0, NECK_BASE_Y, 0);
    this.poly.push(this.polyStart);
    for (const c of this.route) this.poly.push(c);
    this.polyEnd.set(target.x, target.y - HEAD_CENTER, target.z);
    this.poly.push(this.polyEnd);
    this.polyLen = 0;
    for (let i = 0; i + 1 < this.poly.length; i++) this.polyLen += this.poly[i]!.distanceTo(this.poly[i + 1]!);
    let phi: number;
    let k: number;
    if (t < 0.3) {
      phi = (20 * DEG * t) / 0.3;
      k = 0;
    } else if (t < 0.5) {
      phi = 20 * DEG;
      k = (t - 0.3) / 0.2;
    } else if (t < 1.0) {
      phi = 20 * DEG;
      k = 1;
    } else {
      const r = Math.min(1, (t - 1.0) / 0.6);
      phi = 20 * DEG * (1 - r);
      k = 1 - r;
    }
    this.setBent(true);
    const q = this.tmp;
    for (let i = 0; i <= BENT_NODES; i++) {
      const a = (NECK_REST * i) / BENT_NODES;
      this.pointAt((this.polyLen * i) / BENT_NODES, q);
      const rx = 0;
      const ry = NECK_BASE_Y + a * Math.cos(phi);
      const rz = a * Math.sin(phi);
      this.bentPts[i]!.set(rx + (q.x - rx) * k, ry + (q.y - ry) * k, rz + (q.z - rz) * k);
    }
    const up = this.upVec;
    const d = this.tmp2;
    for (let i = 0; i < BENT_NODES; i++) {
      const a = this.bentPts[i]!;
      const b = this.bentPts[i + 1]!;
      d.copy(b).sub(a);
      const len = d.length();
      const box = this.bentBoxes[i]!;
      box.position.copy(a).addScaledVector(d, 0.5);
      box.scale.y = Math.max(len + 0.03, 1e-4);
      if (len > 1e-6) box.quaternion.setFromUnitVectors(up, d.multiplyScalar(1 / len));
    }
    this.head.position.copy(this.bentPts[BENT_NODES]!);
    this.head.rotation.set(0, 0, 0);
  }

  protected onAttackStart(): void {
    // 0 秒の時点のプレイヤーの方へ。高さは足もと +1.3
    let dx = this.aim.x;
    let dz = this.aim.z;
    const h = Math.hypot(dx, dz);
    if (h > ST.reach) {
      dx *= ST.reach / h;
      dz *= ST.reach / h;
    }
    this.target.set(dx, this.aim.y + HEAD_TARGET_Y, dz);
  }

  protected override headGroup(): THREE.Object3D {
    return this.head;
  }

  protected attackHitBox(): HitBox {
    const t = this.target;
    return { cx: t.x, cy: t.y, cz: t.z, w: 0.6, h: 0.6, d: 0.6 };
  }

  /** あたまの中心（root から見た位置）。テストと当たり判定用 */
  headCenter(out: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    out.set(0, HEAD_CENTER, 0);
    this.head.localToWorld(out);
    return this.root.worldToLocal(out);
  }
  /** 首のつけ根（root から見た位置） */
  neckBase(out: THREE.Vector3): THREE.Vector3 {
    return out.set(0, NECK_BASE_Y, 0);
  }

  info(): Record<string, number> {
    const c = this.headCenter(this.tmp);
    return { headX: c.x, headY: c.y, headZ: c.z, headDist: Math.hypot(c.x, c.z), bodyZ: this.body.position.z };
  }

  /**
   * 首を、つけ根から「前へ s・上へ dy」の先（あたまの根もと）まで、まっすぐ等しくのばす。
   * yaw はそちらを向く角度。あたまは立ったまま（顔が前を向く）にする。
   */
  private setNeckVec(s: number, dy: number, yaw: number): void {
    const len = Math.hypot(s, dy);
    const seg = len / NODES;
    const sy = seg / NODE_LEN;
    const pitch = -Math.atan2(s, dy);
    for (let i = 0; i < NODES; i++) {
      const g = this.nodes[i]!;
      g.position.y = i === 0 ? NECK_BASE_Y : seg;
      g.rotation.x = i === 0 ? pitch : 0;
      g.rotation.y = i === 0 ? yaw : 0;
      g.rotation.z = 0;
      this.necks[i]!.scale.y = sy;
      this.necks[i]!.position.y = seg / 2;
    }
    this.head.position.y = seg;
    this.head.rotation.set(-pitch, -yaw, 0);
  }

  protected pose(p: YokaiPoseInput): void {
    const tau = Math.PI * 2;
    this.body.position.y = 0;
    this.sleeveL.rotation.x = 0;
    this.sleeveR.rotation.x = 0;
    if (p.moving) {
      this.body.position.y = 0.03 * Math.abs(Math.sin((Math.PI * p.time) / 0.8));
      const s = 15 * DEG * Math.sin((tau * p.time) / 0.8);
      this.sleeveL.rotation.x = s;
      this.sleeveR.rotation.x = -s;
    }
    if (p.attackT < 0 || this.route.length === 0) this.setBent(false);
    if (p.attackT < 0) {
      this.setScary(false);
      this.setNeckVec(0, NECK_REST, 0);
      for (let i = 0; i < NODES; i++) {
        this.nodes[i]!.rotation.z = 4 * DEG * Math.sin((tau * (p.time - 0.3 * i)) / 2.5);
      }
      this.head.rotation.z = -6 * DEG * Math.sin((tau * p.time) / 2.5);
      return;
    }
    const t = p.attackT;
    // 怖い顔は 0〜1.0 秒（1.0〜1.1 で ふだんの顔にもどす）
    this.setScary(t < 1.05);
    if (this.route.length > 0) {
      this.poseBent(t);
      return;
    }
    const yaw = Math.atan2(-this.target.x, -this.target.z);
    // あたまの根もとの、つけ根からの位置: 前 s・上 dy
    const hx = Math.hypot(this.target.x, this.target.z);
    const fullS = hx;
    const fullDy = this.target.y - HEAD_CENTER - NECK_BASE_Y;
    const backS = -NECK_REST * Math.sin(20 * DEG);
    const backDy = NECK_REST * Math.cos(20 * DEG);
    let s: number;
    let dy: number;
    if (t < 0.3) {
      const k = t / 0.3; // 節 1 を +20°（あたまを後ろに引く）
      s = backS * k;
      dy = NECK_REST + (backDy - NECK_REST) * k;
    } else if (t < 0.5 - 1e-6) {
      const k = (t - 0.3) / 0.2;
      s = backS + (fullS - backS) * k;
      dy = backDy + (fullDy - backDy) * k;
    } else if (t < 1.0) {
      s = fullS;
      dy = fullDy;
    } else {
      const k = Math.min(1, (t - 1.0) / 0.6);
      s = fullS * (1 - k);
      dy = fullDy + (NECK_REST - fullDy) * k;
    }
    this.setNeckVec(s, dy, yaw);
  }

  protected poseDie(p: number): void {
    this.setBent(false);
    // 首がちぢんで あたまが からだにのる
    const sy = 1 - 0.9 * p;
    for (let i = 0; i < NODES; i++) {
      this.nodes[i]!.position.y = i === 0 ? NECK_BASE_Y : NODE_LEN * sy;
      this.nodes[i]!.rotation.x = 0;
      this.nodes[i]!.rotation.y = 0;
      this.necks[i]!.scale.y = sy;
      this.necks[i]!.position.y = (NODE_LEN * sy) / 2;
    }
    this.head.position.y = NODE_LEN * sy;
    this.head.rotation.set(0, 0, 0);
  }
}
