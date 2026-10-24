/**
 * #293 試作: 攻撃 2「両手で 払う」の 動き（yuzu の 絵コンテ attacks/2-sweep-storyboard.jpg）。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ① windup / hold : 左手を 頭の 上・後ろへ ゆっくり 振りかぶる。体は 左へ ひねる（予兆）。
 *  ② sweepL        : 左手を のばして 地面すれすれを 左うしろ → 前 → 右へ 薙ぎ払う。体は 反動で 右へ ぐるっと ひねる。
 *  ③ link          : 反動の まま 右手が 後ろへ まわる（左手は 休みの 位置へ）。
 *  ④ sweepR        : 右手を のばして 右うしろ → 前 → 左へ 薙ぎ払う。2 回で 体の まわり ぜんぶ。
 *  ⑤ recover       : 手を ついた まま 待つ（呼ぶ 側が 休みの 姿勢へ なめらかに もどす）→ done。
 * 腕は StepCrawler の 2 本の 骨の IK（poseBoth）。座標は からだの 座標（もとの 座標。+x = 左、+y = 上、+z = 前）。数は gashaBigTuning.ts の sweep。
 */
import { Vector3 } from 'three';
import type { BigModel } from './gashaBig';
import type { Side, StepCrawler } from './gashaBigStep';
import { TUNE as T } from './gashaBigTuning';

export type SweepPhase = 'idle' | 'windup' | 'hold' | 'sweepL' | 'link' | 'sweepR' | 'recover' | 'done';
export interface SweepEvent {
  /** この コマで 予兆（振りかぶり）が はじまった */
  warn?: boolean;
  /** この コマで 払いが はじまった / おわった */
  strokeStart?: Side;
  strokeEnd?: Side;
}

const DEG = Math.PI / 180;
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const smooth = (u: number) => u * u * (3 - 2 * u);
/** そっと はじまり、中ほどが 速く、おわりに 少し おそい */
const swing = (u: number) => { const a = Math.pow(u, 1.6); return a / (a + Math.pow(1 - u, 1.2)); };
const lift = (u: number) => 1 - Math.pow(1 - u, 3) * (1 + 3 * u);

export class Sweep {
  phase: SweepPhase = 'idle';
  t = 0;
  private pendingWarn = false;
  private readonly rest: BigModel['rest'];
  private readonly L = new Vector3();
  private readonly R = new Vector3();

  constructor(private readonly step: StepCrawler, model: BigModel) { this.rest = model.rest; }

  get done(): boolean { return this.phase === 'done'; }
  /** いま 払っている 腕（払って いなければ null） */
  get active(): Side | null { return this.phase === 'sweepL' ? 'Left' : this.phase === 'sweepR' ? 'Right' : null; }

  private sec(p: SweepPhase): number {
    const K = T.sweep;
    return Math.max(1e-3, p === 'windup' ? K.windupSec : p === 'hold' ? K.holdSec : p === 'sweepL' || p === 'sweepR' ? K.sweepSec : p === 'link' ? K.linkSec : p === 'recover' ? K.recoverSec : 0);
  }

  start(): void {
    this.step.reset();
    this.phase = 'windup'; this.t = 0; this.pendingWarn = true;
    this.solve();
  }

  update(dt: number): SweepEvent {
    const ev: SweepEvent = {};
    if (this.phase === 'idle' || this.phase === 'done') return ev;
    if (this.pendingWarn) { ev.warn = true; this.pendingWarn = false; }
    this.t += dt;
    const len = this.sec(this.phase);
    if (this.t >= len) {
      const over = this.t - len, prev = this.phase;
      const next: SweepPhase = prev === 'windup' ? 'hold' : prev === 'hold' ? 'sweepL' : prev === 'sweepL' ? 'link' : prev === 'link' ? 'sweepR' : prev === 'sweepR' ? 'recover' : 'done';
      this.phase = next;
      this.t = next === 'done' ? 0 : Math.min(over, this.sec(next) * 0.999);
      if (prev === 'hold') ev.strokeStart = 'Left';
      if (prev === 'sweepL') ev.strokeEnd = 'Left';
      if (prev === 'link') ev.strokeStart = 'Right';
      if (prev === 'sweepR') ev.strokeEnd = 'Right';
    }
    this.solve();
    return ev;
  }

  /** 払う まるの 上の 点（角度 deg、半径 r、高さ y。0 = 前、+ = 左） */
  private polar(deg: number, r: number, y: number, out: Vector3): Vector3 {
    const K = T.sweep, a = deg * DEG;
    return out.set(Math.sin(a) * r, y, K.centerZ + Math.cos(a) * r);
  }

  private solve(): void {
    const K = T.sweep, st = this.step;
    const r0 = this.rest, tw = K.twistDeg * DEG, fwd = K.leanDeg * DEG;
    const raiseL = new Vector3(K.raise[0], K.raise[1], K.raise[2]);
    const raiseR = new Vector3(-K.raise[0], K.raise[1], K.raise[2]);
    const reach = st.reach * K.reachFrac;
    const gy = K.wristY;
    const u = clamp01(this.t / this.sec(this.phase));
    const tmp = new Vector3(), a = new Vector3(), b = new Vector3();
    let twist = 0, lean = 0, plantL = 1, plantR = 1;
    this.L.copy(r0.LeftHand); this.R.copy(r0.RightHand);
    // 腕の 届く 範囲に おさめる（肩から reach）
    const R = K.radius;
    if (this.phase === 'windup') {
      const e = lift(u);
      this.L.copy(r0.LeftHand).lerp(raiseL, e); this.L.x += 6 * Math.sin(Math.PI * e); this.L.y += 3 * Math.sin(Math.PI * e);
      twist = tw * e; lean = -4 * DEG * e; plantL = 1 - smooth(clamp01(u / 0.12));
    } else if (this.phase === 'hold') {
      this.L.copy(raiseL); this.L.y += 0.8 * smooth(u);
      twist = tw; lean = -4 * DEG; plantL = 0;
    } else if (this.phase === 'sweepL' || this.phase === 'sweepR') {
      const left = this.phase === 'sweepL';
      const e = swing(u), blend = smooth(clamp01(u / 0.25));
      const sg = left ? 1 : -1;
      const deg = sg * (K.startDeg + (K.endDeg - K.startDeg) * e);
      const raise = left ? raiseL : raiseR;
      const hand = tmp.copy(raise).lerp(this.polar(deg, R, gy, a), left ? blend : 1);
      if (!left) hand.copy(this.polar(deg, R, gy, a)); // 右手は 反動の まま すぐ 地面すれすれ
      const side: Vector3 = left ? this.L : this.R;
      side.copy(hand);
      const restH = left ? this.R : this.L;
      restH.copy(left ? r0.RightHand : r0.LeftHand);
      twist = sg * (tw - 2 * tw * smooth(u)); lean = fwd * smooth(clamp01(u / 0.3));
      if (left) plantL = blend; else plantR = 1;
    } else if (this.phase === 'link') {
      const e = smooth(u);
      this.polar(K.endDeg, R, gy, a); // 左手の おわりの 場所
      this.L.copy(a).lerp(r0.LeftHand, e);
      this.polar(-K.startDeg, R * 0.9, gy, b);
      this.R.copy(r0.RightHand).lerp(b, e);
      twist = -tw * (1 + 0.15 * Math.sin(Math.PI * e)); lean = fwd * (1 - e * 0.3);
      plantR = 1 - 0.7 * Math.sin(Math.PI * e);
    } else {
      // recover / done: 右手の おわりの 場所に 止める
      this.polar(-K.endDeg, R, gy, this.R);
      this.L.copy(r0.LeftHand);
      twist = tw; lean = fwd * 0.7;
    }
    // 肩から 届かない 点は 届く 所へ（solveArm も おさえる が、足もとの 動きを なめらかに）
    void reach;
    st.poseBoth(this.L, this.R, lean, twist, plantL, plantR);
  }

  /** 手の ひらの まんなか（からだの 座標） */
  palm(side: Side, out = new Vector3()): Vector3 { return this.step.palm(side, out); }
}
