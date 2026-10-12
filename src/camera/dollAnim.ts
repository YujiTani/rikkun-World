import {
  ANIM_TICK_SECONDS,
  ARM_ANIM_DEFS,
  BODY_ANIM_PRIORITY,
  BODY_ANIM_TICKS,
  DOLL_ANIM,
} from './config';

/** 人形の動きの状態機械（docs/design/M4-craft.md §2.9）。three.js は使わない（テストしやすいように）。 */

export type ArmAnim = 'none' | keyof typeof ARM_ANIM_DEFS;
export type BodyAnim = keyof typeof BODY_ANIM_PRIORITY;

/** ふつうの武器の動き（けっか パンチで打ち切らない） */
const WEAPON_ANIMS: readonly ArmAnim[] = ['slash', 'thrust', 'sweep', 'draw', 'release'];

export interface ArmPose {
  /** 右うで・左うでの角度（度。三人称の向き: x は前が正、z は外むきが正）。w = 今のかまえとの混ぜ具合 0〜1 */
  rx: number;
  rz: number;
  rw: number;
  lx: number;
  lz: number;
  lw: number;
  /** 足していく角度（パンチ・ほる・置く。度、前が正） */
  addR: number;
  /** からだのひねり（度） */
  twist: number;
  /** からだのはね（上が正） */
  hop: number;
}

export interface BodyPose {
  /** からだ（あたま・うでふくむ）の上下 */
  upperY: number;
  /** うしろへたおれる角度（度） */
  tilt: number;
  /** あたまのふり（度） */
  headYaw: number;
  /** ひざをまげるかっこう（度。左右逆に足す） */
  legBend: number;
  /** 両うでを上げる角度（度。うでが何もしていないとき） */
  armLift: number;
  /** 一人称で手が下がる（度） */
  firstDrop: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeInOut = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
/** 少しいきすぎて もどる（終わりは 1） */
const easeOutBack = (t: number) => {
  const u = clamp01(t) - 1;
  const c1 = 1.4;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
};

export function newArmPose(): ArmPose {
  return { rx: 0, rz: 0, rw: 0, lx: 0, lz: 0, lw: 0, addR: 0, twist: 0, hop: 0 };
}
export function newBodyPose(): BodyPose {
  return { upperY: 0, tilt: 0, headYaw: 0, legBend: 0, armLift: 0, firstDrop: 0 };
}

/** その動きの tick ステップ目（1〜長さ）のうでの形。out に書く */
export function armPoseAt(anim: ArmAnim, tick: number, out: ArmPose): ArmPose {
  Object.assign(out, newArmPose());
  if (anim === 'none') return out;
  const len = ARM_ANIM_DEFS[anim].ticks;
  const blend = clamp01(tick / DOLL_ANIM.blendInTicks);
  switch (anim) {
    case 'punch':
      out.addR = 75 * Math.sin((Math.PI * tick) / len);
      return out;
    case 'dig':
    case 'place':
      out.addR = 40 * Math.sin((Math.PI * tick) / len);
      return out;
    case 'slash': {
      // 1〜20 ふりかぶる、21〜30 右から左へ切る（30 で当たり）
      if (tick <= 20) {
        const p = easeInOut(tick / 20);
        out.rx = lerp(60, 150, p);
        out.rz = lerp(0, 45, p);
        out.twist = -15 * p;
      } else {
        const e = easeOutBack((tick - 20) / 10);
        out.rx = lerp(150, 85, e);
        out.rz = lerp(45, -45, e);
        out.twist = lerp(-15, 25, e);
      }
      out.rw = blend;
      return out;
    }
    case 'thrust': {
      // 1〜28 うしろへ引く、29〜40 前へまっすぐ つく（40 で当たり）
      let rx: number;
      if (tick <= 28) {
        const p = easeInOut(tick / 28);
        rx = lerp(80, 30, p);
        out.rz = lerp(0, 15, p);
        out.twist = -15 * p;
      } else {
        const e = easeOutBack((tick - 28) / 12);
        rx = lerp(30, 95, e);
        out.rz = lerp(15, 0, e);
        out.twist = lerp(-15, 10, e);
      }
      out.rx = rx;
      out.lx = rx * 0.9 + 8;
      out.lz = 8;
      out.rw = out.lw = blend;
      return out;
    }
    case 'sweep': {
      // 1〜28 右へ大きくかまえる、29〜40 大きく左へはらう
      if (tick <= 28) {
        const p = easeInOut(tick / 28);
        out.rz = lerp(0, 75, p);
        out.twist = -30 * p;
      } else {
        const e = easeOutBack((tick - 28) / 12);
        out.rz = lerp(75, -65, e);
        out.twist = lerp(-30, 35, e);
      }
      out.rx = 90;
      out.lx = 80;
      out.lz = 5;
      out.rw = out.lw = blend;
      return out;
    }
    case 'draw': {
      // 左手で ゆみ を前に、右手で つる を引く
      const q = tick / len;
      out.lx = lerp(0, 90, clamp01(tick / 4));
      out.rx = lerp(90, 70, q);
      out.rz = lerp(0, 25, q);
      out.rw = out.lw = blend;
      return out;
    }
    case 'release': {
      // 右手がうしろへはねる。左手は ゆみ を持ったまま
      out.lx = 90;
      out.rx = 70;
      out.rz = 25 + 30 * Math.sin(Math.PI * clamp01(tick / 6));
      out.rw = out.lw = 1;
      return out;
    }
    case 'banzai': {
      const p = tick < 8 ? easeInOut(tick / 8) : tick > len - 8 ? 1 - easeInOut((tick - (len - 8)) / 8) : 1;
      out.rx = out.lx = lerp(0, 165, p);
      out.rz = out.lz = lerp(0, 20, p);
      out.rw = out.lw = 1;
      out.hop = DOLL_ANIM.banzaiHop * Math.sin(Math.PI * clamp01(tick / 16));
      return out;
    }
    case 'cheer': {
      const p = tick < 6 ? easeInOut(tick / 6) : tick > len - 4 ? 1 - easeInOut((tick - (len - 4)) / 4) : 1;
      out.rx = 165 * p;
      out.rz = 15 + 12 * Math.sin(tick * 0.9) * p;
      out.rw = 1;
      return out;
    }
    case 'pickup': {
      const p = Math.sin((Math.PI * tick) / len);
      out.rx = out.lx = 70 * p;
      out.rz = out.lz = -35 * p;
      out.rw = out.lw = 1;
      return out;
    }
    case 'equip': {
      const p = Math.sin((Math.PI * tick) / len);
      out.rx = out.lx = 10 * p;
      out.rz = out.lz = 45 * p;
      out.rw = out.lw = 1;
      return out;
    }
  }
}

export interface AnimInput {
  moving: boolean;
  onGround: boolean;
}

/** 白い弧（切ったとき） */
export type ArcKind = 'none' | 'slash' | 'sweep';

export class DollAnimator {
  armAnim: ArmAnim = 'none';
  /** うでの層の何ステップ目か（始まった直後は 0。1 ステップ進むと 1） */
  animTick = 0;
  /** 打ち切られたり終わったあと、元のかまえへもどしているあいだ */
  private recoverLeft = 0;
  private readonly recoverPose = newArmPose();
  private readonly tmpPose = newArmPose();
  private digging = false;

  private timedBody: 'none' | 'land' | 'hurt' = 'none';
  private timedTick = 0;
  private fallen = 0;
  private wasOnGround = true;
  private jumpTick = 0;
  private globalTick = 0;
  private acc = 0;
  private walking = false;
  private airborne = false;

  arc: ArcKind = 'none';
  arcAge = 0;

  get bodyAnim(): BodyAnim {
    if (this.fallen > 0) return 'down';
    if (this.timedBody === 'hurt') return 'hurt';
    if (this.timedBody === 'land') return 'land';
    if (this.airborne) return 'jump';
    return this.walking ? 'walk' : 'idle';
  }
  get bodyTick(): number {
    return this.timedBody === 'none' ? this.jumpTick : this.timedTick;
  }

  /** うでの動きを始める。打ち切れない（優先が低い）ときは false */
  startArm(anim: Exclude<ArmAnim, 'none'>): boolean {
    const def = ARM_ANIM_DEFS[anim];
    if (this.armAnim !== 'none') {
      const cur = ARM_ANIM_DEFS[this.armAnim];
      if (def.priority < cur.priority) return false;
      // 武器の動きの出た直後に、同じ瞬間の パンチ の合図が重なっても武器の動きを残す
      if (anim === 'punch' && WEAPON_ANIMS.includes(this.armAnim) && this.animTick <= 1) return false;
    }
    if (this.armAnim !== 'none') this.captureRecover();
    this.armAnim = anim;
    this.animTick = 0;
    if (anim === 'slash' || anim === 'sweep') this.arc = 'none';
    return true;
  }

  /** からだの層に時間で終わる動きを足す（ダメージ） */
  startHurt(): void {
    if (this.fallen > 0) return;
    this.timedBody = 'hurt';
    this.timedTick = 0;
  }

  setDigging(on: boolean): void {
    this.digging = on;
  }
  setFallen(k: number): void {
    this.fallen = Math.max(0, Math.min(1, k));
  }
  get fallenAmount(): number {
    return this.fallen;
  }
  get tickCount(): number {
    return this.globalTick;
  }

  private captureRecover(): void {
    if (this.armAnim === 'none') return;
    armPoseAt(this.armAnim, Math.max(1, this.animTick), this.recoverPose);
    this.recoverLeft = DOLL_ANIM.recoverTicks;
  }

  /** 時間（秒）を進める。固定ステップ 1/60 秒ごとに 1 ステップ */
  advance(dt: number, input: AnimInput): void {
    this.acc += dt;
    const step = ANIM_TICK_SECONDS;
    // dt が 0 のとき（初期化）はなにも進めない
    while (this.acc >= step - 1e-9) {
      this.acc -= step;
      this.stepOnce(input);
    }
    if (this.acc < 0) this.acc = 0;
  }

  /** 1 ステップ進める */
  stepOnce(input: AnimInput): void {
    this.globalTick++;
    // うでの層
    if (this.recoverLeft > 0) this.recoverLeft--;
    if (this.armAnim !== 'none') {
      this.animTick++;
      if (this.armAnim === 'slash' && this.animTick === 21) {
        this.arc = 'slash';
        this.arcAge = 0;
      } else if (this.armAnim === 'sweep' && this.animTick === 29) {
        this.arc = 'sweep';
        this.arcAge = 0;
      }
      if (this.animTick > ARM_ANIM_DEFS[this.armAnim].ticks) {
        this.captureRecoverFromEnd();
        this.armAnim = 'none';
        this.animTick = 0;
      }
    }
    if (this.arc !== 'none') {
      this.arcAge++;
      if (this.arcAge > DOLL_ANIM.arcTicks) this.arc = 'none';
    }
    if (this.armAnim === 'none' && this.digging) this.startArm('dig');

    // からだの層
    this.walking = input.moving;
    this.airborne = !input.onGround;
    if (this.fallen > 0) {
      this.timedBody = 'none';
    } else if (this.timedBody !== 'none') {
      this.timedTick++;
      if (this.timedTick > BODY_ANIM_TICKS[this.timedBody]) this.timedBody = 'none';
    }
    if (!this.wasOnGround && input.onGround && this.fallen === 0) {
      // 着地。ダメージ中は ダメージが先
      if (this.timedBody !== 'hurt') {
        this.timedBody = 'land';
        this.timedTick = 0;
        this.timedTick++;
      }
    }
    if (this.airborne) this.jumpTick++;
    else this.jumpTick = 0;
    this.wasOnGround = input.onGround;
  }

  private captureRecoverFromEnd(): void {
    armPoseAt(this.armAnim, ARM_ANIM_DEFS[this.armAnim as Exclude<ArmAnim, 'none'>].ticks, this.recoverPose);
    this.recoverLeft = DOLL_ANIM.recoverTicks;
  }

  /** うでの形。動いていなくても もどり中は少し残る。weight は 0〜1 */
  armPose(out: ArmPose): ArmPose {
    if (this.armAnim !== 'none') {
      return armPoseAt(this.armAnim, Math.max(1, this.animTick), out);
    }
    if (this.recoverLeft > 0) {
      const k = this.recoverLeft / DOLL_ANIM.recoverTicks;
      Object.assign(out, this.recoverPose);
      out.rw *= k;
      out.lw *= k;
      out.addR *= k;
      out.twist *= k;
      out.hop = 0;
      return out;
    }
    return Object.assign(out, newArmPose());
  }

  /** うでの形（ひねり・はね も含めた今の値）。再利用のため tmp を使う */
  currentArmPose(): ArmPose {
    return this.armPose(this.tmpPose);
  }

  bodyPose(out: BodyPose): BodyPose {
    Object.assign(out, newBodyPose());
    const c = DOLL_ANIM;
    switch (this.bodyAnim) {
      case 'idle':
        out.upperY = c.idleBreathHeight * Math.sin((2 * Math.PI * this.globalTick) / c.idleBreathTicks);
        break;
      case 'walk':
        break;
      case 'jump': {
        const t = this.jumpTick;
        out.upperY = t <= 3 ? -c.jumpCrouch * Math.sin((Math.PI * t) / 6) : 0;
        out.legBend = c.jumpLegDeg * easeInOut(t / 6);
        out.armLift = c.jumpArmLiftDeg * easeInOut(t / 6);
        break;
      }
      case 'land': {
        const s = Math.sin((Math.PI * this.timedTick) / BODY_ANIM_TICKS.land);
        out.upperY = -c.landDip * s;
        out.legBend = c.jumpLegDeg * s;
        break;
      }
      case 'hurt': {
        const s = Math.sin((Math.PI * this.timedTick) / BODY_ANIM_TICKS.hurt);
        out.tilt = c.hurtTiltDeg * s;
        out.headYaw = c.hurtHeadDeg * Math.sin((3 * Math.PI * this.timedTick) / BODY_ANIM_TICKS.hurt);
        out.firstDrop = c.hurtFirstPersonDropDeg * s;
        break;
      }
      case 'down':
        out.upperY = 0;
        break;
    }
    return out;
  }
}
