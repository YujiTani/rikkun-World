/**
 * #293 試作: 大きい がしゃどくろの 前へ 進む 1 歩（yuzu 2026-10-24）。キーの 姿勢を 手で 組んで イージングで つなぐ（素材の モーションは 使わない）。
 * 1 歩 = 3 つの 段（左右の 腕を 交ごに）:
 *   1. ためる（windup → hold）: 片腕を 頭の 上まで ゆっくり 振り上げる（だんだん 止まる）。体は 少し そる。反対の 手は 地面に ついた まま。いちばん 上で 少し 止まる。
 *   2. たたきつける（slam）: 体の 前の できるだけ 遠くへ いっきに 振り下ろす（だんだん 速く）。手が 地面に 着いた コマで slam の できごと（ダメージ・ゆれ・土ぼこり は 呼ぶ 側）。
 *   3. 引きよせる（pull）: 着いた 手は 地面に 止めた まま、体を 手の 方へ 引きよせて 進む（出だし 強く、だんだん ゆるめる）。1 歩の 長さ = 腕の 届く ぶん。
 *      おわりの ほう（catchFrom から）で 後ろに のこった 反対の 手を 前へ つきなおす。手が 地面を たたいた コマで tap の できごと（小さい 衝撃）。
 * 腕は 2 本の 骨の IK（肩 → ひじ → 手首）。胸は 3 つの 背骨に そり・前のめり・ひねりを 分けて かける。首・頭は 前を 見る ように 少し もどす。
 * 座標は からだの 座標（もとの 座標。+x = キャラの 左、+y = 上、+z = 前）。ついている 手は 体が 進む・回る ぶん からだの 座標で 動かして、世界では 止める。
 * three の 数学（Quaternion / Vector3）だけ 使う（画面には さわらない）。
 */
import { Euler, Quaternion, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBig';

export type StepPhase = 'windup' | 'hold' | 'slam' | 'pull';
export type Side = 'Left' | 'Right';
const SIDES: readonly Side[] = ['Left', 'Right'];

export interface StepTune {
  /** 【秒】振り上げる */
  windupSec: number;
  /** 【秒】いちばん 上で 止まる */
  holdSec: number;
  /** 【秒】振り下ろす */
  slamSec: number;
  /** 【秒】体を 引きよせる */
  pullSec: number;
  /** 振り上げた 手首の 位置（もとの 座標）[外へ, 上, 前]。外へ = 体の まんなかから その 腕の 側へ */
  raise: readonly [number, number, number];
  /** たたきつける 手首の 前の 位置（もとの 座標の z。腕が 届かなければ 届く 所まで） */
  slamZ: number;
  /** 引きよせ おわった ときの その 手首の 前の 位置（もとの 座標の z）。1 歩 = slamZ − これ */
  pullEndZ: number;
  /** 【度】振り上げの とき 体を そる 角 */
  backLeanDeg: number;
  /** 【度】たたきつけた とき 前へ のめる 角 */
  fwdLeanDeg: number;
  /** 【度】胸の ひねり（振り上げで 腕の 側の 肩が 後ろ、たたきつけで 前） */
  twistDeg: number;
  /** 振り上げの 道の ふくらみ（外へ。もとの 座標） */
  raiseBulge: number;
  /** 腕が とどく 長さの 何割 まで のばすか（1 だと のびきって ひじが ぴんと なる） */
  reachFrac: number;
  /** 【割合】引きよせの この 割合 から 反対の 手を 前へ つきなおす（1 いじょうで つきなおさない） */
  catchFrom: number;
  /** つきなおす 手を 持ち上げる 高さ（もとの 座標） */
  catchLift: number;
}

export interface StepEvent {
  /** この コマで 体が 前へ 進んだ 長さ（もとの 座標） */
  advance: number;
  /** この コマで 手が 地面に 着いた（たたきつけた）腕 */
  slam: Side | null;
  /** この コマで 新しい 1 歩（振り上げ）が はじまった */
  stepStart: boolean;
  /** この コマで つきなおした 手が 地面を たたいた 腕（小さい 衝撃） */
  tap: Side | null;
}

const ease = {
  /** だんだん 止まる */
  out: (u: number, p = 3) => 1 - Math.pow(1 - u, p),
  /** だんだん 速く */
  in: (u: number, p = 2.2) => Math.pow(u, p),
  smooth: (u: number) => u * u * (3 - 2 * u),
  /** そっと 動き出して、あとは 長く だんだん 止まる（速さ = 12u(1−u)²。いちばん 速いのは 1/3 の 所） */
  lift: (u: number) => 1 - Math.pow(1 - u, 3) * (1 + 3 * u),
};
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));
const DEG = Math.PI / 180;

export class StepCrawler {
  phase: StepPhase = 'windup';
  /** いまの 段の 経過（秒） */
  t = 0;
  /** いま 振り上げて いる 腕 */
  side: Side = 'Left';
  /** 何歩目か（0 から） */
  steps = 0;
  /** たたきつけた 回数 */
  slams = 0;
  /** 反対の 手を つきなおした 回数 */
  taps = 0;
  /** 関節ごとの local 回転（model.joints の 並び） */
  readonly pose: Quaternion[];
  /** 手首の 目標（からだの 座標）。ついている 手は 世界で 止まる ように 動かす */
  readonly hands: Record<Side, Vector3>;
  /** 手首の いまの 位置（IK の 結果。からだの 座標） */
  readonly wrist: Record<Side, Vector3>;
  /** この 歩の 1 歩の 長さ（もとの 座標） */
  stride = 0;
  /** 向きの ずれで 短く する 前の 1 歩の 長さ（もとの 座標） */
  strideFull = 0;
  /** 引きよせで もう 進んだ 長さ */
  private pulled = 0;
  /** 1 歩の 長さの 倍率（向きが ずれて いる 間は 小さく。歩の はじめに 決める） */
  strideMul = 1;
  private start = new Vector3();
  private top = new Vector3();
  private slamAt = new Vector3();
  private lean = 0;
  private twist = 0;
  /** 反対の 手を つきなおして いる（宙に ある）間 true。はじめと おわりの 場所（からだの 座標） */
  private catching = false;
  private readonly catchA = new Vector3();
  private readonly catchB = new Vector3();

  private readonly names: JointName[];
  private readonly idx: Map<JointName, number>;
  private readonly parent: (JointName | null)[];
  private readonly W: Quaternion[];
  private readonly P: Vector3[];
  private readonly L: { upper: number; fore: number };
  private readonly rest: Record<JointName, Vector3>;

  constructor(model: BigModel, public tune: StepTune) {
    this.names = Object.keys(model.joints) as JointName[];
    this.idx = new Map(this.names.map((n, i) => [n, i] as const));
    this.parent = this.names.map((n) => {
      const p = model.joints[n].parent?.name as JointName | undefined;
      return p && this.idx.has(p) ? p : null;
    });
    this.pose = this.names.map(() => new Quaternion());
    this.W = this.names.map(() => new Quaternion());
    this.P = this.names.map(() => new Vector3());
    this.rest = model.rest;
    const r = model.rest;
    this.L = { upper: r.LeftForeArm.distanceTo(r.LeftArm), fore: r.LeftHand.distanceTo(r.LeftForeArm) };
    this.hands = { Left: r.LeftHand.clone(), Right: r.RightHand.clone() };
    this.wrist = { Left: r.LeftHand.clone(), Right: r.RightHand.clone() };
    this.reset();
  }

  /** 休みの 姿勢に もどして、左の 腕の 振り上げから はじめる */
  reset(): void {
    const r = this.rest;
    this.hands.Left.copy(r.LeftHand); this.hands.Right.copy(r.RightHand);
    this.phase = 'windup'; this.t = 0; this.side = 'Left'; this.steps = 0; this.slams = 0; this.taps = 0;
    this.lean = 0; this.twist = 0; this.pulled = 0; this.catching = false;
    this.beginStep();
    this.solve();
  }

  /** 1 段の 長さ（秒） */
  phaseSec(p: StepPhase = this.phase): number {
    const k = this.tune;
    return Math.max(1e-3, p === 'windup' ? k.windupSec : p === 'hold' ? k.holdSec : p === 'slam' ? k.slamSec : k.pullSec);
  }

  /** 1 歩の 秒 */
  stepSec(): number { return this.phaseSec('windup') + this.phaseSec('hold') + this.phaseSec('slam') + this.phaseSec('pull'); }

  /** 体が 回った（ラジアン、Y 軸まわり。three の rotation.y と おなじ 向き）。ついている 手を 世界で 止める ため からだの 座標で 逆に 回す */
  rotate(dYaw: number): void {
    if (dYaw === 0) return;
    const c = Math.cos(-dYaw), s = Math.sin(-dYaw);
    for (const sd of SIDES) {
      if (sd === this.side && this.phase !== 'pull') continue; // 振り上げて いる 手は 体と いっしょに 回る（道は からだの 座標）
      if (sd !== this.side && this.catching) continue; // つきなおして いる 手も 宙に ある
      const h = this.hands[sd];
      const x = h.x * c + h.z * s, z = -h.x * s + h.z * c;
      h.x = x; h.z = z;
    }
  }

  private other(): Side { return this.side === 'Left' ? 'Right' : 'Left'; }
  private sgn(sd: Side): number { return sd === 'Left' ? 1 : -1; }

  /** 肩（Arm 関節）の 位置（からだの 座標）を 胸の 角度から 出す */
  shoulderAt(sd: Side, lean: number, twist: number, out: Vector3): Vector3 {
    this.setTorso(lean, twist);
    this.fk();
    return out.copy(this.P[this.idx.get(`${sd}Arm`)!]!);
  }

  /** 新しい 1 歩: 振り上げる 腕の はじまりと いちばん 上、たたきつける 場所、1 歩の 長さを 決める */
  private beginStep(): void {
    const k = this.tune, sd = this.side, s = this.sgn(sd), o = this.other();
    this.start.copy(this.hands[sd]);
    const reach = (this.L.upper + this.L.fore) * k.reachFrac;
    // いちばん 上（腕が 届く 所まで）
    const Sh = this.shoulderAt(sd, -k.backLeanDeg * DEG, k.twistDeg * DEG * s, new Vector3());
    this.top.set(s * k.raise[0], k.raise[1], k.raise[2]);
    const dTop = this.top.clone().sub(Sh);
    if (dTop.length() > reach) this.top.copy(Sh).addScaledVector(dTop.normalize(), reach);
    // たたきつける 場所: 前へ のめった 肩から 届く いちばん 遠い 所まで
    const Sf = this.shoulderAt(sd, k.fwdLeanDeg * DEG, -k.twistDeg * DEG * s, new Vector3());
    const gy = this.rest[`${sd}Hand`].y, x = this.rest[`${sd}Hand`].x;
    const hor2 = reach * reach - (Sf.y - gy) ** 2 - (x - Sf.x) ** 2;
    const zMax = hor2 > 0 ? Sf.z + Math.sqrt(hor2) : Sf.z;
    this.slamAt.set(x, gy, Math.min(k.slamZ, zMax));
    // 1 歩の 長さ: 引きよせで 反対の 手が 後ろへ 届かなく ならない まで
    let stride = Math.max(0, this.slamAt.z - k.pullEndZ);
    const S0 = this.shoulderAt(o, 0, 0, new Vector3());
    const ho = this.hands[o];
    const back2 = reach * reach - (S0.y - ho.y) ** 2 - (ho.x - S0.x) ** 2;
    const zMin = back2 > 0 ? S0.z - Math.sqrt(back2) : S0.z;
    // 反対の 手は catchFrom で 地面から はなれる ので、そこ までに 進む ぶん だけ 届けば よい
    const until = k.catchFrom < 1 ? ease.out(clamp01(k.catchFrom), 2.5) : 1;
    stride = Math.min(stride, Math.max(0, ho.z - zMin) / Math.max(1e-3, until));
    this.strideFull = stride;
    this.stride = stride * this.strideMul;
    this.pulled = 0;
  }

  /** 1 コマ すすめる。stepStart の ときは 呼ぶ 側が 止まるか 決められる（stop なら 何も しない） */
  update(dt: number): StepEvent {
    const ev: StepEvent = { advance: 0, slam: null, stepStart: false, tap: null };
    this.t += dt;
    // 段を すすめる（dt が 大きくても 段を とばさない ように 1 コマ 1 段 まで）
    if (this.t >= this.phaseSec()) {
      const over = this.t - this.phaseSec();
      if (this.phase === 'windup') this.phase = 'hold';
      else if (this.phase === 'hold') this.phase = 'slam';
      else if (this.phase === 'slam') {
        this.phase = 'pull';
        this.hands[this.side].copy(this.slamAt);
        this.slams++;
        ev.slam = this.side;
      } else {
        // 引きよせの のこりを 進めきる。つきなおした 手が 地面を たたく
        ev.advance += this.pullTo(1);
        if (this.catching) {
          const o = this.other();
          this.hands[o].copy(this.catchB);
          this.catching = false;
          this.taps++;
          ev.tap = o;
        }
        this.phase = 'windup';
        this.side = this.other();
        this.steps++;
        this.beginStep();
        ev.stepStart = true;
      }
      this.t = Math.min(over, this.phaseSec() * 0.999);
    }
    if (this.phase === 'pull') {
      const u = this.t / this.phaseSec();
      // 反対の 手を つきなおし はじめる（宙へ）。おく 所は 休みの 手の 場所
      if (!this.catching && this.tune.catchFrom < 1 && u >= this.tune.catchFrom) {
        const o = this.other();
        this.catching = true;
        this.catchA.copy(this.hands[o]);
        this.catchB.copy(this.rest[`${o}Hand`]);
      }
      ev.advance += this.pullTo(u);
    }
    this.solve();
    return ev;
  }

  /** 引きよせを 割合 u まで 進める（出だし 強く、だんだん ゆるめる）。進んだ 長さを 返す */
  private pullTo(u: number): number {
    const want = this.stride * ease.out(clamp01(u), 2.5);
    const d = want - this.pulled;
    if (d !== 0) {
      for (const sd of SIDES) if (!(this.catching && sd !== this.side)) this.hands[sd].z -= d; // 世界で 止まる ように（宙の 手は のぞく）
      this.pulled = want;
    }
    return d;
  }

  /** いまの 段の 手首の 目標・ついている 重み・胸の 角度 */
  private targets(): { act: Vector3; actPlant: number; oth: Vector3; othPlant: number } {
    const k = this.tune, u = clamp01(this.t / this.phaseSec()), s = this.sgn(this.side);
    const back = -k.backLeanDeg * DEG, fwd = k.fwdLeanDeg * DEG, tw = k.twistDeg * DEG * s;
    const act = new Vector3();
    let plant = 1;
    if (this.phase === 'windup') {
      const e = ease.lift(u);
      act.copy(this.start).lerp(this.top, e);
      act.x += s * k.raiseBulge * Math.sin(Math.PI * e);
      act.y += k.raiseBulge * 0.5 * Math.sin(Math.PI * e);
      plant = 1 - ease.smooth(clamp01(u / 0.12));
      this.lean = back * e; this.twist = tw * e;
    } else if (this.phase === 'hold') {
      act.copy(this.top);
      act.y += 0.8 * ease.smooth(u); // ほんの 少し 持ち上げて ためる
      plant = 0;
      this.lean = back; this.twist = tw;
    } else if (this.phase === 'slam') {
      const e = ease.in(u, 2.2);
      // 頭の 上から 前へ 大きく 弧を えがいて 振り下ろす（2 次の ベジェ）
      const c = new Vector3(this.slamAt.x, this.top.y + 2, this.slamAt.z * 0.85);
      const a = this.top, b = this.slamAt;
      const m = 1 - e;
      act.set(m * m * a.x + 2 * m * e * c.x + e * e * b.x, m * m * a.y + 2 * m * e * c.y + e * e * b.y, m * m * a.z + 2 * m * e * c.z + e * e * b.z);
      plant = ease.smooth(clamp01((u - 0.85) / 0.15));
      this.lean = back + (fwd - back) * e; this.twist = tw * (1 - 2 * e);
    } else {
      act.copy(this.hands[this.side]);
      const f = this.stride > 0 ? this.pulled / this.stride : 1;
      this.lean = fwd * (1 - f); this.twist = -tw * (1 - f);
    }
    const o = this.other();
    let oth = this.hands[o], othPlant = 1;
    if (this.catching) {
      // 反対の 手を 前へ つきなおす: 持ち上げて 前へ はこび、さいごは 地面を たたく（下りる とき いちばん 速い）
      const cf = clamp01(k.catchFrom), v = clamp01((u - cf) / Math.max(1e-3, 1 - cf));
      const e = ease.smooth(v);
      oth = new Vector3().copy(this.catchA).lerp(this.catchB, e);
      oth.y += k.catchLift * Math.sin(Math.PI * Math.pow(v, 1.5)); // 上がりは ゆっくり、下りは 速く（たたく）
      othPlant = 1 - ease.smooth(clamp01(v / 0.2)) + ease.smooth(clamp01((v - 0.85) / 0.15));
    }
    return { act, actPlant: plant, oth, othPlant };
  }

  private setTorso(lean: number, twist: number): void {
    const q = new Quaternion().setFromEuler(new Euler(lean / 3, twist / 3, 0, 'YXZ'));
    for (const n of this.names) this.pose[this.idx.get(n)!]!.set(0, 0, 0, 1);
    for (const n of ['Spine', 'Spine01', 'Spine02'] as const) this.pose[this.idx.get(n)!]!.copy(q);
    // 首・頭は 前を 見る ように もどす（そる とき 上を 向きすぎ、のめる とき 下を 向きすぎ ない）
    this.pose[this.idx.get('neck')!]!.setFromEuler(new Euler(-lean * 0.45, -twist * 0.4, 0, 'YXZ'));
    this.pose[this.idx.get('Head')!]!.setFromEuler(new Euler(-lean * 0.35, -twist * 0.3, 0, 'YXZ'));
  }

  private fk(): void {
    const r = this.rest;
    for (let j = 0; j < this.names.length; j++) {
      const n = this.names[j]!, p = this.parent[j];
      if (!p) { this.W[j]!.copy(this.pose[j]!); this.P[j]!.copy(r[n]); continue; }
      const pi = this.idx.get(p)!;
      this.W[j]!.copy(this.W[pi]!).multiply(this.pose[j]!);
      this.P[j]!.copy(r[n]).sub(r[p]).applyQuaternion(this.W[pi]!).add(this.P[pi]!);
    }
  }

  /** いまの 段の 姿勢を pose に 作る */
  solve(): void {
    const { act, actPlant, oth, othPlant } = this.targets();
    this.setTorso(this.lean, this.twist);
    this.fk();
    for (const sd of SIDES) {
      const tgt = sd === this.side ? act : oth;
      const plant = sd === this.side ? actPlant : othPlant;
      this.solveArm(sd, tgt, plant);
    }
  }

  private solveArm(sd: Side, tgt: Vector3, plant: number): void {
    const r = this.rest, s = this.sgn(sd);
    const iS = this.idx.get(`${sd}Arm`)!, iF = this.idx.get(`${sd}ForeArm`)!, iH = this.idx.get(`${sd}Hand`)!, iSh = this.idx.get(`${sd}Shoulder`)!;
    const S = this.P[iS]!;
    const L1 = this.L.upper, L2 = this.L.fore;
    const u = tgt.clone().sub(S);
    let d = u.length();
    d = Math.max(Math.abs(L1 - L2) + 1e-3, Math.min(L1 + L2 - 1e-3, d));
    u.normalize();
    // ひじは 外がわ・少し 上・少し 後ろへ まがる
    const pole = new Vector3(s, 0.6, -0.4).normalize();
    pole.addScaledVector(u, -pole.dot(u));
    if (pole.lengthSq() < 1e-8) pole.set(s, 0, 0).addScaledVector(u, -u.x * s);
    pole.normalize();
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const E = S.clone().addScaledVector(u, a).addScaledVector(pole, h);
    const Wr = S.clone().addScaledVector(u, d);
    this.wrist[sd].copy(Wr);
    const restA = r[`${sd}ForeArm`].clone().sub(r[`${sd}Arm`]).normalize();
    const restF = r[`${sd}Hand`].clone().sub(r[`${sd}ForeArm`]).normalize();
    const Wa = new Quaternion().setFromUnitVectors(restA, E.clone().sub(S).normalize());
    const dirF = restF.clone().applyQuaternion(Wa);
    const Wf = new Quaternion().setFromUnitVectors(dirF, Wr.clone().sub(E).normalize()).multiply(Wa);
    const Wsh = this.W[iSh]!;
    this.pose[iS]!.copy(Wsh).invert().multiply(Wa);
    this.pose[iF]!.copy(Wa).invert().multiply(Wf);
    // 手: ついて いる ときは 地面に 平ら（からだの 座標で 回転なし）、空中では 前わんに ついて いく
    const flat = Wf.clone().invert();
    this.pose[iH]!.set(0, 0, 0, 1).slerp(flat, plant);
    const iM = this.idx.get(`${sd}ArmMid`);
    if (iM !== undefined) { this.pose[iM]!.set(0, 0, 0, 1); this.W[iM]!.copy(Wa); } // 上わんの 節を 分けた 関節は 親と おなじ 向き
    this.W[iS]!.copy(Wa); this.W[iF]!.copy(Wf); this.W[iH]!.copy(Wf).multiply(this.pose[iH]!);
    this.P[iF]!.copy(E); this.P[iH]!.copy(Wr);
  }

  /** 腕が とどく 長さ（上わん ＋ 前わん。もとの 座標） */
  get reach(): number { return this.L.upper + this.L.fore; }

  /**
   * 両手を 好きな 場所へ 置いた 姿勢を pose に 作る（両手たたきつけ・つかれた 姿勢 用。1 歩の しくみとは 別。gashaBigSlam2.ts）。
   * left / right = 手首の 目標（からだの 座標）、plant = 手の ひらを 地面に 平らに する 重み（0〜1）。
   */
  poseBoth(left: Vector3, right: Vector3, lean: number, twist: number, plantL: number, plantR: number): void {
    this.setTorso(lean, twist);
    this.fk();
    this.solveArm('Left', left, plantL);
    this.solveArm('Right', right, plantR);
  }

  /** 手の ひらの まんなか（からだの 座標）。たたきつけた 所の 中心 */
  palm(sd: Side, out = new Vector3()): Vector3 {
    return out.set(0, 0, 3.4).applyQuaternion(this.W[this.idx.get(`${sd}Hand`)!]!).add(this.wrist[sd]);
  }
}
