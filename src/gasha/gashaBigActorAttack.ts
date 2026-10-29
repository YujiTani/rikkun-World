/**
 * #308 gashaBigActor.ts を 分けた もの: 怒りの 攻撃 5 種（両手たたきつけ・両手で 払う・目から 光線・口から 噴火・自分に 落雷）と「つかれて 休む」の 動き。
 * 攻撃ごとの 状態（予告・払っている 手・出した 数）は ここが 持つ。体の 向き・場所・歩く 姿勢の 重みは BigActor の もの なので、
 * 要る 物だけを AttackHost で 受ける（this ぜんたいは わたさない）。呼ぶ 順・値は もとの BigActor の まま。
 */
import { Quaternion, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import type { StepCrawler, Side } from './gashaBigStep';
import type { AttackCycle } from './gashaBigAttack';
import { Slam2 } from './gashaBigSlam2';
import { Sweep } from './gashaBigSweep';
import { Beam } from './gashaBigBeam';
import { Eruption } from './gashaBigEruption';
import { Thunder } from './gashaBigThunder';
import { DEG, type ActorEnv, type WarnMark } from './gashaBigActorBase';

/** 攻撃が 体から 受ける もの（BigActor が 作って わたす） */
export interface AttackHost {
  readonly model: BigModel;
  readonly env: ActorEnv;
  readonly cycle: AttackCycle;
  readonly pos: Vector3;
  /** 前へ 進む 1 歩（rebake で 作りなおされる ので 毎回 読む） */
  step(): StepCrawler;
  yaw(): number;
  /** 歩く 姿勢の めざす 重み */
  stepWant(): number;
  /** finale() で はじめた 噴火は おわったら 固まる */
  finaleOn(): boolean;
  /** 歩く 姿勢の 重みを 1 に する（stepW = stepWant = 1） */
  holdStep(): void;
  fadeStep(want: number, sec: number): void;
  /** 目の 色を 次の コマで 作りなおす */
  resetEyes(): void;
  /** 攻撃が おわった: サイクルに 知らせて、つかれる 番なら 休み、そうでなければ 怒りの ならしへ */
  endAttack(): void;
  backToAngry(sec: number): void;
  /** 噴火の あと 上を 向いた まま 固まる */
  enterHeld(): void;
}

export const ATTACK_NAMES = ['slam2', 'sweep', 'beam', 'eruption', 'thunder'];

export class AttackRunner {
  slam2!: Slam2;
  sweep!: Sweep;
  beam!: Beam;
  eruption!: Eruption;
  thunder!: Thunder;
  /** 攻撃の 名前（attack モードの 間） */
  attackName: string | null = null;
  /** 予告の 半円（なければ null） */
  warn: WarnMark | null = null;
  /** 光線の 間 首が 向く 点（世界の 座標。外から 毎コマ 決める。なければ プレイヤー） */
  beamLook: { x: number; y: number; z: number } | null = null;
  /** 払っている 手の いま（世界の 座標。vx, vz = 手の 水平の 動き 1 秒あたり）。払って いなければ null */
  sweepNow: { side: Side; x: number; y: number; z: number; vx: number; vz: number; stroke: number } | null = null;
  /** 各攻撃を 出した 数（テスト用。噴火・雷は 乱数の 種にも なる） */
  slam2Count = 0;
  sweepCount = 0;
  beamCount = 0;
  eruptionCount = 0;
  thunderCount = 0;
  private sweepLast: { x: number; z: number } | null = null;
  private sweepStroke = 0;
  private slam2Pred = new Vector3();
  private slam2Phase = '';
  private readonly tv2 = new Vector3();
  private readonly thL = new Vector3();
  private readonly thR = new Vector3();
  private tiredT = 0;
  private tiredHands: { l: Vector3; r: Vector3 } | null = null;
  private readonly tq = new Quaternion();
  private readonly tAxis = new Vector3();

  constructor(private readonly host: AttackHost, private readonly jointIndex: Map<JointName, number>) {}

  /** 動きの 部品を 作る（rebake から。作る 順は もとの まま） */
  rebuild(step: StepCrawler, model: BigModel): void {
    this.slam2 = new Slam2(step, model);
    this.sweep = new Sweep(step, model);
    this.beam = new Beam();
    this.eruption = new Eruption();
    this.thunder = new Thunder();
  }

  /** 攻撃の 途中の 状態を ぜんぶ 片づける（当たり・予告・払い・光線・噴火・雷の 雲と 電気）。待たせた 攻撃は 呼ぶ 側が 消す */
  clear(): void {
    this.warn = null; this.attackName = null; this.sweepNow = null; this.sweepLast = null; this.beamLook = null;
    this.beam.phase = 'idle'; this.beam.glow = 0;
    this.eruption.phase = 'idle'; this.eruption.pitch = 0; this.eruption.column = 0; this.eruption.wind = 0;
    this.thunder.reset();
    this.sweep.phase = 'idle'; this.sweep.t = 0;
    this.slam2.phase = 'idle'; this.slam2Phase = '';
  }

  /** 休みの 手の 記録を 消す */
  clearTired(): void { this.tiredHands = null; }

  /** 攻撃を はじめる（BigActor が モードなどを 決めた あと）。name は ATTACK_NAMES の どれか */
  begin(name: string): void {
    const h = this.host;
    this.attackName = name;
    this.sweepStroke = 0;
    h.env.onAttackStart?.(name);
    if (name === 'thunder') {
      // 自分に 落雷: 足は 止めて、左手を 空へ（右手は 地面に ついた まま）
      h.step().reset();
      this.thunder.start(this.thunderCount);
      this.thunderCount++;
      h.holdStep();
      h.resetEyes();
      this.solveThunder();
      return;
    }
    if (name === 'eruption') {
      this.eruption.start(h.finaleOn());
      this.eruptionCount++;
      h.resetEyes();
      return;
    }
    if (name === 'beam') {
      // 目から 光線: 足は 止めて そのまま。首を ねらう 点へ むける
      this.beam.start();
      this.beamCount++;
      this.beamLook = null;
      h.resetEyes();
      return;
    }
    if (name === 'sweep') {
      this.sweep.start();
      this.sweepCount++;
      this.sweepNow = null; this.sweepLast = null;
      h.holdStep();
      h.resetEyes();
      return;
    }
    this.slam2.start();
    this.slam2Phase = this.slam2.phase;
    h.holdStep();
    h.resetEyes();
    const yaw = h.yaw(), pos = h.pos;
    const c = Math.cos(yaw), sn = Math.sin(yaw), sc = h.model.scale;
    const p = this.slam2.predicted(this.slam2Pred);
    const wx = pos.x + (p.x * c + p.z * sn) * sc, wz = pos.z + (-p.x * sn + p.z * c) * sc;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), R = T.slam2.warnRadius;
    // 予告の 印は 平らな 板なので、半円の 中の いちばん 高い 地面に そろえる（でこぼこで 地面に うまらない ように）
    let wy = pos.y;
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8 - 0.5) * Math.PI;
      for (const k of [0.4, 0.8]) {
        const lx = Math.sin(a) * R * k, lz = Math.cos(a) * R * k;
        wy = Math.max(wy, h.env.groundY(Math.floor(wx + lx * fz + lz * fx), Math.floor(wz - lx * fx + lz * fz)) + 1);
      }
    }
    this.warn = { x: wx, y: wy, z: wz, fx, fz, radius: R, level: this.slam2.warnLevel() };
  }

  /** 攻撃モードの 1 コマ（攻撃ごとに 動きを 進め、できごとを 知らせ、おわったら endAttack） */
  update(dt: number): void {
    const h = this.host, env = h.env;
    if (this.attackName === 'thunder') {
      const ev = this.thunder.update(dt);
      if (ev.strike) env.onThunderStrike?.();
      if (ev.land) env.onThunderLand?.();
      this.solveThunder();
      if (this.thunder.done) h.endAttack();
      return;
    }
    if (this.attackName === 'eruption') {
      const ev = this.eruption.update(dt);
      if (ev.eruptStart) env.onEruptStart?.();
      if (this.eruption.phase === 'hold') { h.enterHeld(); return; }
      if (this.eruption.done) h.endAttack();
      return;
    }
    if (this.attackName === 'beam') {
      this.beam.update(dt);
      h.resetEyes(); // 光は 毎コマ 変わる
      if (this.beam.done) {
        this.beamLook = null;
        h.endAttack();
      }
      return;
    }
    if (this.attackName === 'sweep') {
      const ev = this.sweep.update(dt);
      void ev.warn;
      if (ev.strokeStart) { env.onSweepStroke?.(this.sweepStroke); this.sweepStroke++; }
      if (this.sweep.phase === 'recover' && h.stepWant() !== 0) h.fadeStep(0, T.sweep.recoverSec);
      const a = this.sweep.active;
      if (a) {
        const q = this.sweep.palm(a, this.tv2), c = Math.cos(h.yaw()), sn = Math.sin(h.yaw()), sc = h.model.scale;
        const x = h.pos.x + (q.x * c + q.z * sn) * sc, z = h.pos.z + (-q.x * sn + q.z * c) * sc;
        const l = this.sweepLast;
        this.sweepNow = { side: a, x, y: h.pos.y, z, vx: l ? (x - l.x) / dt : 0, vz: l ? (z - l.z) / dt : 0, stroke: this.sweepStroke };
        this.sweepLast = { x, z };
      } else { this.sweepNow = null; this.sweepLast = null; }
      if (this.sweep.done) {
        this.sweepNow = null;
        h.endAttack();
      }
      return;
    }
    const ev = this.slam2.update(dt);
    if (this.slam2.phase !== this.slam2Phase) {
      this.slam2Phase = this.slam2.phase;
      if (this.slam2.phase === 'recover') h.fadeStep(0, T.slam2.recoverSec);
    }
    if (this.warn) this.warn.level = this.slam2.warnLevel();
    if (ev.strike) {
      this.slam2Count++;
      this.warn = null;
      const q = this.slam2.landing(new Vector3()), c = Math.cos(h.yaw()), sn = Math.sin(h.yaw()), sc = h.model.scale;
      env.onSlam2?.(h.pos.x + (q.x * c + q.z * sn) * sc, h.pos.y, h.pos.z + (-q.x * sn + q.z * c) * sc, Math.sin(h.yaw()), Math.cos(h.yaw()));
    }
    if (this.slam2.done) h.endAttack();
  }

  /** 左手を 空へ 上げて 指さす 姿勢（thunder.raise に 合わせる）。右手は 休みの 位置で 地面に ついた まま */
  private solveThunder(): void {
    const K = T.thunder, r0 = this.host.model.rest, e = this.thunder.raise;
    const h = this.thL.set(K.raise[0], K.raise[1], K.raise[2]);
    h.lerpVectors(r0.LeftHand, h, e);
    h.x += 6 * Math.sin(Math.PI * e);
    const smooth = (u: number): number => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
    this.host.step().poseBoth(h, this.thR.copy(r0.RightHand), -K.backLeanDeg * DEG * e, K.twistDeg * DEG * e, 1 - smooth(e / 0.25), 1);
  }

  /** 左手の 指さきの 世界の 位置（指さす 向き = 手の 先） */
  fingerTip(out: Vector3): Vector3 {
    return out.set(0, 0, T.thunder.fingerLen).applyMatrix4(this.host.model.joints.LeftHand.matrixWorld);
  }

  // ---------------------------------------------------------------- つかれて 休む
  /** 休みに はいる（BigActor が 途中の 攻撃の 片づけと モードを 決めた あと）。両手を 前の 地面に つく 位置を 決める */
  beginTired(): void {
    const h = this.host;
    this.tiredT = 0;
    h.step().reset();
    const r = h.model.rest, K = T.tired, reach = h.step().reach * T.slam2.reachFrac;
    const mk = (sd: 'Left' | 'Right') => {
      const s = sd === 'Left' ? 1 : -1, sh = h.step().shoulderAt(sd, K.leanDeg * DEG, 0, new Vector3());
      const gy = r[`${sd}Hand`].y, x = s * K.handSpread;
      const hor2 = reach * reach - (sh.y - gy) ** 2 - (x - sh.x) ** 2;
      return new Vector3(x, gy, Math.min(K.handZ, hor2 > 0 ? sh.z + Math.sqrt(hor2) : sh.z));
    };
    this.tiredHands = { l: mk('Left'), r: mk('Right') };
    h.holdStep();
    h.resetEyes();
    this.solveTired(0);
  }

  /** 休みの 1 コマ。休みが おわったら true */
  updateTired(dt: number): boolean {
    this.tiredT += dt;
    this.solveTired(Math.min(1, this.tiredT / Math.max(1e-3, T.tired.settleSec)));
    return !!this.host.cycle.update(dt).tiredEnd;
  }

  /** 休みの 姿勢（両手を 前の 地面に つく・のめる・頭を 下げる）。e = 0〜1 の なじみ */
  private solveTired(e: number): void {
    const h = this.host;
    const K = T.tired, hands = this.tiredHands!;
    const sm = e * e * (3 - 2 * e);
    const L = new Vector3().copy(h.model.rest.LeftHand).lerp(hands.l, sm), R = new Vector3().copy(h.model.rest.RightHand).lerp(hands.r, sm);
    // 肩で 息: 胸を ゆっくり 前後に ゆらす（手は 地面に ついた まま。IK が 腕を 合わせる）
    const breath = Math.sin((this.tiredT / Math.max(0.5, K.breathSec)) * Math.PI * 2) * K.breathDeg * DEG * sm;
    h.step().poseBoth(L, R, K.leanDeg * DEG * sm + breath, 0, 1, 1);
    for (const g of h.model.swirl.eyes) g.rotation.z = -(this.tiredT * K.swirlDegPerSec * DEG);
    const q = this.tq.setFromAxisAngle(this.tAxis.set(1, 0, 0), (K.headDownDeg * DEG * sm) / 2);
    for (const n of ['neck', 'Head'] as const) { const i = this.jointIndex.get(n); if (i !== undefined) h.step().pose[i]!.multiply(q); }
  }
}
