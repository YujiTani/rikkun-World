import * as THREE from 'three';
import { DEG, YokaiBase, makeBlinkRows, makePixelTexture } from '../common';
import type { HitBox, YokaiPoseInput } from '../common';
import { YOKAI_STATS } from '../stats';

/**
 * タコはちまき（しかくい 頭に 白い はちまき・とがった 口・こい赤・太い 8 本足）。
 * 試作 D（/mnt/project-files/octopus/look/src/octoD.ts・octo.ts の C）を そのまま 箱に うつした もの。
 * 動きは AI（ai/swim.ts）が `drive()` で 渡す「およぎの 段階・ため・ぺちん」で 決まる（時計は 固定ステップの 積み）。
 * 地面の 影は 水の 中なので 置かない。
 */
const FACE = [
  '................',
  '................',
  '..KKKK....KKKK..',
  '................',
  '..WWWW....WWWW..',
  '..WKKW....WKKW..',
  '..WKKW....WKKW..',
  '..WWWW....WWWW..',
  '................',
  'PPP..........PPP',
  'PPP..........PPP',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const FACE_CLOSED = makeBlinkRows(FACE, [4, 5, 6, 7], 6, '.', 'WK');

const ST = YOKAI_STATS.tako_hachimaki;
const TAU = Math.PI * 2;

/** 色（試作 C。値の 出どころは この 1 か所。色ちがいの 表は content/yokai/tako_hachimaki.ts） */
const BODY = 0xcf3b3b;
const TIP = 0xf6b39a;
const DARK = 0x9e2a33;
const BAND = 0xf3efe2;
const MOUTH_IN = 0x5a1a22;

/** 動きの 数（試作 D の 表。秒・回/秒） */
const MOTION = {
  spinRps: 1.2, // 回る 速さ（回/秒）
  spinUp: 0.25, // 回りはじめ（秒）
  spinDecay: 1.2, // とまってから 回転が 落ちる 速さ
  spinEnd: 2.5, // とまってから ここから 回転が 0 に 向かう（秒）
  spinEndLen: 1.5, // 回転が 0 に なるまで（秒）
  inkRecoil: 0.18, // すみを はいた とき 下がる（ブロック）
  slapSeconds: 0.4, // ぺちんの 動き（秒）
  bodyLift: 0.3, // 足が たれても 足もとの 下に 出ない ための 持ち上げ（ブロック）
} as const;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (v: number): number => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** およぎの 段階（AI が 毎ステップ 渡す） */
export interface TakoDrive {
  /** go = はやく すすむ / rest = とまる */
  phase: 'go' | 'rest';
  /** その 段階に 入ってからの 秒 */
  phaseT: number;
  /** 向きの かたむけ（進む 勢い 0〜1。見た目だけ） */
  lean: number;
}

export class TakoHachimaki extends YokaiBase {
  readonly id = 'tako_hachimaki';
  readonly displayName = 'タコはちまき';
  readonly attackSeconds = ST.attackSeconds;
  readonly hitAt = ST.hitSeconds;
  readonly moveSpeed = ST.speed;

  /** AI から もらう およぎの 段階 */
  readonly driveState: TakoDrive = { phase: 'rest', phaseT: 0, lean: 0 };
  /** すみの ため 0〜1（0 = しない）。1 に なった 所で はく */
  inkCharge = 0;
  /** すみを はいてからの 秒（< 0 = 反動なし） */
  inkAge = -1;
  /** ぺちんの 動きの 秒（< 0 = しない） */
  slapT = -1;

  private readonly body = this.group(this.rig);
  private readonly head = this.group(this.body);
  private readonly rotor = this.group(this.body);
  private readonly mouth = this.group(this.head, [0, 0.7, -0.45]);
  private readonly legs: THREE.Group[][] = [];
  private rotorAngle = 0;

  constructor() {
    super();
    const h = this.head;
    const body = this.mat(BODY);
    this.addBox(h, 1.0, 0.86, 0.9, [0, 0.98, 0], body, BODY);
    this.addBox(h, 1.06, 0.16, 0.96, [0, 1.24, 0], this.mat(BAND), BAND);
    this.addBox(h, 0.22, 0.2, 0.14, [0.18, 1.26, 0.52], this.mat(BAND), BAND);
    this.addBox(h, 0.1, 0.3, 0.06, [0.3, 1.1, 0.53], this.mat(BAND), BAND).rotation.z = 0.5;
    this.addFace(h, 0.56, [0, 0.88, -0.455], makePixelTexture(FACE), makePixelTexture(FACE_CLOSED));
    this.addBox(this.mouth, 0.26, 0.24, 0.32, [0, 0, -0.15], this.mat(TIP), TIP);
    this.addBox(this.mouth, 0.13, 0.12, 0.02, [0, 0, -0.315], this.mat(MOUTH_IN), MOUTH_IN);
    this.addBox(h, 0.84, 0.18, 0.8, [0, 0.47, 0], this.mat(DARK), DARK);
    // 足 8 本（2 節）。先は 1 本おきに 白／うすいピンク（回っているのが 見える）
    const lens = [0.4, 0.32];
    const thick = [0.2, 0.15];
    for (let i = 0; i < 8; i++) {
      const yaw = (i + 0.5) * (TAU / 8);
      const pivot = this.group(this.rotor, [Math.sin(yaw) * 0.34, 0.44, Math.cos(yaw) * 0.34]);
      pivot.rotation.y = yaw;
      const segs: THREE.Group[] = [];
      let parent: THREE.Object3D = pivot;
      const colors = [BODY, i % 2 ? TIP : BAND];
      lens.forEach((len, k) => {
        const g = this.group(parent, [0, k === 0 ? 0 : -lens[k - 1]!, 0]);
        this.addBox(g, thick[k]!, len, thick[k]!, [0, -len / 2, 0], this.mat(colors[k]!), colors[k]!);
        segs.push(g);
        parent = g;
      });
      this.legs.push(segs);
    }
    this.finish();
  }

  /** AI から およぎの 段階を 受けとる */
  drive(phase: 'go' | 'rest', phaseT: number, lean = 0): void {
    this.driveState.phase = phase;
    this.driveState.phaseT = phaseT;
    this.driveState.lean = lean;
  }

  /** 回る 速さ（回/秒）。go は すぐ 速く、rest は だんだん 落ちる */
  private spinSpeed(): number {
    const { phase, phaseT } = this.driveState;
    if (phase === 'go') return MOTION.spinRps * smooth(phaseT / MOTION.spinUp);
    return MOTION.spinRps * Math.exp(-phaseT * MOTION.spinDecay) * (1 - smooth((phaseT - MOTION.spinEnd) / MOTION.spinEndLen));
  }

  override update(dt: number): void {
    this.rotorAngle += TAU * this.spinSpeed() * dt;
    if (this.inkAge >= 0) this.inkAge += dt;
    if (this.slapT >= 0) {
      this.slapT += dt;
      if (this.slapT >= MOTION.slapSeconds) this.slapT = -1;
    }
    super.update(dt);
  }

  protected override headGroup(): THREE.Object3D {
    return this.head;
  }

  protected attackHitBox(): HitBox {
    return { cx: 0, cy: 0.9, cz: -0.6, w: 1, h: 1, d: 1 };
  }

  info(): Record<string, number> {
    return { spin: this.spinSpeed(), rotor: this.rotorAngle, bodyY: this.body.position.y };
  }

  protected pose(p: YokaiPoseInput): void {
    const spin = this.spinSpeed() / MOTION.spinRps; // 0〜1
    const { phase, phaseT, lean } = this.driveState;
    const c = smooth(this.inkCharge);
    let y = MOTION.bodyLift;
    let tilt = 0;
    if (phase === 'go') {
      tilt = -0.3 * lean; // 進む 方へ 少し かたむく
      y += 0.15 * lean;
    } else {
      // とまった ゆりもどし ＋ ふわふわ（1 周 2 秒）
      tilt = 0.12 * Math.exp(-phaseT * 3) * Math.sin(phaseT * 8);
      y += 0.08 * Math.sin((TAU * p.time) / 2) - 0.1 * (1 - spin);
    }
    let puff = 1 + 0.35 * c; // 口の ふくらみ
    let sxz = 1 + 0.1 * c;
    let back = 0;
    if (this.inkAge >= 0) {
      puff = lerp(1.5, 1, smooth(this.inkAge / 0.5));
      sxz = lerp(0.95, 1, smooth(this.inkAge / 0.3));
      back = MOTION.inkRecoil * Math.exp(-this.inkAge * 2.5) * Math.min(1, this.inkAge / 0.06);
    }
    let slapOpen = 0;
    if (this.slapT >= 0) {
      const u = this.slapT / MOTION.slapSeconds;
      slapOpen = Math.sin(Math.PI * u);
      back -= 0.2 * slapOpen; // ぺちんで 少し 前へ
    }
    this.body.position.set(0, y, back);
    this.body.rotation.set(0, 0, tilt);
    this.body.scale.set(sxz, 1, sxz);
    this.mouth.scale.set(puff, puff, 1 + (puff - 1) * 0.6);
    this.rotor.rotation.y = this.rotorAngle;
    const open = Math.max(spin, slapOpen);
    this.legs.forEach((segs, i) => {
      const sway = 0.08 * Math.sin((TAU * p.time) / 2 + i);
      segs[0]!.rotation.x = -(lerp(0.12, 1.35, open) + sway * (1 - open));
      segs[1]!.rotation.x = -(lerp(0.05, -0.15, open) + sway);
    });
  }

  protected poseDie(p: number): void {
    this.body.position.y = MOTION.bodyLift + 0.5 * p;
    this.body.rotation.z = 90 * DEG * p;
  }
}
