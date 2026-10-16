// 動き（idle・walk・run・jump）とコマの えらび方・進み方（仕様 §4.4）。固定ステップ（1/60 秒）ごとに step を呼ぶ。
import type { Vec3 } from '../contracts';

export type SpriteMotion = 'idle' | 'walk' | 'run' | 'jump';

export interface SpriteStepInput {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
  inWater: boolean;
  running: boolean;
  facingDeg: number;
}

export const FRAMES = 8;
const STEPS_PER_SECOND = 60;

/** たつ: 45 ステップに 1 コマ */
export const IDLE_STEPS_PER_FRAME = 45;
export const MOVE_MIN_SPEED = 0.5;
/** あるく: 1 秒に 10 × (v ÷ 4.0) コマ、4〜16 */
export const WALK_FPS = { base: 10, speed: 4.0, min: 4, max: 16 };
/** はしる: 1 秒に 12 × (v ÷ 5.6) コマ、6〜18 */
export const RUN_FPS = { base: 12, speed: 5.6, min: 6, max: 18 };

export const TAKEOFF_STEPS = 3;
export const FALL_STEPS = 4;
export const LAND_MIN_AIR_STEPS = 20;
export const LAND_STEPS_6 = 4;
export const LAND_STEPS_7 = 2;
export const VY_RISE = 3;

const EPS = 1e-6;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** ジャンプの コマ（1〜5）を 空中の上下の速さ vy から決める */
export function jumpFrameForVy(vy: number): number {
  if (vy > VY_RISE) return 2;
  if (vy >= 0) return 3;
  if (vy >= -VY_RISE) return 4;
  return 5;
}

/** 動きとコマの状態。画面の描きかたは知らない */
export class MotionMachine {
  motion: SpriteMotion = 'idle';
  /** 見せるコマ（0〜7） */
  frame = 0;
  private acc = 0;
  private prevGround = true;
  private airSteps = 0;
  private jumped = false;
  private takeoffLeft = 0;
  private landLeft = 0;

  reset(): void {
    this.motion = 'idle';
    this.frame = 0;
    this.acc = 0;
    this.prevGround = true;
    this.airSteps = 0;
    this.jumped = false;
    this.takeoffLeft = 0;
    this.landLeft = 0;
  }

  step(input: SpriteStepInput): void {
    const vy = input.velocity.y;
    const v = Math.hypot(input.velocity.x, input.velocity.z);
    const air = !input.onGround && !input.inWater;

    // みずの中は ジャンプの絵を出さない
    if (input.inWater) {
      this.takeoffLeft = 0;
      this.landLeft = 0;
      this.airSteps = 0;
      this.jumped = false;
      this.prevGround = true;
      this.stepGround(v, input.running);
      return;
    }

    // ふみきり: 地面から 上向きの速さで はなれた
    if (this.prevGround && !input.onGround && vy > 0) {
      this.takeoffLeft = TAKEOFF_STEPS;
      this.jumped = true;
      this.landLeft = 0;
    }

    if (air) {
      this.airSteps++;
    } else {
      // ちゃくち: 空中に 20 ステップ以上いてから 地面についた
      if (!this.prevGround && this.airSteps >= LAND_MIN_AIR_STEPS) {
        this.landLeft = LAND_STEPS_6 + LAND_STEPS_7;
      }
      this.airSteps = 0;
      this.jumped = false;
      this.takeoffLeft = 0;
    }
    this.prevGround = input.onGround;

    if (this.takeoffLeft > 0 && air) {
      this.takeoffLeft--;
      this.setJump(1);
      return;
    }
    if (air && (this.jumped || this.airSteps >= FALL_STEPS)) {
      const f = jumpFrameForVy(vy);
      this.setJump(this.jumped ? f : Math.max(3, f));
      return;
    }
    if (this.landLeft > 0 && !air) {
      const done = LAND_STEPS_6 + LAND_STEPS_7 - this.landLeft;
      this.landLeft--;
      this.setJump(done < LAND_STEPS_6 ? 6 : 7);
      return;
    }
    this.stepGround(v, input.running);
  }

  private setJump(frame: number): void {
    if (this.motion !== 'jump') this.acc = 0;
    this.motion = 'jump';
    this.frame = frame;
  }

  private stepGround(v: number, running: boolean): void {
    const prev = this.motion;
    if (v < MOVE_MIN_SPEED) {
      if (prev !== 'idle') {
        this.acc = 0;
        this.frame = 0;
      }
      this.motion = 'idle';
      this.acc += 1 / IDLE_STEPS_PER_FRAME;
    } else {
      const m: SpriteMotion = running ? 'run' : 'walk';
      // たつ・ジャンプ → 0 番から。歩く ⇔ 走る は 番号を引きつぐ
      if (prev === 'idle' || prev === 'jump') this.acc = 0;
      this.motion = m;
      const p = m === 'run' ? RUN_FPS : WALK_FPS;
      const fps = clamp(p.base * (v / p.speed), p.min, p.max);
      this.acc += fps / STEPS_PER_SECOND;
    }
    this.acc = ((this.acc % FRAMES) + FRAMES) % FRAMES;
    this.frame = Math.floor(this.acc + EPS) % FRAMES;
  }
}
