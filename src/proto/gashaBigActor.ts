/**
 * #293 試作: 大きい がしゃどくろ（第一形態）の うごき。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ・前へ 進む: 1 歩 = ためる（腕を 振り上げる）→ たたきつける（打撃・衝撃波の できごと）→ 引きよせる（gashaBigStep.ts。キーの 姿勢を イージングで つなぐ）。
 *  ・さがる・ふり返る は Meshy の モーションを 箱の 関節へ うつす（gashaBigMotion.ts）。さがる ときは 体を クリップの こしの 動きだけ 進める（gashaBigPlant.ts）。
 *  ・ふだんは 白目で ゆっくり はって さまよう（シード付き 乱数）。攻撃されると 赤い 目で 怒り、止まって プレイヤーの 方を 向く。20 秒 攻撃されないと 白目に もどる。
 *  ・当たり（見えない 箱）は 毎コマ 作りなおさず、箱の いまの 場所を 毎コマ 更新して「このマスは 固いか」を その場で 聞く（マスの 集合を 作らない）。
 *  ・上に のっている プレイヤーは、のっている 箱が 動いた ぶん（位置と 向き）いっしょに 動かす。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';
import { aimClip, bakeClip, clipProgress, MotionPlayer, type AimClipJson, type AimOpts, type BakedClip, type ClipJson, type RetargetOpts, type Skeleton } from './gashaBigMotion';
import { fitStride, plantHands, type PlantReport } from './gashaBigPlant';
import { StepCrawler, type Side } from './gashaBigStep';

export interface ActorEnv {
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** プレイヤーを 動かす（位置の ずれ、向き（度）の ずれ） */
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  /** 前へ 進む 1 歩で 手を 地面に たたきつけた（手の ひらの まんなか。y は 地面の 高さ）。打撃・衝撃波・ゆれ は 呼ぶ 側 */
  onSlam?(x: number, y: number, z: number, side: Side): void;
  /** 引きよせの おわりに つきなおした 手が 地面を たたいた（小さい 衝撃。手の ひらの まんなか） */
  onTap?(x: number, y: number, z: number, side: Side): void;
}

export type ActorClips = { climbUp: AimClipJson; climbDown: AimClipJson; lookBack: ClipJson };
export type ActorMode = 'idle' | 'crawl' | 'back' | 'look' | 'angry';

/** 箱の 関節 → 素材（Meshy）の 骨。Meshy の 背骨は 下から Spine02 → Spine01 → Spine（箱は Spine → Spine01 → Spine02） */
const SRC_BONE: Record<string, string> = { Spine: 'Spine02', Spine01: 'Spine01', Spine02: 'Spine' };
const TORSO = new Set(['Spine', 'Spine01', 'Spine02', 'neck', 'Head']);

/** 骨の 向きで うつす ための 箱の 骨の 軸（休みの 姿勢）。首と 頭は 胸の 軸（素材で 首・頭が 胸と まっすぐ なら 箱は 休みの 首・頭） */
export function aimOpts(model: BigModel, c: { armTiltDeg: number; torsoTiltDeg: number; rootTiltDeg: number; loop: boolean; contactSpeed: readonly [number, number]; contactBlur: number; follow: Record<string, number> }): AimOpts {
  const r = model.rest;
  const dir = (a: JointName, b: JointName) => r[b].clone().sub(r[a]).normalize();
  const chest = dir('Spine02', 'neck');
  const axis: Record<string, Vector3> = {
    Hips: dir('Hips', 'Spine'), Spine: dir('Spine', 'Spine01'), Spine01: dir('Spine01', 'Spine02'), Spine02: chest, neck: chest, Head: chest,
  };
  for (const s of ['Left', 'Right'] as const) {
    axis[`${s}Shoulder`] = dir(`${s}Shoulder`, `${s}Arm`);
    axis[`${s}Arm`] = dir(`${s}Arm`, `${s}ForeArm`);
    axis[`${s}ForeArm`] = dir(`${s}ForeArm`, `${s}Hand`);
    axis[`${s}Hand`] = new Vector3(0, 0, 1); // 手の ひらは 地面に 平ら、指が 前
  }
  const side: Record<string, Vector3> = {};
  const tiltDeg: Record<string, number> = {};
  for (const n of Object.keys(model.joints)) {
    tiltDeg[n] = TORSO.has(n) || n === 'Hips' ? c.torsoTiltDeg : c.armTiltDeg;
    if (TORSO.has(n)) side[n] = new Vector3(1, 0, 0);
  }
  return { map: SRC_BONE, axis, side, tiltDeg, follow: { ...c.follow }, rootTiltDeg: c.rootTiltDeg, loop: c.loop, contactSpeed: c.contactSpeed, contactBlur: c.contactBlur };
}

/** 箱の 関節の 親子（Group の 名前から） */
export function skeletonOf(model: BigModel): Skeleton {
  const names = Object.keys(model.joints) as JointName[]; // 親が 先の 並び
  const parent: Record<string, string | null> = {};
  for (const n of names) {
    const p = model.joints[n].parent?.name;
    parent[n] = p && names.includes(p as JointName) ? p : null;
  }
  return { names, parent };
}

/** 調整表の クリップ設定を うつし方に（強さの 書いて ない 関節は 0） */
export function retargetOpts(c: { pitchDeg: number; ref: string; mirror: boolean; strength: Record<string, number> }): RetargetOpts {
  const ref = /^\d+$/.test(c.ref) ? Number(c.ref) : c.ref === 'first' ? 'first' : 'mean';
  return { pitchDeg: c.pitchDeg, ref, mirror: c.mirror, strength: { ...c.strength } };
}

/** 箱の 世界での 場所（毎コマ 更新。マスの 判定に 使う） */
interface Box {
  name: string;
  joint: JointName;
  c: [number, number, number];
  /** 3 本の 軸（9 つ） */
  ax: number[];
  half: [number, number, number];
  /** 世界の 軸に そろえた はんぶんの 大きさ（余白 込み） */
  ext: [number, number, number];
}

function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;

export interface ActorWork {
  /** 関節を うごかした 数 */
  joints: number;
  /** 回転の 補間の 数 */
  interps: number;
  /** 行列を 更新した 物の 数（Group） */
  matrices: number;
  /** 当たりの 箱の 更新の 数 */
  boxes: number;
  /** 直前の「このマスは 固いか」で 調べた 箱の 数（さいごの 1 回） */
  lastQueryBoxes: number;
  /** 動いた コマで 1 コマの 仕事の 合計の 目安 */
  total: number;
}

export class BigActor {
  readonly model: BigModel;
  readonly pos = new Vector3();
  yaw = 0;
  mode: ActorMode = 'idle';
  /** 目の いろ 0 = 白 〜 1 = 赤 */
  eyeMix = 0;
  /** 怒りの のこり（秒）。0 = 白目 */
  angryLeft = 0;
  wanderOn = true;
  /** いま めざして いる 場所 */
  target: { x: number; z: number } | null = null;
  /** 1 コマに 進む 距離を 計った もの（ブロック / 秒） */
  speedNow = 0;
  readonly work: ActorWork = { joints: 0, interps: 0, matrices: 0, boxes: 0, lastQueryBoxes: 0, total: 0 };
  /** 動きの 速さ（再生の 速さ）と 進む 速さ（ブロック / 秒。手が すべらない 値を クリップから 出す）。rebake で 調整表から 読む */
  crawlRate = 1;
  crawlSpeed = 1.5;
  /** 素材の 長さ → 箱の もとの 座標（手が すべらない 歩幅の 倍率。fitStride） */
  strideScale = 1;
  /** 後ろへ さがる（back(true) の 間） */
  backOn = false;
  /** 前へ 進む 1 歩（ためる → たたきつける → 引きよせる） */
  step!: StepCrawler;
  /** 1 歩の 姿勢の 重み（0 = ふだんの 姿勢、1 = 歩く 姿勢）と めざす 重み・切りかえの 秒 */
  stepW = 0;
  private stepWant = 0;
  private stepFade = 0.5;
  /** 1 歩の 区切り（振り上げの はじまり）。ここで 着いたか 決める */
  private stepBoundary = false;
  /** 次の 1 歩の 区切りで 止まる（goTo の 行き先が もう 半歩 より 近い） */
  private stopAtBoundary = false;
  /** さいごに たたきつけた 所（世界の 座標） */
  lastSlam: { x: number; y: number; z: number; side: Side; step: number } | null = null;
  /** さいごに 手を つきなおした 所（世界の 座標） */
  lastTap: { x: number; y: number; z: number; side: Side; step: number } | null = null;

  private readonly boxes: Box[] = [];
  private readonly player: MotionPlayer;
  private baked: { crawl: BakedClip; back: BakedClip; lookBack: BakedClip };
  private readonly clips: ActorClips;
  /** 手を 地面に ついて いる コマの 数 など（はう・さがる の クリップ）*/
  plant: PlantReport[] = [];
  private rnd: () => number;
  private home = new Vector3();
  private pauseLeft = 0;
  /** あと この 秒 はい回ったら 長い 休みに はいる */
  walkLeft = 0;
  /** 長い 休みの のこり（秒）。0 = 休んで いない */
  restLeft = 0;
  private lastWork = 0;
  private dirty = true;
  private matrixCount = 0;
  private readonly oldM = new Matrix4();
  private readonly dM = new Matrix4();
  private readonly tv = new Vector3();
  private readonly tq = new Quaternion();
  private readonly ts = new Vector3();
  private readonly ts2 = new Vector3();
  private rideJoint: JointName | null = null;
  private stamp = 0;
  private readonly names: JointName[];
  private readonly jointIndex: Map<JointName, number>;
  private readonly jointCache: { q: Quaternion; sc: Vector3; stamp: number }[];
  private eyeShown = -1;
  private bbox = { lo: [0, 0, 0], hi: [0, 0, 0] };
  /** 手を うごかさない（ride の テスト用に 外から 止める） */
  frozen = false;

  constructor(model: BigModel, clips: ActorClips, readonly env: ActorEnv, seed = 293) {
    this.model = model;
    this.names = Object.keys(model.joints) as JointName[];
    this.jointIndex = new Map(this.names.map((n, i) => [n, i] as const));
    this.jointCache = this.names.map(() => ({ q: new Quaternion(), sc: new Vector3(), stamp: 0 }));
    this.rnd = makeRnd(seed);
    this.clips = clips;
    this.baked = { crawl: null as never, back: null as never, lookBack: null as never };
    this.player = new MotionPlayer(this.names.length);
    for (const h of model.hits) {
      this.boxes.push({ name: h.name, joint: h.joint, c: [0, 0, 0], ax: new Array<number>(9).fill(0), half: [0, 0, 0], ext: [0, 0, 0] });
    }
    model.group.traverse(() => { this.matrixCount++; });
    this.rebake();
  }

  /** 置く（地面の 高さ y は 呼ぶ 側で 決める）。さまよう 中心も ここに なる */
  place(x: number, y: number, z: number, yaw: number): void {
    this.pos.set(x, y, z);
    this.home.set(x, y, z);
    this.yaw = yaw;
    this.target = null;
    this.mode = 'idle';
    this.player.play(null, { fade: 0 });
    this.stepW = 0; this.stepWant = 0; this.step.reset();
    this.pauseLeft = this.randIn(T.wander.pauseSec);
    this.restLeft = 0;
    this.walkLeft = this.randIn(T.wander.walkSec);
    this.applyTransform();
    this.applyPose(true);
    this.model.group.updateMatrixWorld(true);
    this.updateBoxes();
    this.eyeShown = -1;
    this.applyEyes();
    this.dirty = false;
  }

  // ---------------------------------------------------------------- うつした 動きを 作る
  /** 調整表から クリップを うつして 焼く。体の 進みは 手が すべらない 倍率（fitStride）。ついている 手は 世界で 止まる ように 腕を 作りなおす（plantHands） */
  rebake(): void {
    const C = T.crawl;
    this.crawlRate = C.motionRate;
    const sk = skeletonOf(this.model);
    const clips = this.clips;
    const ao = aimOpts(this.model, T.clips.crawl);
    const up = aimClip(clips.climbUp, ao, sk), down = aimClip(clips.climbDown, ao, sk);
    // 歩幅の 倍率は 進む クリップで 決めて、さがる クリップにも おなじ 倍率を 使う（体の 大きさの 比なので）
    this.strideScale = fitStride(this.model, up, up.rootSrc, up.strideSrc, C.contactTol) * C.strideMul;
    for (const c of [up, down]) {
      c.root = c.rootSrc.map((v) => v * this.strideScale);
      c.stride = c.strideSrc * this.strideScale;
      c.sway = c.swaySrc.map((v) => v * this.strideScale);
    }
    this.baked = { crawl: up, back: down, lookBack: bakeClip(clips.lookBack, retargetOpts(T.clips.lookBack), sk) };
    // 進む 速さ（ブロック / 実時間の 秒）= 1 まわりの 長さ × 拡大 × 動きの 速さ ÷ 1 まわりの 秒
    this.crawlSpeed = (up.stride! * this.model.scale * this.crawlRate) / up.duration;
    this.plant = [up, down].map((c) => plantHands(this.model, [c], { tol: C.contactTol, spread: C.plantSpread, speed: 0, lift: C.liftHeight, center: true })[0]!);
    // 前へ 進む 1 歩（調整表の crawl を その まま 読む）。速さの 目安 = 1 歩の 長さ ÷ 1 歩の 秒
    this.step = new StepCrawler(this.model, T.crawl);
    this.crawlSpeed = (this.step.stride * this.model.scale) / this.step.stepSec();
    this.stepW = 0; this.stepWant = 0;
  }

  private randIn(r: readonly [number, number]): number { return r[0] + this.rnd() * (r[1] - r[0]); }

  // ---------------------------------------------------------------- 外から よぶ もの
  walk(on: boolean): void {
    this.wanderOn = on;
    if (!on) { this.target = null; if (this.mode === 'crawl') this.toIdle(); }
  }

  /** 後ろへ さがる（climbing down wall を 倒した 動き）。on の 間 さがりつづける。怒って いる 間は むし */
  back(on: boolean): void {
    this.backOn = on;
    if (on) {
      if (this.mode === 'angry') return;
      this.target = null;
      this.restLeft = 0;
      this.mode = 'back';
      this.fadeStep(0, T.crawl.startFadeSec);
      if (this.player.clip !== this.baked.back) this.player.play(this.baked.back, { fade: T.crawl.startFadeSec, rate: this.crawlRate, loop: true });
    } else if (this.mode === 'back') this.toIdle();
  }

  /** 長い 休みに はいる（その場で 体を 動かさない）。sec を 書かなければ 調整表の restSec。怒って いる 間は むし */
  rest(sec?: number): void {
    if (this.mode === 'angry') return;
    this.startRest(sec ?? T.wander.restSec);
  }

  private startRest(sec: number): void {
    this.restLeft = Math.max(0, sec);
    this.target = null;
    this.pauseLeft = this.randIn(T.wander.pauseSec);
    if (this.mode === 'crawl' || this.mode === 'back') { this.backOn = false; this.toIdle(); }
  }

  goTo(x: number, z: number): void {
    this.restLeft = 0; // 行き先を 言われたら 休みは やめる
    this.target = { x, z };
    this.backOn = false;
    this.stopAtBoundary = this.mode === 'crawl' && Math.hypot(x - this.pos.x, z - this.pos.z) < this.step.strideFull * this.model.scale * 0.5;
    if (this.mode === 'idle' || this.mode === 'look' || this.mode === 'back') this.startCrawl();
  }

  lookBack(): void {
    if (this.mode === 'angry') return;
    this.mode = 'look';
    this.target = null;
    this.player.play(this.baked.lookBack, { fade: T.clips.fadeSec / T.lookBack.rate, rate: T.lookBack.rate, loop: false });
  }

  /** プレイヤーの 攻撃が 当たった */
  hit(): void {
    this.angryLeft = T.angry.calmSec;
    this.restLeft = 0; // 怒ったら 休みは 中断（白目に もどったら また 歩き出す）
    this.walkLeft = this.randIn(T.wander.walkSec);
    this.backOn = false;
    if (this.mode !== 'angry') { this.mode = 'angry'; this.target = null; this.player.play(null, { fade: T.clips.idleFadeSec }); this.fadeStep(0, T.clips.idleFadeSec); }
  }

  angry(on: boolean): void {
    if (on) this.hit();
    else this.calm();
  }

  private calm(): void {
    this.angryLeft = 0;
    if (this.mode === 'angry') { this.mode = 'idle'; this.pauseLeft = this.randIn(T.wander.pauseSec); }
  }

  private startCrawl(): void {
    this.mode = 'crawl';
    // 歩く 姿勢が すっかり 消えて いれば 休みの 姿勢から（左の 腕から）はじめる。消えかけ なら 続きから
    if (this.stepW <= 0) { this.step.reset(); this.stepBoundary = true; }
    if (this.player.clip) this.player.play(null, { fade: T.crawl.startFadeSec });
    this.fadeStep(1, T.crawl.startFadeSec);
  }

  private fadeStep(want: number, sec: number): void {
    this.stepWant = want;
    this.stepFade = Math.max(1e-3, sec);
  }

  /** 手が 地面を たたいた: 手の ひらの まんなかを 世界の 座標で 知らせる（slam = たたきつけ、tap = つきなおし） */
  private emitImpact(kind: 'slam' | 'tap', side: Side): void {
    const p = this.step.palm(side), s = this.model.scale;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const x = this.pos.x + (p.x * c + p.z * sn) * s, z = this.pos.z + (-p.x * sn + p.z * c) * s;
    const e = { x, y: this.pos.y, z, side, step: this.step.steps };
    if (kind === 'slam') { this.lastSlam = e; this.env.onSlam?.(x, this.pos.y, z, side); }
    else { this.lastTap = e; this.env.onTap?.(x, this.pos.y, z, side); }
  }

  /** はう / さがる クリップを 再生して いる 間、この コマで 体が 進む 長さ（ブロック。後ろは −）。rate = この コマの 動きの 速さ */
  private crawlStep(dt: number, rate: number): number {
    const c = this.player.clip;
    if (!c || c.root === undefined) return 0;
    const t0 = this.player.time;
    return (clipProgress(c, t0 + dt * rate) - clipProgress(c, t0)) * this.model.scale;
  }

  /** 体を 向きの 方へ step（ブロック）だけ 動かし、地面の 高さに ついて いく */
  private advance(step: number, dt: number): boolean {
    let moved = false;
    if (step !== 0) {
      this.pos.x += Math.sin(this.yaw) * step;
      this.pos.z += Math.cos(this.yaw) * step;
      moved = true;
    }
    this.speedNow = Math.abs(step) / dt;
    const gy = this.groundTarget();
    const maxD = T.ground.followSpeed * dt;
    const dy = gy - this.pos.y;
    this.pos.y += Math.abs(dy) <= maxD ? dy : Math.sign(dy) * maxD;
    return moved || Math.abs(dy) > 1e-6;
  }

  private toIdle(): void {
    this.mode = 'idle';
    this.player.play(null, { fade: T.clips.idleFadeSec });
    this.fadeStep(0, T.clips.idleFadeSec);
  }

  // ---------------------------------------------------------------- 1 コマ
  update(dt: number): void {
    if (this.frozen) return;
    // 1. 上に のっている 人（動かす 前の 関節の 行列を おぼえる）
    const env = this.env;
    let ride: { x: number; y: number; z: number } | null = null;
    this.rideJoint = null;
    if (env.carryPlayer) {
      const p = env.player();
      const bi = this.boxUnder(p.x, p.y, p.z);
      if (bi >= 0) {
        this.rideJoint = this.boxes[bi]!.joint;
        this.oldM.copy(this.model.joints[this.rideJoint].matrixWorld);
        ride = p;
      }
    }

    // 2. ふるまい
    const moved = this.think(dt);

    // 3. 目の 色
    this.updateEyes(dt);

    // 4. 姿勢 と 場所
    this.player.update(dt);
    const w0 = this.stepW;
    if (this.stepW !== this.stepWant) {
      const k = dt / this.stepFade;
      this.stepW = this.stepWant > this.stepW ? Math.min(this.stepWant, this.stepW + k) : Math.max(this.stepWant, this.stepW - k);
    }
    const poseNow = this.player.work > 0 || this.lastWork > 0 || this.stepW > 0 || w0 > 0;
    this.lastWork = this.player.work;
    this.work.interps = this.player.work;
    this.work.joints = 0; this.work.matrices = 0; this.work.boxes = 0;
    if (poseNow) this.applyPose(false);
    if (moved || poseNow || this.dirty) {
      this.applyTransform();
      this.model.group.updateMatrixWorld(true);
      this.work.matrices = this.matrixCount;
      this.updateBoxes();
      this.dirty = false;
    }
    this.work.total = this.work.joints + this.work.interps + this.work.matrices + this.work.boxes;

    // 5. のっている 人を いっしょに 動かす
    if (ride && this.rideJoint && env.carryPlayer) {
      const j = this.model.joints[this.rideJoint];
      // T = 新しい 行列 × 古い 行列の 逆。のっている 点が この 関節に ついて 動いた ぶん
      this.dM.copy(this.oldM).invert().premultiply(j.matrixWorld);
      this.tv.set(ride.x, ride.y, ride.z).applyMatrix4(this.dM);
      this.dM.decompose(this.ts, this.tq, this.ts2);
      const fwd = this.ts.set(0, 0, 1).applyQuaternion(this.tq);
      const dYaw = T.ride.turnWithBody ? Math.atan2(fwd.x, fwd.z) : 0;
      const dx = this.tv.x - ride.x, dy = this.tv.y - ride.y, dz = this.tv.z - ride.z;
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1e-7 || Math.abs(dYaw) > 1e-9) env.carryPlayer(dx, dy, dz, -dYaw / DEG);
    }
  }

  /** ふるまい。からだが 動いた（位置か 向きが かわった）か を 返す */
  private think(dt: number): boolean {
    let moved = false;
    // 怒り
    if (this.angryLeft > 0) {
      this.angryLeft -= dt;
      if (this.angryLeft <= 0) this.calm();
    }
    if (this.mode === 'angry') {
      const p = this.env.player();
      const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      moved = this.turnToward(want, T.angry.turnDegPerSec * DEG * dt);
      this.speedNow = 0;
      return moved;
    }
    // 長い 休み（はい回った 時間が たまったら 5 分 止まる）
    if (this.restLeft > 0) {
      this.restLeft -= dt;
      if (this.restLeft <= 0) { this.restLeft = 0; this.walkLeft = this.randIn(T.wander.walkSec); this.pauseLeft = 0; }
    } else if (this.wanderOn) {
      this.walkLeft -= dt;
      if (this.walkLeft <= 0) this.startRest(T.wander.restSec);
    }
    if (this.mode === 'back') {
      this.player.setRate(this.crawlRate);
      return this.advance(this.crawlStep(dt, this.crawlRate), dt);
    }
    if (this.mode === 'look') {
      this.speedNow = 0;
      if (this.player.timeLeft() <= 0) { this.toIdle(); this.pauseLeft = this.randIn(T.wander.pauseSec); }
      return false;
    }
    if (this.mode === 'idle') {
      this.speedNow = 0;
      if (this.target) { this.startCrawl(); return false; }
      if (this.restLeft > 0) {
        // 休んで いる 間は 体を 動かさない。ときどき 首を ふる（ふり返りの 動き）
        this.pauseLeft -= dt;
        if (this.pauseLeft <= 0) { this.pauseLeft = this.randIn(T.wander.pauseSec); if (this.rnd() < T.wander.restLookChance) this.lookBack(); }
        return false;
      }
      if (this.wanderOn) {
        this.pauseLeft -= dt;
        if (this.pauseLeft <= 0) this.pickTarget();
      }
      return false;
    }
    // crawl（1 歩 = ためる → たたきつける → 引きよせる）
    const t = this.target;
    if (!t) { this.toIdle(); return false; }
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const C = this.step;
    // 1 歩の 区切りで 着いたか 決める（1 歩が 大きい ので、のこりが 半歩 より 近ければ 止まる）
    if (this.stepBoundary) {
      this.stepBoundary = false;
      // goTo の とき もう 半歩 より 近かった（stopAtBoundary）ときも、いまの 1 歩を おえて 止まる
      const near = this.stopAtBoundary;
      this.stopAtBoundary = false;
      if (near || dist < T.wander.arriveDist || dist < C.strideFull * this.model.scale * 0.5) {
        this.target = null;
        this.toIdle();
        this.pauseLeft = this.randIn(T.wander.pauseSec);
        if (this.wanderOn && this.rnd() < T.wander.lookBackChance) this.lookBack();
        return false;
      }
    }
    const want = Math.atan2(dx, dz);
    const err = Math.abs(wrapPi(want - this.yaw));
    // 体ごと 向きを かえる（ついている 手は 世界で 止める ように からだの 座標で 逆に 回す）
    {
      const y0 = this.yaw;
      moved = this.turnToward(want, T.crawl.turnDegPerSec * DEG * dt);
      C.rotate(wrapPi(this.yaw - y0));
    }
    // 向きが 大きく ずれて いる 間は 次の 1 歩を 短く する
    const lim = T.crawl.moveAngleDeg * DEG;
    C.strideMul = Math.max(0, Math.min(1, 1 - (err - lim) / lim));
    const ev = C.update(dt);
    if (ev.stepStart) this.stepBoundary = true;
    const mv = this.advance(ev.advance * this.model.scale, dt) || moved;
    // 体を 進めた あとの 場所で 知らせる（手の ひらは からだの 座標なので）
    if (ev.slam) this.emitImpact('slam', ev.slam);
    if (ev.tap) this.emitImpact('tap', ev.tap);
    return mv;
  }

  private turnToward(want: number, maxStep: number): boolean {
    const d = wrapPi(want - this.yaw);
    if (Math.abs(d) < 1e-6) return false;
    this.yaw = wrapPi(this.yaw + Math.max(-maxStep, Math.min(maxStep, d)));
    return true;
  }

  private pickTarget(): void {
    const W = T.wander;
    const r = W.minDist + this.rnd() * Math.max(0, W.radius - W.minDist);
    // 今の 向きから 左右 maxTurnDeg いない（体の 向きを かえるのは おそい ので）
    let a = this.yaw + (this.rnd() * 2 - 1) * W.maxTurnDeg * DEG;
    let x = this.pos.x + Math.sin(a) * r, z = this.pos.z + Math.cos(a) * r;
    if (Math.hypot(x - this.home.x, z - this.home.z) > W.radius) {
      // 中心から はなれすぎ: 中心の 方向へ（向きを かえるのが おそくても しかたない）
      a = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z) + (this.rnd() * 2 - 1) * 0.3;
      x = this.pos.x + Math.sin(a) * r; z = this.pos.z + Math.cos(a) * r;
    }
    this.target = { x, z };
    this.startCrawl();
  }

  /** 手・からだの 下の 点から 地面の 高さを 決める（place と おなじ） */
  groundTarget(): number {
    const s = this.model.scale;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    let best = T.place.groundPick === 'min' ? Infinity : -Infinity;
    for (const q of this.model.groundPts) {
      // Y 軸まわりに yaw 回した ときの 世界の 位置（three の rotation.y と おなじ）
      const wx = (q.x * c + q.z * sn) * s, wz = (-q.x * sn + q.z * c) * s;
      const h = this.env.groundY(Math.floor(this.pos.x + wx), Math.floor(this.pos.z + wz)) + 1;
      best = T.place.groundPick === 'min' ? Math.min(best, h) : Math.max(best, h);
      if (T.place.groundPick === 'center') return h;
    }
    return best;
  }

  private updateEyes(dt: number): void {
    const want = this.angryLeft > 0 ? 1 : 0;
    if (this.eyeMix !== want) {
      const k = dt / Math.max(1e-3, T.eyes.fadeSec);
      this.eyeMix = want > this.eyeMix ? Math.min(want, this.eyeMix + k) : Math.max(want, this.eyeMix - k);
    }
    if (this.eyeShown !== this.eyeMix) this.applyEyes();
  }

  applyEyes(): void {
    const m = this.model;
    const c = m.eyes.color;
    const lo = T.eyes.calmColor, hi = T.eyes.angryColor;
    const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    const k = this.eyeMix;
    const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255] as const;
    const A = rgb(lo), B = rgb(hi);
    c.setRGB(lerp(A[0], B[0], k) / 255, lerp(A[1], B[1], k) / 255, lerp(A[2], B[2], k) / 255);
    m.eyeHalo.color.copy(c);
    m.brow.visible = k > 0.5;
    this.eyeShown = k;
  }

  private applyPose(force: boolean): void {
    if (force) { for (const q of this.player.pose) q.set(0, 0, 0, 1); }
    const m = this.model;
    const w0 = this.stepW, w = w0 * w0 * (3 - 2 * w0), sp = this.step.pose; // 切りかえは なめらかに
    for (let i = 0; i < this.names.length; i++) {
      const q = m.joints[this.names[i]!].quaternion.copy(this.player.pose[i]!);
      if (w >= 1) q.copy(sp[i]!);
      else if (w > 0) q.slerp(sp[i]!, w);
    }
    this.work.joints = this.names.length;
  }

  private applyTransform(): void {
    const g = this.model.group;
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;
    g.scale.setScalar(this.model.scale);
  }

  // ---------------------------------------------------------------- 当たりの 箱
  /** 箱の 世界での 場所を 更新（関節の いまの 姿勢）。group の 行列は 先に 更新して おく */
  updateBoxes(): void {
    const m = this.model;
    const q = this.tq, sc = this.ts, pos = this.tv;
    const stamp = ++this.stamp;
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    const mg = T.collide.margin, lift = T.collide.topLift;
    const v = new Vector3();
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i]!, h = m.hits[i]!;
      const jg = m.joints[b.joint];
      const ji = this.jointIndex.get(b.joint)!;
      const cj = this.jointCache[ji]!;
      if (cj.stamp !== stamp) { jg.matrixWorld.decompose(pos, q, sc); cj.q.copy(q); cj.sc.copy(sc); cj.stamp = stamp; }
      v.copy(h.c).sub(m.rest[b.joint]).applyMatrix4(jg.matrixWorld);
      b.c[0] = v.x; b.c[1] = v.y; b.c[2] = v.z;
      for (let k = 0; k < 3; k++) {
        v.copy(h.axes[k]!).applyQuaternion(cj.q);
        b.ax[k * 3] = v.x; b.ax[k * 3 + 1] = v.y; b.ax[k * 3 + 2] = v.z;
      }
      b.half[0] = h.half[0] * cj.sc.x; b.half[1] = h.half[1] * cj.sc.y; b.half[2] = h.half[2] * cj.sc.z;
      const hx = b.half[0] + mg, hy = b.half[1] + mg + lift, hz = b.half[2] + mg;
      for (let d = 0; d < 3; d++) b.ext[d] = Math.abs(b.ax[d]!) * hx + Math.abs(b.ax[3 + d]!) * hy + Math.abs(b.ax[6 + d]!) * hz;
      lo0 = Math.min(lo0, b.c[0] - b.ext[0]); hi0 = Math.max(hi0, b.c[0] + b.ext[0]);
      lo1 = Math.min(lo1, b.c[1] - b.ext[1]); hi1 = Math.max(hi1, b.c[1] + b.ext[1]);
      lo2 = Math.min(lo2, b.c[2] - b.ext[2]); hi2 = Math.max(hi2, b.c[2] + b.ext[2]);
    }
    this.bbox = { lo: [lo0, lo1, lo2], hi: [hi0, hi1, hi2] };
    this.work.boxes = this.boxes.length;
  }

  /** マス（i, j, k）の 中心が 入る 箱の 番号（なければ -1）。voxelize と おなじ きまり（j < 0 は 地面の 下なので なし） */
  boxAt(i: number, j: number, k: number): number {
    const bb = this.bbox;
    const cx = i + 0.5, cy = j + 0.5, cz = k + 0.5;
    if (j < 0 || cx < bb.lo[0]! || cx > bb.hi[0]! || cy < bb.lo[1]! || cy > bb.hi[1]! || cz < bb.lo[2]! || cz > bb.hi[2]!) { this.work.lastQueryBoxes = 0; return -1; }
    const mg = T.collide.margin, lift = T.collide.topLift;
    let tested = 0, found = -1;
    for (let n = 0; n < this.boxes.length; n++) {
      const b = this.boxes[n]!;
      const dx = cx - b.c[0], dy = cy - b.c[1], dz = cz - b.c[2];
      if (Math.abs(dx) > b.ext[0] || Math.abs(dy) > b.ext[1] || Math.abs(dz) > b.ext[2]) continue;
      tested++;
      const a = b.ax;
      const u = dx * a[0]! + dy * a[1]! + dz * a[2]!;
      const vv = dx * a[3]! + dy * a[4]! + dz * a[5]! - lift / 2;
      const w = dx * a[6]! + dy * a[7]! + dz * a[8]!;
      if (Math.abs(u) <= b.half[0] + mg && Math.abs(vv) <= b.half[1] + mg + lift / 2 && Math.abs(w) <= b.half[2] + mg) {
        // うでの 箱を 優先（雲より 動くので）
        if (found < 0 || (this.boxes[found]!.joint === 'Hips' && b.joint !== 'Hips')) found = n;
        if (b.joint !== 'Hips') break;
      }
    }
    this.work.lastQueryBoxes = tested;
    return found;
  }

  solid(i: number, j: number, k: number): boolean { return this.boxAt(i, j, k) >= 0; }

  /** 足もとの すぐ 下の マスが どの 箱か（のっている 箱）。足が 地面に のって いる ときだけ */
  boxUnder(x: number, y: number, z: number): number {
    const i = Math.floor(x), j = Math.floor(y + 0.02) - 1, k = Math.floor(z);
    const a = this.boxAt(i, j, k);
    return a >= 0 ? a : this.boxAt(i, j - 1, k); // うすい 箱が かたむいて も のりつづける ように 2 マス 下まで 見る
  }

  /** いまの 当たりの 箱の 数 */
  get boxCount(): number { return this.boxes.length; }

  /** 当たりの 箱（世界の 座標。毎コマ 更新される）。プレイヤーの 攻撃を 受ける 口が 読む（gashaBigHit.ts） */
  get boxList(): readonly Box[] { return this.boxes; }
}
