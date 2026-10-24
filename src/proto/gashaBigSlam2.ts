/**
 * #293 試作: 攻撃 1「両手の たたきつけ」の 動き（yuzu の 絵コンテ attacks/1-slam-storyboard.jpeg）。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ① windup  : 両手を 組んで 頭の 上へ ゆっくり 持ち上げる（5 秒）。体は 少し そる。はじまりの コマで「予告」（前の 地面に 半円）。
 *  ② hold    : てっぺんで 少し 止まる。
 *  ③ slam    : 組んだ 両手を 思い切り 前へ 振り下ろす（だんだん 速く）。着いた コマが「打撃」（strike）。
 *  ④ impact  : 手を ついた まま。衝撃波・ゆれ・岩は 呼ぶ 側（打撃の コマから）。
 *  ⑤ recover : 手を ついた まま 待つ（呼ぶ 側が 休みの 姿勢へ なめらかに もどす）。おわったら done。
 * 腕の 姿勢は StepCrawler の 2 本の 骨の IK（poseBoth）を 使う。座標は からだの 座標（もとの 座標。+x = 左、+y = 上、+z = 前）。数は gashaBigTuning.ts の slam2。
 */
import { Vector3 } from 'three';
import type { BigModel } from './gashaBig';
import type { StepCrawler } from './gashaBigStep';
import { TUNE as T } from './gashaBigTuning';

export type Slam2Phase = 'idle' | 'windup' | 'hold' | 'slam' | 'impact' | 'recover' | 'done';
export interface Slam2Event {
  /** この コマで 予告が はじまった */
  warn?: boolean;
  /** この コマで 手が 地面に 着いた（打撃・岩・衝撃波・ゆれ） */
  strike?: boolean;
}

const DEG = Math.PI / 180;
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const ease = {
  in: (u: number, p = 2.4) => Math.pow(u, p),
  smooth: (u: number) => u * u * (3 - 2 * u),
  /** そっと 動き出して、あとは 長く だんだん 止まる */
  lift: (u: number) => 1 - Math.pow(1 - u, 3) * (1 + 3 * u),
};
/** 手首から 手の ひらの まんなかまでの 前への 長さ（StepCrawler.palm と おなじ） */
const PALM_FWD = 3.4;

export class Slam2 {
  phase: Slam2Phase = 'idle';
  /** いまの 段の 経過（秒） */
  t = 0;
  private readonly rest: BigModel['rest'];
  private readonly topL = new Vector3();
  private readonly topR = new Vector3();
  private readonly hitL = new Vector3();
  private readonly hitR = new Vector3();
  private readonly startL = new Vector3();
  private readonly startR = new Vector3();

  constructor(private readonly step: StepCrawler, model: BigModel) { this.rest = model.rest; }

  get done(): boolean { return this.phase === 'done'; }

  private sec(p: Slam2Phase): number {
    const K = T.slam2;
    return Math.max(1e-3, p === 'windup' ? K.windupSec : p === 'hold' ? K.holdSec : p === 'slam' ? K.slamSec : p === 'impact' ? K.impactHoldSec : p === 'recover' ? K.recoverSec : 0);
  }

  /** はじめる。いちばん 上と 打ち下ろす 場所を 決める（腕が 届かなければ 届く 所まで）。予告の 合図（warn）は 最初の update で 出る */
  start(): void {
    const K = T.slam2, st = this.step;
    const reach = st.reach * K.reachFrac;
    this.step.reset();
    this.startL.copy(this.rest.LeftHand); this.startR.copy(this.rest.RightHand);
    // いちばん 上: 体を そらせた 肩から 届く 所まで。両手を 組む（左右の すきま = clasp）
    for (const sd of ['Left', 'Right'] as const) {
      const s = sd === 'Left' ? 1 : -1;
      const sh = st.shoulderAt(sd, -K.backLeanDeg * DEG, 0, new Vector3());
      const top = (sd === 'Left' ? this.topL : this.topR).set(s * K.clasp, K.raise[1], K.raise[2]);
      const d = top.clone().sub(sh);
      if (d.length() > reach) top.copy(sh).addScaledVector(d.normalize(), reach);
      // 打ち下ろす 場所: 前へ のめった 肩から 届く いちばん 遠い 所
      const sf = st.shoulderAt(sd, K.fwdLeanDeg * DEG, 0, new Vector3());
      const gy = this.rest[`${sd}Hand`].y;
      const x = s * K.clasp;
      const hor2 = reach * reach - (sf.y - gy) ** 2 - (x - sf.x) ** 2;
      const zMax = hor2 > 0 ? sf.z + Math.sqrt(hor2) : sf.z;
      (sd === 'Left' ? this.hitL : this.hitR).set(x, gy, Math.min(K.slamZ, zMax));
    }
    this.phase = 'windup';
    this.t = 0;
    this.pendingWarn = true;
    this.solve();
  }

  private pendingWarn = false;

  /** 1 コマ すすめる */
  update(dt: number): Slam2Event {
    const ev: Slam2Event = {};
    if (this.phase === 'idle' || this.phase === 'done') return ev;
    if (this.pendingWarn) { ev.warn = true; this.pendingWarn = false; }
    this.t += dt;
    // 段を すすめる（1 コマ 1 段）
    const len = this.sec(this.phase);
    if (this.t >= len) {
      const over = this.t - len;
      const prev = this.phase;
      this.phase = prev === 'windup' ? 'hold' : prev === 'hold' ? 'slam' : prev === 'slam' ? 'impact' : prev === 'impact' ? 'recover' : 'done';
      this.t = this.phase === 'done' ? 0 : Math.min(over, this.sec(this.phase) * 0.999);
      if (prev === 'slam') { ev.strike = true; this.solve(); }
    }
    this.solve();
    return ev;
  }

  /** 予告の 強さ 0〜1（持ち上げの はじまりから だんだん 強く、振り下ろしの おわりで 消える。おわれば 0） */
  warnLevel(): number {
    const K = T.slam2;
    const total = K.windupSec + K.holdSec + K.slamSec;
    let e: number;
    if (this.phase === 'windup') e = this.t;
    else if (this.phase === 'hold') e = K.windupSec + this.t;
    else if (this.phase === 'slam') e = K.windupSec + K.holdSec + this.t;
    else return 0;
    return clamp01(0.25 + 0.75 * (e / total));
  }

  /** いまの 段の 手首の 目標と 姿勢を pose に 作る */
  private solve(): void {
    const K = T.slam2;
    const u = clamp01(this.t / this.sec(this.phase));
    const L = new Vector3(), R = new Vector3();
    let lean = 0, plant = 1;
    const back = -K.backLeanDeg * DEG, fwd = K.fwdLeanDeg * DEG;
    if (this.phase === 'windup') {
      const e = ease.lift(u);
      L.copy(this.startL).lerp(this.topL, e); R.copy(this.startR).lerp(this.topR, e);
      // 両手を 外から 頭の 横を とおって 上で 組む（道を 外へ ふくらませる）
      const bulge = 8 * Math.sin(Math.PI * e);
      L.x += bulge; R.x -= bulge;
      L.y += 3 * Math.sin(Math.PI * e); R.y += 3 * Math.sin(Math.PI * e);
      plant = 1 - ease.smooth(clamp01(u / 0.12));
      lean = back * e;
    } else if (this.phase === 'hold') {
      L.copy(this.topL); R.copy(this.topR);
      L.y += 0.8 * ease.smooth(u); R.y += 0.8 * ease.smooth(u);
      plant = 0; lean = back;
    } else if (this.phase === 'slam') {
      const e = ease.in(u);
      // 頭の 上から 前へ 大きな 弧（2 次の ベジェ）
      for (const [out, a, b] of [[L, this.topL, this.hitL], [R, this.topR, this.hitR]] as const) {
        const c = new Vector3(b.x, a.y + 2, b.z * 0.85), m = 1 - e;
        out.set(m * m * a.x + 2 * m * e * c.x + e * e * b.x, m * m * a.y + 2 * m * e * c.y + e * e * b.y, m * m * a.z + 2 * m * e * c.z + e * e * b.z);
      }
      plant = ease.smooth(clamp01((u - 0.85) / 0.15));
      lean = back + (fwd - back) * e;
    } else {
      L.copy(this.hitL); R.copy(this.hitR); lean = fwd;
    }
    this.step.poseBoth(L, R, lean, 0, plant, plant);
  }

  /** 手の ひらの まんなかの 中点（からだの 座標）。打撃の 中心 */
  landing(out: Vector3): Vector3 {
    const a = this.step.palm('Left'), b = this.step.palm('Right');
    return out.copy(a).add(b).multiplyScalar(0.5);
  }

  /** はじめから 分かる 落ちる 場所（からだの 座標）。予告の 半円の 中心 */
  predicted(out: Vector3): Vector3 {
    return out.copy(this.hitL).add(this.hitR).multiplyScalar(0.5).add(new Vector3(0, 0, PALM_FWD));
  }
}
