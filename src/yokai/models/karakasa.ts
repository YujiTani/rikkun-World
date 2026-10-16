import * as THREE from 'three';
import { DEG, YokaiBase, boxGeo, makeBlinkRows, makePixelTexture } from '../common';
import type { HitBox, YokaiPoseInput } from '../common';
import { YOKAI_STATS } from '../stats';

const FACE = [
  '................',
  '................',
  '.....WWWWWW.....',
  '....WWWWWWWW....',
  '...WWWWKKWWWW...',
  '...WWWKWKKWWW...',
  '...WWWKKKKWWW...',
  '....WWWKKWWW....',
  '.....WWWWWW.....',
  '................',
  '................',
  '....K......K....',
  '.....KRRRRK.....',
  '......KRRK......',
  '................',
  '................',
];
const FACE_CLOSED = makeBlinkRows(FACE, [2, 3, 4, 5, 6, 7, 8], 5, '.', 'WK');

const ST = YOKAI_STATS.karakasa;
const HOP_SECONDS = 0.6;
const HOP_HEIGHT = 0.5;
/** 1 回の跳ねで進む距離（ブロック。= 1.5 ブロック/秒） */
const HOP_DISTANCE = 0.9;
const STOMP_HEIGHT = 1.8;

/**
 * 見本ページの「段をのぼるコース」（設計書 8 章）。
 * ふつうの跳ね 2 回 → 大ジャンプで高さ 2 の段の上 → 跳んでおりる → ポンと消えてもどる、をくり返す。
 * forward = 出発点から前へ進んだ距離、rise = 地面からの高さ、squash = しゃがみ具合（0〜1）、
 * scale = 消える・出るときの大きさ。
 */
export const COURSE = {
  hops: 2,
  /** 大ジャンプ: しゃがむ 0.2 秒 + 跳ぶ 0.6 秒。前へ 1 ブロック、高さ 2 の段の上へ */
  bigCrouch: 0.2,
  bigAir: 0.6,
  bigForward: 1.0,
  stepHeight: 2.0,
  bigPeak: 2.5,
  downSeconds: 0.6,
  downForward: 1.0,
  resetSeconds: 0.4,
  /** 1 周の長さ（秒） */
  cycle: 0,
  /** 出発点から段の上（大ジャンプの着地点）までの前へ進む距離 */
  toStep: 0,
  /** 1 周で進む距離 */
  total: 0,
};
COURSE.cycle = COURSE.hops * HOP_SECONDS + COURSE.bigCrouch + COURSE.bigAir + COURSE.downSeconds + COURSE.resetSeconds;
COURSE.toStep = COURSE.hops * HOP_DISTANCE + COURSE.bigForward;
COURSE.total = COURSE.toStep + COURSE.downForward;

export interface CourseState {
  forward: number;
  rise: number;
  squash: number;
  scale: number;
  /** 'hop' | 'crouch' | 'big' | 'down' | 'reset' */
  stage: string;
}

export function courseState(moveT: number): CourseState {
  let t = moveT % COURSE.cycle;
  const hopsEnd = COURSE.hops * HOP_SECONDS;
  if (t < hopsEnd) {
    const i = Math.floor(t / HOP_SECONDS);
    const u = (t - i * HOP_SECONDS) / HOP_SECONDS;
    const landing = (u * HOP_SECONDS) > HOP_SECONDS - 0.1 ? 1 : 0;
    return {
      forward: (i + u) * HOP_DISTANCE,
      rise: HOP_HEIGHT * Math.sin(Math.PI * u),
      squash: landing,
      scale: 1,
      stage: 'hop',
    };
  }
  t -= hopsEnd;
  const base = COURSE.hops * HOP_DISTANCE;
  if (t < COURSE.bigCrouch) {
    return { forward: base, rise: 0, squash: t / COURSE.bigCrouch, scale: 1, stage: 'crouch' };
  }
  t -= COURSE.bigCrouch;
  if (t < COURSE.bigAir) {
    const u = t / COURSE.bigAir;
    const k = COURSE.bigPeak - COURSE.stepHeight / 2;
    return {
      forward: base + COURSE.bigForward * u,
      rise: COURSE.stepHeight * u + k * Math.sin(Math.PI * u),
      squash: 0,
      scale: 1,
      stage: 'big',
    };
  }
  t -= COURSE.bigAir;
  if (t < COURSE.downSeconds) {
    const u = t / COURSE.downSeconds;
    return {
      forward: COURSE.toStep + COURSE.downForward * u,
      rise: COURSE.stepHeight * (1 - u) + HOP_HEIGHT * Math.sin(Math.PI * u),
      squash: 0,
      scale: 1,
      stage: 'down',
    };
  }
  t -= COURSE.downSeconds;
  const u = t / COURSE.resetSeconds;
  // 前半でちぢんで消え、出発点にもどって、後半で出てくる
  return {
    forward: u < 0.5 ? COURSE.total : 0,
    rise: 0,
    squash: 0,
    scale: u < 0.5 ? 1 - u * 2 : (u - 0.5) * 2,
    stage: 'reset',
  };
}

/** からかさおばけ（跳ねて ふみつける かさ）。設計書 4 章 */
export class Karakasa extends YokaiBase {
  readonly id = 'karakasa';
  readonly displayName = 'からかさおばけ';
  readonly attackSeconds = ST.attackSeconds;
  readonly hitAt = ST.hitSeconds;
  readonly moveSpeed = ST.speed;
  /** 1 回の跳ねで進む距離（ブロック） */
  readonly hopDistance = HOP_DISTANCE;
  /** true なら「うごく」で見本ページの段のコースを動く（体は動かさず、courseNow を外が読む） */
  course = false;
  courseNow: CourseState = { forward: 0, rise: 0, squash: 0, scale: 1, stage: 'hop' };

  private readonly body = this.group(this.rig);
  private readonly tongue = this.group(this.body, [0, 0.92, -0.56]);
  private readonly legs = this.group(this.body, [0, 0.5, 0]);
  /** 着地の目印（黒い丸影）。世界側に置く（体と一緒に動かない） */
  readonly marker: THREE.Mesh;
  /** ふみつけの着地点（0.2 秒の時点のプレイヤーの足もと、root から見た位置） */
  readonly landing = new THREE.Vector3();
  private landingLatched = false;

  constructor() {
    super();
    const b = this.body;
    const brown = 0x8b4a2b;
    const red = 0xe0503a;
    this.addBox(b, 1.1, 0.5, 1.1, [0, 1.1, 0], this.mat(red), red);
    this.addBox(b, 0.3, 0.1, 0.3, [0, 1.55, 0], this.mat(brown), brown);
    this.addBox(b, 0.7, 0.15, 0.7, [0, 1.425, 0], this.mat(red), red);
    this.addBox(b, 1.5, 0.08, 1.5, [0, 0.84, 0], this.mat(0xf2c14e), 0xf2c14e);
    this.addFace(b, 0.5, [0, 1.1, -0.56], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    this.addBox(b, 0.12, 0.3, 0.12, [0, 0.65, 0], this.mat(0xa0703c), 0xa0703c);
    this.addBox(this.legs, 0.16, 0.4, 0.16, [0, -0.2, 0], this.mat(0xf2c9a0), 0xf2c9a0);
    this.addBox(this.legs, 0.3, 0.1, 0.4, [0, -0.45, -0.03], this.mat(0x6b4226), 0x6b4226);
    this.addBox(this.tongue, 0.14, 0.06, 0.26, [0, 0, -0.13], this.mat(0xff7a9a), 0xff7a9a);
    this.addBox(this.tongue, 0.14, 0.2, 0.06, [0, -0.1, -0.23], this.mat(0xff7a9a), 0xff7a9a);
    this.marker = new THREE.Mesh(
      boxGeo(1.2, 0.02, 1.2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.marker.visible = false;
    this.root.add(this.marker);
    this.finish();
  }

  protected onAttackStart(): void {
    this.landingLatched = false;
  }

  protected override headGroup(): THREE.Object3D {
    return this.body;
  }

  protected attackHitBox(): HitBox {
    return { cx: this.landing.x, cy: 0.5, cz: this.landing.z, w: 1.2, h: 1.0, d: 1.2 };
  }

  info(): Record<string, number> {
    return { bodyY: this.body.position.y, landX: this.landing.x, landZ: this.landing.z, courseForward: this.courseNow.forward };
  }

  protected pose(p: YokaiPoseInput): void {
    const b = this.body;
    const tau = Math.PI * 2;
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    b.scale.set(1, 1, 1);
    this.legs.rotation.x = 0;
    this.marker.visible = false;
    this.tongue.rotation.x = 10 * DEG * Math.sin((tau * p.time) / 1);
    this.tongue.scale.z = 1;

    if (p.attackT >= 0) {
      this.poseStomp(p.attackT);
      return;
    }
    if (p.moving) {
      if (this.course) {
        const c = courseState(p.moveT);
        this.courseNow = c;
        b.position.y = c.rise;
        if (c.squash > 0) {
          const k = c.stage === 'crouch' ? c.squash : 1;
          if (c.stage === 'crouch') b.scale.set(1 + 0.15 * k, 1 - 0.3 * k, 1 + 0.15 * k);
          else b.scale.set(1.1, 0.85, 1.1);
        }
        if (c.stage === 'big' || c.stage === 'down') this.legs.rotation.x = -30 * DEG;
        b.scale.multiplyScalar(Math.max(c.scale, 1e-4));
      } else {
        const u = p.time % HOP_SECONDS;
        b.position.y = HOP_HEIGHT * Math.abs(Math.sin((Math.PI * u) / HOP_SECONDS));
        if (u > HOP_SECONDS - 0.1) b.scale.set(1.1, 0.85, 1.1); // ぺたん
      }
    } else {
      b.rotation.z = 5 * DEG * Math.sin((tau * p.time) / 2);
    }
  }

  /** ふみつけ（合計 1.2 秒）。0〜0.2 合図、0.2〜0.5 跳ぶ、0.5 着地（当たり）、0.5〜1.2 すき */
  private poseStomp(t: number): void {
    const b = this.body;
    if (t >= 0.2 && !this.landingLatched) {
      this.landingLatched = true;
      this.landing.copy(this.aim);
      this.landing.y = 0;
      const d = Math.hypot(this.landing.x, this.landing.z);
      if (d > ST.reach) this.landing.multiplyScalar(ST.reach / d); // 最大 2.5 ブロック先
    }
    const l = this.landing;
    if (t < 0.2) {
      const k = t / 0.2;
      b.scale.set(1 + 0.15 * k, 1 - 0.3 * k, 1 + 0.15 * k); // しゃがむ 0.7
      return;
    }
    this.marker.visible = t < 0.5 - 1e-6;
    this.marker.position.set(l.x, 0.011, l.z);
    if (t < 0.5 - 1e-6) {
      const u = (t - 0.2) / 0.3;
      const k = Math.min(1, (t - 0.2) / 0.05); // しゃがみから すぐ起きる
      b.scale.set(1.15 - 0.15 * k, 0.7 + 0.3 * k, 1.15 - 0.15 * k);
      b.position.set(l.x * u, STOMP_HEIGHT * Math.sin(Math.PI * u), l.z * u);
      this.legs.rotation.x = -30 * DEG;
      return;
    }
    // 着地のあと: ぺたん → 目を回す。最後の 0.2 秒で見本ページの元の場所へすべってもどる
    let off = 1;
    if (t > 1.0) off = Math.max(0, 1 - (t - 1.0) / 0.2);
    b.position.set(l.x * off, 0, l.z * off);
    b.scale.set(1.1, 0.85, 1.1);
    if (t >= 0.6) b.rotation.y = 15 * DEG * Math.sin((Math.PI * 2 * (t - 0.6)) / 0.3);
  }

  protected poseDie(p: number): void {
    this.body.rotation.y = 720 * DEG * p;
    this.body.position.y = 0.3 * p;
  }
}
