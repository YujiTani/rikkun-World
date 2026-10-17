// 動き・場面とコマの えらび方・進み方（CHAR-1 §4.4、CHAR-2 §4.1〜§4.4）。固定ステップ（1/60 秒）ごとに step を呼ぶ。
import type { BladePhase, BladeStance, BladeTech, BladeTechFrames, Vec3 } from '../contracts';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { techCell } from '../tools/blade/advance';
import { BOW_RAPID_TICKS, BOW_SHOT_TICKS } from './techCurves';

export type SpriteMotion =
  | 'idle'
  | 'walk'
  | 'run'
  | 'jump'
  | 'bow_shot'
  | 'bow_walk'
  | 'bow_hold_walk'
  | 'bow_rapid'
  | 'katana_thrust'
  | 'katana_kesa'
  | 'katana_kiriage'
  | 'katana_walk_chudan'
  | 'katana_walk_jodan'
  | 'katana_walk_gedan';

export type SpriteScene =
  | 'stand'
  | 'walk'
  | 'run'
  | 'jump'
  | 'kamae'
  | 'kamaeWalk'
  | 'tech'
  | 'bowHold'
  | 'bowHoldWalk'
  | 'bowDraw'
  | 'bowDrawWalk'
  | 'bowRelease';

export interface SpriteStepInput {
  position: Vec3;
  velocity: Vec3;
  onGround: boolean;
  inWater: boolean;
  running: boolean;
  facingDeg: number;
  /** 持っている物（なければ 'none'） */
  weapon: 'none' | 'katana' | 'bow';
  blade: { stance: BladeStance; tech: BladeTech | null; phase: BladePhase; frame: number; lengths: BladeTechFrames | null } | null;
  /** shot = このステップに 矢をうった（arrowShot） */
  bow: { drawing: boolean; drawTicks: number; shot: boolean } | null;
}

/** 場面が 見たい絵（読みこみの 代わりの絵にする前） */
export interface Want {
  motion: SpriteMotion;
  frame: number;
}

const STANCE_TECH: Record<BladeStance, BladeTech> = { chudan: 'thrust', jodan: 'kesa', gedan: 'kiriage' };
const TECH_MOTION: Record<BladeTech, SpriteMotion> = { thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' };
const KAMAE_WALK: Record<BladeStance, SpriteMotion> = {
  chudan: 'katana_walk_chudan',
  jodan: 'katana_walk_jodan',
  gedan: 'katana_walk_gedan',
};
/** 足を動かす場面（コマの番号を 引きつぐ） */
const WALKING_SCENES: ReadonlySet<SpriteScene> = new Set(['walk', 'run', 'kamaeWalk', 'bowHoldWalk', 'bowDrawWalk']);
/** うしろ歩きで 逆の順に進める絵（新しい 5 つだけ） */
const REVERSIBLE: ReadonlySet<SpriteMotion> = new Set([
  'katana_walk_chudan',
  'katana_walk_jodan',
  'katana_walk_gedan',
  'bow_walk',
  'bow_hold_walk',
]);

/** 連射: 前の矢から 引きはじめるまで この ステップ数以内 */
export const RAPID_WINDOW = 21;
/** 引く絵の さいごのコマ */
const SHOT_DRAW_MAX = 7;
const RAPID_DRAW_MAX = 6;
/** はなす絵の はじめのコマ */
const SHOT_RELEASE_FIRST = 8;
const RAPID_RELEASE_FIRST = 7;

const sumTo = (ticks: number[], n: number): number => {
  let c = 0;
  for (let k = 0; k < n; k++) c += ticks[k]!;
  return c;
};
/** 引く絵: c_k ≤ drawTicks < c_(k+1) の k。max より 大きくしない */
function drawCell(ticks: number[], max: number, drawTicks: number): number {
  let k = 0;
  while (k < max && drawTicks >= sumTo(ticks, k + 1)) k++;
  return k;
}
/** はなす絵: うってからの ステップ数 a。おわったら null */
function releaseCell(ticks: number[], first: number, a: number): number | null {
  let c = 0;
  for (let k = first; k < ticks.length; k++) {
    c += ticks[k]!;
    if (a < c) return k;
  }
  return null;
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

/** 弓の場面の 答え（連射のとき 代わりに 使う 通常の弓の答えも 持つ） */
interface BowResult {
  scene: SpriteScene;
  motion: SpriteMotion;
  frame: number;
}

/** 動きとコマの状態。画面の描きかたは知らない */
export class MotionMachine {
  scene: SpriteScene = 'stand';
  motion: SpriteMotion = 'idle';
  /** 見せるコマ */
  frame = 0;
  /** `bow_rapid` が 使えないときの 答え（連射のときだけ。同じ場面の決まりを `bow_shot` で） */
  alt: BowResult | null = null;
  private acc = 0;
  private prevScene: SpriteScene = 'stand';
  private prevGround = true;
  private airSteps = 0;
  private jumped = false;
  private takeoffLeft = 0;
  private landLeft = 0;
  // 弓
  private prevDrawing = false;
  private drawRapid = false;
  private shotRapid = false;
  /** 最後の矢を うったステップからの ステップ数（a）。うっていなければ null */
  private sinceShot: number | null = null;
  /** 最後の引きが 矢をうって おわった（はなす絵を 出せる） */
  private releasePending = false;

  get want(): Want {
    return { motion: this.motion, frame: this.frame };
  }

  reset(): void {
    this.scene = 'stand';
    this.motion = 'idle';
    this.frame = 0;
    this.alt = null;
    this.acc = 0;
    this.prevScene = 'stand';
    this.prevGround = true;
    this.airSteps = 0;
    this.jumped = false;
    this.takeoffLeft = 0;
    this.landLeft = 0;
    this.resetBow();
  }

  private resetBow(): void {
    this.prevDrawing = false;
    this.drawRapid = false;
    this.shotRapid = false;
    this.sinceShot = null;
    this.releasePending = false;
  }

  step(input: SpriteStepInput): void {
    const weapon = input.weapon ?? 'none';
    this.alt = null;
    if (weapon !== 'bow') this.resetBow();
    if (weapon === 'katana') this.stepKatana(input);
    else if (weapon === 'bow') this.stepBow(input);
    else this.stepBare(input);
    this.prevScene = this.scene;
  }

  // ---- 刀 ----
  private stepKatana(input: SpriteStepInput): void {
    this.resetAir(input);
    const b = input.blade;
    const stance: BladeStance = b?.stance ?? 'chudan';
    const v = Math.hypot(input.velocity.x, input.velocity.z);
    const grounded = input.onGround || input.inWater;
    // K1: わざ
    if (b && b.tech && (b.phase === 'startup' || b.phase === 'active' || b.phase === 'recovery')) {
      const t = b.tech;
      this.setStill('tech', TECH_MOTION[t], techCell(W2_SETTING_DEFAULTS.bladeAdvance[t], W2_SETTING_DEFAULTS.bladeTech[t], b.lengths ?? W2_SETTING_DEFAULTS.bladeTech[t], b.frame));
      return;
    }
    // K3: かまえ歩き（K2 空中・K4 立つ は かまえの 1 コマ目）
    if (grounded && v >= MOVE_MIN_SPEED) {
      this.stepWalking('kamaeWalk', KAMAE_WALK[stance], input, v);
      return;
    }
    this.setStill('kamae', TECH_MOTION[STANCE_TECH[stance]], 0);
  }

  // ---- 弓 ----
  private stepBow(input: SpriteStepInput): void {
    this.resetAir(input);
    const bow = input.bow;
    const drawing = !!bow && bow.drawing;
    const v = Math.hypot(input.velocity.x, input.velocity.z);
    const grounded = input.onGround || input.inWater;
    const moving = grounded && v >= MOVE_MIN_SPEED;

    // うったステップからの 数
    if (bow && bow.shot) this.sinceShot = 0;
    else if (this.sinceShot !== null) this.sinceShot = Math.min(this.sinceShot + 1, 100000);

    if (drawing && !this.prevDrawing) {
      // 引きはじめ: 前の矢から 21 ステップ以内なら 連射
      this.drawRapid = this.sinceShot !== null && this.sinceShot <= RAPID_WINDOW;
      this.releasePending = false;
    }
    if (bow && bow.shot) {
      this.shotRapid = this.drawRapid;
      this.releasePending = true;
    }
    this.prevDrawing = drawing;

    const a = this.sinceShot;
    const make = (rapid: boolean): BowResult => {
      if (drawing) {
        if (moving) return { scene: 'bowDrawWalk', motion: 'bow_walk', frame: -1 };
        const t = bow!.drawTicks;
        return rapid
          ? { scene: 'bowDraw', motion: 'bow_rapid', frame: drawCell(BOW_RAPID_TICKS, RAPID_DRAW_MAX, t) }
          : { scene: 'bowDraw', motion: 'bow_shot', frame: drawCell(BOW_SHOT_TICKS, SHOT_DRAW_MAX, t) };
      }
      if (moving) return { scene: 'bowHoldWalk', motion: 'bow_hold_walk', frame: -1 };
      if (this.releasePending && a !== null) {
        const r = this.shotRapid;
        const k = r ? releaseCell(BOW_RAPID_TICKS, RAPID_RELEASE_FIRST, a) : releaseCell(BOW_SHOT_TICKS, SHOT_RELEASE_FIRST, a);
        if (k !== null) return { scene: 'bowRelease', motion: r ? 'bow_rapid' : 'bow_shot', frame: k };
      }
      return { scene: 'bowHold', motion: 'bow_shot', frame: 0 };
    };
    const main = make(drawing ? this.drawRapid : this.shotRapid);
    if (main.frame < 0) {
      this.stepWalking(main.scene, main.motion, input, v);
      return;
    }
    this.setStill(main.scene, main.motion, main.frame);
    if (main.motion === 'bow_rapid') this.alt = make(false);
  }

  /** 空中・水のしらべは 刀・弓のあいだは 使わない（ジャンプの絵を 出さない）。ただし 記録は そろえる */
  private resetAir(input: SpriteStepInput): void {
    this.prevGround = input.onGround;
    this.airSteps = 0;
    this.jumped = false;
    this.takeoffLeft = 0;
    this.landLeft = 0;
  }

  /** 足を動かさない場面: 番号は わざ・弓の決まり。足の番号は 0 にもどる */
  private setStill(scene: SpriteScene, motion: SpriteMotion, frame: number): void {
    this.scene = scene;
    this.motion = motion;
    this.frame = frame;
    this.acc = 0;
  }

  /** 足を動かす場面（歩く・走る・かまえ歩き・弓の歩き）: 8 コマで回る。うしろ歩きの絵は 逆順 */
  private stepWalking(scene: SpriteScene, motion: SpriteMotion, input: SpriteStepInput, v: number): void {
    if (!WALKING_SCENES.has(this.prevScene)) this.acc = 0;
    this.scene = scene;
    this.motion = motion;
    const run = input.running;
    const p = run ? RUN_FPS : WALK_FPS;
    const fps = clamp(p.base * (v / p.speed), p.min, p.max);
    // 引きながら歩く 2.0 は 5 コマ/秒、引きながら走る 2.8 は 6 コマ/秒（同じ式。下限・上限は 4〜18 の中）
    const back = REVERSIBLE.has(motion) && movingBackward(input);
    this.acc += (back ? -fps : fps) / STEPS_PER_SECOND;
    this.acc = ((this.acc % FRAMES) + FRAMES) % FRAMES;
    this.frame = Math.floor(this.acc + EPS) % FRAMES;
  }

  // ---- 刀も弓も 持たない（CHAR-1 のまま） ----
  private stepBare(input: SpriteStepInput): void {
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
      this.stepGround(v, input);
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
    this.stepGround(v, input);
  }

  private setJump(frame: number): void {
    if (this.scene !== 'jump') this.acc = 0;
    this.scene = 'jump';
    this.motion = 'jump';
    this.frame = frame;
  }

  private stepGround(v: number, input: SpriteStepInput): void {
    if (v < MOVE_MIN_SPEED) {
      if (this.prevScene !== 'stand') {
        this.acc = 0;
        this.frame = 0;
      }
      this.scene = 'stand';
      this.motion = 'idle';
      this.acc += 1 / IDLE_STEPS_PER_FRAME;
      this.acc = ((this.acc % FRAMES) + FRAMES) % FRAMES;
      this.frame = Math.floor(this.acc + EPS) % FRAMES;
    } else {
      // たつ・ジャンプ・わざ → 0 番から。歩く ⇔ 走る は 番号を引きつぐ
      this.stepWalking(input.running ? 'run' : 'walk', input.running ? 'run' : 'walk', input, v);
    }
  }
}

/** 水平の速さの向きと キャラの向き（facing）の角が 90 度より大きい（うしろへ動いている） */
export function movingBackward(input: SpriteStepInput): boolean {
  const vx = input.velocity.x;
  const vz = input.velocity.z;
  if (Math.hypot(vx, vz) < 1e-9) return false;
  const heading = (Math.atan2(vx, -vz) * 180) / Math.PI;
  const d = Math.abs((((heading - input.facingDeg) % 360) + 540) % 360 - 180);
  return d > 90 + 1e-6;
}
