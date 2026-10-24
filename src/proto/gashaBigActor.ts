/**
 * #293 試作: 大きい がしゃどくろ（第一形態）の うごき。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ・前へ 進む: 1 歩 = ためる（腕を 振り上げる）→ たたきつける（打撃・衝撃波の できごと）→ 引きよせる（gashaBigStep.ts。キーの 姿勢を イージングで つなぐ）。
 *  ・さがる・ふり返る は Meshy の モーションを 箱の 関節へ うつす（gashaBigMotion.ts）。さがる ときは 体を クリップの こしの 動きだけ 進める（gashaBigPlant.ts）。
 *  ・ふだんは 白目で ゆっくり はって さまよう（シード付き 乱数）。攻撃されると 赤い 目で 怒り、止まって プレイヤーの 方を 向く。20 秒 攻撃されないと 白目に もどる。
 *  ・当たり（見えない 箱）は 毎コマ 作りなおさず、箱の いまの 場所を 毎コマ 更新して「このマスは 固いか」を その場で 聞く（マスの 集合を 作らない）。
 *  ・上に のっている プレイヤーは、のっている 箱が 動いた ぶん（位置と 向き）いっしょに 動かす。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { maskHas, type BigModel, type GlassMask, type JointName } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';
import { aimClip, bakeClip, clipProgress, MotionPlayer, type AimClipJson, type AimOpts, type BakedClip, type ClipJson, type RetargetOpts, type Skeleton } from './gashaBigMotion';
import { fitStride, plantHands, type PlantReport } from './gashaBigPlant';
import { StepCrawler, type Side } from './gashaBigStep';
import { AttackCycle } from './gashaBigAttack';
import { Slam2 } from './gashaBigSlam2';
import { Sweep } from './gashaBigSweep';
import { Beam } from './gashaBigBeam';
import { Eruption } from './gashaBigEruption';
import { Thunder } from './gashaBigThunder';

export interface ActorEnv {
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** プレイヤーを 動かす（位置の ずれ、向き（度）の ずれ） */
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
  /** 前へ 進む 1 歩で 手を 地面に たたきつけた（手の ひらの まんなか。y は 地面の 高さ）。打撃・衝撃波・ゆれ は 呼ぶ 側 */
  onSlam?(x: number, y: number, z: number, side: Side): void;
  /** 攻撃 1（両手たたきつけ）で 手が 地面に 着いた（両手の まんなか。fx, fz = 体の 前の 向き）。打撃・岩・衝撃波・ゆれ・地形こわし・体の ゆれ は 呼ぶ 側 */
  onSlam2?(x: number, y: number, z: number, fx: number, fz: number): void;
  /** 攻撃が はじまった（'slam2'・'sweep'・'beam'・'eruption'・'thunder'。効果音など 呼ぶ 側の 用） */
  onAttackStart?(name: string): void;
  /** 攻撃 4 で 火柱が 立った（口から 灰を とばしはじめる） */
  onEruptStart?(): void;
  /** 攻撃 5 で 雷が 指へ 落ちはじめた（雷の 絵・音） */
  onThunderStrike?(): void;
  /** 攻撃 5 で 雷が 指に 着いた（電気が はじまる・まわりの 落雷が はじまる） */
  onThunderLand?(): void;
  /** 攻撃 2 で 腕が 払いはじめた（0 = 1 回目、1 = 2 回目） */
  onSweepStroke?(index: number): void;
  /** 引きよせの おわりに つきなおした 手が 地面を たたいた（小さい 衝撃。手の ひらの まんなか） */
  onTap?(x: number, y: number, z: number, side: Side): void;
  /** 攻撃 1（両手たたきつけ）で 手が 地面に 着いた（両手の まんなか。fx, fz = 体の 前の 向き）。打撃・岩・衝撃波・ゆれ・地形こわし・体の ゆれ は 呼ぶ 側 */
  onSlam2?(x: number, y: number, z: number, fx: number, fz: number): void;
}

export type ActorClips = { climbUp: AimClipJson; climbDown: AimClipJson; lookBack: ClipJson };
export type ActorMode = 'idle' | 'crawl' | 'back' | 'look' | 'angry' | 'attack' | 'tired';

/** 予告の 半円（世界の 座標。中心 = 手の 落ちる 所、fx, fz = 体の 前。level = 強さ 0〜1） */
export interface WarnMark { x: number; y: number; z: number; fx: number; fz: number; radius: number; level: number }

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
    axis[`${s}ArmMid`] = dir(`${s}ArmMid`, `${s}ForeArm`); // 上わんの 節を 分けた 関節（親と おなじ 向き）
    axis[`${s}ForeArm`] = dir(`${s}ForeArm`, `${s}Hand`);
    axis[`${s}Hand`] = new Vector3(0, 0, 1); // 手の ひらは 地面に 平ら、指が 前
  }
  const side: Record<string, Vector3> = {};
  const tiltDeg: Record<string, number> = {};
  for (const n of Object.keys(model.joints)) {
    tiltDeg[n] = TORSO.has(n) || n === 'Hips' ? c.torsoTiltDeg : c.armTiltDeg;
    if (TORSO.has(n)) side[n] = new Vector3(1, 0, 0);
  }
  return { map: SRC_BONE, axis, side, tiltDeg, follow: { ...c.follow }, inherit: ['LeftArmMid', 'RightArmMid'], rootTiltDeg: c.rootTiltDeg, loop: c.loop, contactSpeed: c.contactSpeed, contactBlur: c.contactBlur };
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
  /** ガラスの 雲の マス（割れた マスは 当たらない） */
  mask?: GlassMask;
  /** プレイヤーが 置いた ブロック（ちょうど 1 ブロック。余白・持ち上げは なし） */
  exact?: boolean;
}

/** 体に ついて 動く 追加の 箱（置いた ブロック）。座標は Hit と おなじ（もとの 座標・関節の 休みの 姿勢） */
export interface ExtraHit { joint: JointName; c: Vector3; axes: [Vector3, Vector3, Vector3]; half: [number, number, number] }

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
  /** 首の 向き（ラジアン。怒って いる 間 プレイヤーの 方へ。neck と Head に 半分ずつ かける） */
  lookYaw = 0;
  lookPitch = 0;
  /** 首が まわり きって 体が まわって いる 間 true */
  bodyTurning = false;
  private readonly lookQ = new Quaternion();
  private readonly lookQ2 = new Quaternion();
  private readonly lookV = new Vector3();
  private readonly lookV2 = new Vector3();
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

  /** 怒りの 攻撃サイクル（回数・休み。gashaBigAttack.ts） */
  readonly cycle = new AttackCycle();
  /** 両手たたきつけの 動き（gashaBigSlam2.ts） */
  slam2!: Slam2;
  /** 両手で 払う 動き（gashaBigSweep.ts） */
  sweep!: Sweep;
  /** 両手で 払う を 出した 数（テスト用） */
  sweepCount = 0;
  /** 払っている 手の いま（世界の 座標。vx, vz = 手の 水平の 動き 1 秒あたり）。払って いなければ null */
  sweepNow: { side: Side; x: number; y: number; z: number; vx: number; vz: number; stroke: number } | null = null;
  private sweepLast: { x: number; z: number } | null = null;
  private sweepStroke = 0;
  /** 目から 光線の 動き（gashaBigBeam.ts） */
  beam!: Beam;
  /** 目から 光線を 出した 数（テスト用） */
  beamCount = 0;
  /** 口から 火山噴火の 動き（gashaBigEruption.ts） */
  eruption!: Eruption;
  /** 口から 火山噴火を 出した 数（テスト用。灰の 並びの 種にも なる） */
  eruptionCount = 0;
  /** 自分に 落雷の 動き（gashaBigThunder.ts） */
  thunder!: Thunder;
  /** 自分に 落雷を 出した 数（テスト用。まわりの 落雷の 場所の 種にも なる） */
  thunderCount = 0;
  private readonly thL = new Vector3();
  private readonly thR = new Vector3();
  /** 口の 位置の 目印（頭の 関節の 子。口の 前の 少し 外） */
  private mouthAnchor: Object3D | null = null;
  /** 光線の 間 首が 向く 点（世界の 座標。外から 毎コマ 決める。なければ プレイヤー） */
  beamLook: { x: number; y: number; z: number } | null = null;
  /** 攻撃の 名前（attack モードの 間） */
  attackName: string | null = null;
  /** 両手たたきつけを 出した 数（テスト用） */
  slam2Count = 0;
  /** 予告の 半円（なければ null） */
  warn: WarnMark | null = null;
  private slam2Pred = new Vector3();
  private slam2Phase = '';
  private readonly tv2 = new Vector3();
  private tiredT = 0;
  private tiredHands: { l: Vector3; r: Vector3 } | null = null;
  private hitCount = 0;
  private hitBoxes: Box[] = [];
  private xhits: ExtraHit[] = [];
  private xboxes: Box[] = [];
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
      this.boxes.push({ name: h.name, joint: h.joint, c: [0, 0, 0], ax: new Array<number>(9).fill(0), half: [0, 0, 0], ext: [0, 0, 0], mask: h.mask });
    }
    this.hitCount = model.hits.length;
    this.hitBoxes = this.boxes.slice();
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
    this.slam2 = new Slam2(this.step, this.model);
    this.sweep = new Sweep(this.step, this.model);
    this.beam = new Beam();
    this.eruption = new Eruption();
    this.thunder = new Thunder();
    if (!this.mouthAnchor) { this.mouthAnchor = new Object3D(); this.model.joints.Head.add(this.mouthAnchor); }
    this.mouthAnchor.position.set(0, 2.6, 10.8); // 頭の 関節の 座標（口の 前）
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
      if (this.isAngry()) return;
      this.target = null;
      this.restLeft = 0;
      this.mode = 'back';
      this.fadeStep(0, T.crawl.startFadeSec);
      if (this.player.clip !== this.baked.back) this.player.play(this.baked.back, { fade: T.crawl.startFadeSec, rate: this.crawlRate, loop: true });
    } else if (this.mode === 'back') this.toIdle();
  }

  /** 長い 休みに はいる（その場で 体を 動かさない）。sec を 書かなければ 調整表の restSec。怒って いる 間は むし */
  rest(sec?: number): void {
    if (this.isAngry()) return;
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
    if (this.isAngry()) return;
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
    if (!this.isAngry()) { this.mode = 'angry'; this.target = null; this.player.play(null, { fade: T.clips.idleFadeSec }); this.fadeStep(0, T.clips.idleFadeSec); this.cycle.begin(); }
  }

  /** 怒りの 間（ならし・攻撃・つかれて 休む）か */
  isAngry(): boolean { return this.mode === 'angry' || this.mode === 'attack' || this.mode === 'tired'; }

  angry(on: boolean): void {
    if (on) this.hit();
    else this.calm();
  }

  private calm(): void {
    this.angryLeft = 0;
    this.bodyTurning = false;
    this.cycle.reset();
    this.warn = null; this.attackName = null; this.sweepNow = null; this.beamLook = null; this.beam.phase = 'idle'; this.beam.glow = 0; this.eruption.phase = 'idle'; this.eruption.pitch = 0; this.thunder.reset();
    if (this.isAngry()) {
      const was = this.mode;
      this.mode = 'idle'; this.pauseLeft = this.randIn(T.wander.pauseSec);
      if (was !== 'angry') { this.fadeStep(0, T.clips.idleFadeSec); this.eyeShown = -1; }
    }
  }

  // ---------------------------------------------------------------- 攻撃・つかれ
  /** 攻撃を はじめる（デバッグ・サイクルから）。怒って いなければ 怒らせる */
  attack(name: string): void {
    if (!this.isAngry()) this.hit();
    if (this.mode === 'attack') return;
    this.cycle.forceAttack(name);
    this.startAttack(name);
  }

  /** つかれて 休む（デバッグ）。sec を 省くと 調整表 */
  tired(sec?: number): void {
    if (!this.isAngry()) this.hit();
    this.cycle.forceTired(sec);
    this.startTired();
  }

  private startAttack(name: string): void {
    if (name !== 'slam2' && name !== 'sweep' && name !== 'beam' && name !== 'eruption' && name !== 'thunder') { this.cycle.attackEnded(); return; } // まだ ない 攻撃は とばす
    this.mode = 'attack'; this.attackName = name; this.target = null;
    this.player.play(null, { fade: 0 });
    this.sweepStroke = 0;
    this.env.onAttackStart?.(name);
    if (name === 'thunder') {
      // 自分に 落雷: 足は 止めて、左手を 空へ（右手は 地面に ついた まま）
      this.step.reset();
      this.thunder.start(this.thunderCount);
      this.thunderCount++;
      this.stepW = 1; this.stepWant = 1;
      this.eyeShown = -1;
      this.solveThunder();
      return;
    }
    if (name === 'eruption') {
      this.eruption.start();
      this.eruptionCount++;
      this.eyeShown = -1;
      return;
    }
    if (name === 'beam') {
      // 目から 光線: 足は 止めて そのまま。首を ねらう 点へ むける
      this.beam.start();
      this.beamCount++;
      this.beamLook = null;
      this.eyeShown = -1;
      return;
    }
    if (name === 'sweep') {
      this.sweep.start();
      this.sweepCount++;
      this.sweepNow = null; this.sweepLast = null;
      this.stepW = 1; this.stepWant = 1;
      this.eyeShown = -1;
      return;
    }
    this.slam2.start();
    this.slam2Phase = this.slam2.phase;
    this.stepW = 1; this.stepWant = 1;
    this.eyeShown = -1;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), sc = this.model.scale;
    const p = this.slam2.predicted(this.slam2Pred);
    const wx = this.pos.x + (p.x * c + p.z * sn) * sc, wz = this.pos.z + (-p.x * sn + p.z * c) * sc;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), R = T.slam2.warnRadius;
    // 予告の 印は 平らな 板なので、半円の 中の いちばん 高い 地面に そろえる（でこぼこで 地面に うまらない ように）
    let wy = this.pos.y;
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8 - 0.5) * Math.PI;
      for (const k of [0.4, 0.8]) {
        const lx = Math.sin(a) * R * k, lz = Math.cos(a) * R * k;
        wy = Math.max(wy, this.env.groundY(Math.floor(wx + lx * fz + lz * fx), Math.floor(wz - lx * fx + lz * fz)) + 1);
      }
    }
    this.warn = { x: wx, y: wy, z: wz, fx, fz, radius: R, level: this.slam2.warnLevel() };
  }

  private startTired(): void {
    this.mode = 'tired'; this.attackName = null; this.warn = null; this.target = null;
    this.player.play(null, { fade: 0 });
    this.tiredT = 0;
    this.step.reset();
    const r = this.model.rest, K = T.tired, reach = this.step.reach * T.slam2.reachFrac;
    const mk = (sd: 'Left' | 'Right') => {
      const s = sd === 'Left' ? 1 : -1, sh = this.step.shoulderAt(sd, K.leanDeg * DEG, 0, new Vector3());
      const gy = r[`${sd}Hand`].y, x = s * K.handSpread;
      const hor2 = reach * reach - (sh.y - gy) ** 2 - (x - sh.x) ** 2;
      return new Vector3(x, gy, Math.min(K.handZ, hor2 > 0 ? sh.z + Math.sqrt(hor2) : sh.z));
    };
    this.tiredHands = { l: mk('Left'), r: mk('Right') };
    this.stepW = 1; this.stepWant = 1;
    this.eyeShown = -1;
    this.solveTired(0);
  }

  /** 休みの 姿勢（両手を 前の 地面に つく・のめる・頭を 下げる）。e = 0〜1 の なじみ */
  private solveTired(e: number): void {
    const K = T.tired, h = this.tiredHands!;
    const sm = e * e * (3 - 2 * e);
    const L = new Vector3().copy(this.model.rest.LeftHand).lerp(h.l, sm), R = new Vector3().copy(this.model.rest.RightHand).lerp(h.r, sm);
    // 肩で 息: 胸を ゆっくり 前後に ゆらす（手は 地面に ついた まま。IK が 腕を 合わせる）
    const breath = Math.sin((this.tiredT / Math.max(0.5, K.breathSec)) * Math.PI * 2) * K.breathDeg * DEG * sm;
    this.step.poseBoth(L, R, K.leanDeg * DEG * sm + breath, 0, 1, 1);
    for (const g of this.model.swirl.eyes) g.rotation.z = -(this.tiredT * K.swirlDegPerSec * DEG);
    const q = this.lookQ.setFromAxisAngle(this.lookV2.set(1, 0, 0), (K.headDownDeg * DEG * sm) / 2);
    for (const n of ['neck', 'Head'] as const) { const i = this.jointIndex.get(n); if (i !== undefined) this.step.pose[i]!.multiply(q); }
  }

  /** つかれ・攻撃を おえて ふだんの 怒りへ（姿勢は なめらかに もどる） */
  private backToAngry(sec: number): void {
    this.mode = 'angry'; this.attackName = null; this.warn = null; this.tiredHands = null;
    this.fadeStep(0, sec);
    this.eyeShown = -1;
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
    const lookMoving = this.updateLook(dt);
    if (poseNow || lookMoving) this.applyPose(false);
    if (moved || poseNow || lookMoving || this.dirty) {
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

  /** 左手を 空へ 上げて 指さす 姿勢（thunder.raise に 合わせる）。右手は 休みの 位置で 地面に ついた まま */
  private solveThunder(): void {
    const K = T.thunder, r0 = this.model.rest, e = this.thunder.raise;
    const h = this.thL.set(K.raise[0], K.raise[1], K.raise[2]);
    h.lerpVectors(r0.LeftHand, h, e);
    h.x += 6 * Math.sin(Math.PI * e);
    const smooth = (u: number): number => { const t = Math.max(0, Math.min(1, u)); return t * t * (3 - 2 * t); };
    this.step.poseBoth(h, this.thR.copy(r0.RightHand), -K.backLeanDeg * DEG * e, K.twistDeg * DEG * e, 1 - smooth(e / 0.25), 1);
  }

  /** 左手の 指さきの 世界の 位置（指さす 向き = 手の 先） */
  fingerTip(out: Vector3): Vector3 {
    return out.set(0, 0, T.thunder.fingerLen).applyMatrix4(this.model.joints.LeftHand.matrixWorld);
  }

  /** 口の 世界の 位置 */
  mouthPosition(out: Vector3): Vector3 {
    if (!this.mouthAnchor) return out.copy(this.pos);
    return this.mouthAnchor.getWorldPosition(out);
  }

  /** 左右の 目の 世界の 位置（左右の じゅん） */
  eyePositions(out: [Vector3, Vector3]): [Vector3, Vector3] {
    const e = this.model.swirl.eyes;
    e[0]!.getWorldPosition(out[0]);
    e[1]!.getWorldPosition(out[1]);
    return out;
  }

  /** ふるまい。からだが 動いた（位置か 向きが かわった）か を 返す */
  private think(dt: number): boolean {
    let moved = false;
    // 怒り
    if (this.angryLeft > 0) {
      this.angryLeft -= dt;
      if (this.angryLeft <= 0) this.calm();
    }
    if (this.mode === 'attack' && this.attackName === 'thunder') {
      this.speedNow = 0;
      const ev = this.thunder.update(dt);
      if (ev.strike) this.env.onThunderStrike?.();
      if (ev.land) this.env.onThunderLand?.();
      this.solveThunder();
      if (this.thunder.done) {
        this.cycle.attackEnded();
        if (this.cycle.phase === 'tired') this.startTired(); else this.backToAngry(0.3);
      }
      return false;
    }
    if (this.mode === 'attack' && this.attackName === 'eruption') {
      this.speedNow = 0;
      const ev = this.eruption.update(dt);
      if (ev.eruptStart) this.env.onEruptStart?.();
      if (this.eruption.done) {
        this.cycle.attackEnded();
        if (this.cycle.phase === 'tired') this.startTired(); else this.backToAngry(0.3);
      }
      return false;
    }
    if (this.mode === 'attack' && this.attackName === 'beam') {
      this.speedNow = 0;
      this.beam.update(dt);
      this.eyeShown = -1; // 光は 毎コマ 変わる
      if (this.beam.done) {
        this.beamLook = null;
        this.cycle.attackEnded();
        this.eyeShown = -1;
        if (this.cycle.phase === 'tired') this.startTired(); else this.backToAngry(0.3);
      }
      return false;
    }
    if (this.mode === 'attack' && this.attackName === 'sweep') {
      this.speedNow = 0;
      const ev = this.sweep.update(dt);
      void ev.warn;
      if (ev.strokeStart) { this.env.onSweepStroke?.(this.sweepStroke); this.sweepStroke++; }
      if (this.sweep.phase === 'recover' && this.stepWant !== 0) this.fadeStep(0, T.sweep.recoverSec);
      const a = this.sweep.active;
      if (a) {
        const q = this.sweep.palm(a, this.tv2), c = Math.cos(this.yaw), sn = Math.sin(this.yaw), sc = this.model.scale;
        const x = this.pos.x + (q.x * c + q.z * sn) * sc, z = this.pos.z + (-q.x * sn + q.z * c) * sc;
        const l = this.sweepLast;
        this.sweepNow = { side: a, x, y: this.pos.y, z, vx: l ? (x - l.x) / dt : 0, vz: l ? (z - l.z) / dt : 0, stroke: this.sweepStroke };
        this.sweepLast = { x, z };
      } else { this.sweepNow = null; this.sweepLast = null; }
      if (this.sweep.done) {
        this.sweepNow = null;
        this.cycle.attackEnded();
        if (this.cycle.phase === 'tired') this.startTired(); else this.backToAngry(0.3);
      }
      return false;
    }
    if (this.mode === 'attack') {
      this.speedNow = 0;
      const ev = this.slam2.update(dt);
      if (this.slam2.phase !== this.slam2Phase) {
        this.slam2Phase = this.slam2.phase;
        if (this.slam2.phase === 'recover') this.fadeStep(0, T.slam2.recoverSec);
      }
      if (this.warn) this.warn.level = this.slam2.warnLevel();
      if (ev.strike) {
        this.slam2Count++;
        this.warn = null;
        const q = this.slam2.landing(new Vector3()), c = Math.cos(this.yaw), sn = Math.sin(this.yaw), sc = this.model.scale;
        this.env.onSlam2?.(this.pos.x + (q.x * c + q.z * sn) * sc, this.pos.y, this.pos.z + (-q.x * sn + q.z * c) * sc, Math.sin(this.yaw), Math.cos(this.yaw));
      }
      if (this.slam2.done) {
        this.cycle.attackEnded();
        if (this.cycle.phase === 'tired') this.startTired(); else this.backToAngry(0.3);
      }
      return false;
    }
    if (this.mode === 'tired') {
      this.speedNow = 0;
      this.tiredT += dt;
      this.solveTired(Math.min(1, this.tiredT / Math.max(1e-3, T.tired.settleSec)));
      if (this.cycle.update(dt).tiredEnd) this.backToAngry(T.tired.exitSec);
      return false;
    }
    if (this.mode === 'angry') {
      const p = this.env.player();
      const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      // 首が 先: 首が 上限まで まわり きって から 体が まわりはじめる。体が プレイヤーに 向く まで まわり つづけ、体が 追いつく ほど 首は 正面へ もどる
      const diff = wrapPi(want - this.yaw);
      const ym = T.angry.lookYawMaxDeg * DEG;
      if (!this.bodyTurning && Math.abs(diff) > ym && Math.abs(this.lookYaw) >= ym - 0.02) this.bodyTurning = true;
      if (this.bodyTurning && Math.abs(diff) < 2 * DEG) this.bodyTurning = false;
      if (this.bodyTurning) moved = this.turnToward(want, T.angry.turnDegPerSec * DEG * dt);
      this.speedNow = 0;
      const ev = T.attack.enabled ? this.cycle.update(dt) : {};
      if (ev.start) this.startAttack(ev.start);
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
    let k = this.eyeMix;
    const swirl = this.mode === 'tired';
    const glow = this.mode === 'attack' && this.attackName === 'beam' ? this.beam.glow : 0;
    const bk = T.beam;
    m.swirl.root.visible = swirl;
    m.eyes.visible = !swirl; m.eyeHalo.visible = !swirl; // くるくる目の 間は 赤い 目と 光の 輪を かくす
    const rgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255] as const;
    const A = rgb(lo), B = rgb(hi);
    c.setRGB(lerp(A[0], B[0], k) / 255, lerp(A[1], B[1], k) / 255, lerp(A[2], B[2], k) / 255);
    // 目から 光線の 間だけ: 赤黒い 色から 強い 赤へ・光の 輪が 濃く（ふだんは 0.3）
    if (glow > 0) {
      const D = rgb(bk.eyeColorDark), H = rgb(bk.eyeColorHot);
      c.setRGB(lerp(D[0], H[0], glow) / 255, lerp(D[1], H[1], glow) / 255, lerp(D[2], H[2], glow) / 255);
      m.eyeHalo.opacity = 0.3 + (bk.haloMax - 0.3) * glow;
      k = 1;
    } else m.eyeHalo.opacity = 0.3;
    m.eyeHalo.color.copy(c);
    m.brow.visible = k > 0.5;
    this.eyeShown = glow > 0 ? -1 : k;
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
    if (this.lookYaw !== 0 || this.lookPitch !== 0) {
      const e = this.lookQ2.setFromAxisAngle(this.lookV2.set(0, 1, 0), this.lookYaw / 2).multiply(this.lookQ.setFromAxisAngle(this.lookV2.set(1, 0, 0), this.lookPitch / 2));
      for (const n of ['neck', 'Head'] as const) if (m.joints[n]) m.joints[n].quaternion.multiply(e);
    }
  }

  /** 怒って いる 間、首を プレイヤーの 方へ（上限つき・なめらか）。まだ 動いて いる（0 に もどりきって いない）なら true */
  private updateLook(dt: number): boolean {
    const m = this.model, A = T.angry;
    let ty = 0, tp = 0;
    const neck = m.joints.neck, head = m.joints.Head;
    const beamLook = this.mode === 'attack' && this.attackName === 'beam' && this.beam.phase !== 'done';
    const erupting = this.mode === 'attack' && this.attackName === 'eruption';
    if (erupting) tp = -T.eruption.headUpDeg * DEG * this.eruption.pitch; // 上を 向く（首と 頭に 半分ずつ）
    else if (this.mode === 'attack' && this.attackName === 'thunder') tp = -T.thunder.headUpDeg * DEG * this.thunder.raise; // 空を 見あげる
    if ((this.mode === 'angry' || beamLook) && neck && head && neck.parent) {
      const p = this.env.player();
      const hp = this.lookV.setFromMatrixPosition(head.matrixWorld);
      const bl = beamLook ? this.beamLook : null;
      const dir = bl ? this.lookV2.set(bl.x - hp.x, bl.y - hp.y, bl.z - hp.z) : this.lookV2.set(p.x - hp.x, p.y + A.lookEyeHeight - hp.y, p.z - hp.z);
      // 首の 根もとの 向き（1 コマ前の 親の 行列 × いまの 姿勢の 首）
      neck.parent.matrixWorld.decompose(this.tv, this.tq, this.ts);
      const ni = this.names.indexOf('neck');
      const qn = this.lookQ.copy(this.tq).multiply(ni >= 0 ? this.player.pose[ni]! : this.lookQ2.identity());
      dir.applyQuaternion(qn.invert());
      ty = Math.atan2(dir.x, dir.z);
      if (Math.abs(ty) > 2.6 && this.lookYaw !== 0 && Math.sign(ty) !== Math.sign(this.lookYaw)) ty = -ty; // ほぼ 真うしろ: 向きが ぱたぱた かわらない ように 今の 向きの がわに そろえる
      tp = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
      const ym = A.lookYawMaxDeg * DEG, pm = A.lookPitchMaxDeg * DEG;
      ty = Math.max(-ym, Math.min(ym, ty)); tp = Math.max(-pm, Math.min(pm, tp));
    }
    const rate = A.lookTurnDegPerSec * DEG * dt;
    const ease = (cur: number, to: number): number => {
      const d = to - cur;
      const step = rate * Math.min(1, 0.25 + Math.abs(d) / (12 * DEG)); // 近づくほど ゆっくり
      return Math.abs(d) <= step ? to : cur + Math.sign(d) * step;
    };
    const oy = this.lookYaw, op = this.lookPitch;
    this.lookYaw = ease(oy, ty); this.lookPitch = ease(op, tp);
    return this.lookYaw !== 0 || this.lookPitch !== 0 || oy !== 0 || op !== 0;
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
    const mg0 = T.collide.margin, lift0 = T.collide.topLift;
    const v = new Vector3();
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i]!, h = i < this.hitCount ? m.hits[i]! : this.xhits[i - this.hitCount]!;
      const mg = b.exact ? 0 : mg0, lift = b.exact ? 0 : lift0;
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
    this.work.boxes = this.hitCount;
  }

  /** マス（i, j, k）の 中心が 入る 箱の 番号（なければ -1）。voxelize と おなじ きまり（j < 0 は 地面の 下なので なし） */
  boxAt(i: number, j: number, k: number): number {
    const bb = this.bbox;
    const cx = i + 0.5, cy = j + 0.5, cz = k + 0.5;
    if (j < 0 || cx < bb.lo[0]! || cx > bb.hi[0]! || cy < bb.lo[1]! || cy > bb.hi[1]! || cz < bb.lo[2]! || cz > bb.hi[2]!) { this.work.lastQueryBoxes = 0; return -1; }
    const mg0 = T.collide.margin, lift0 = T.collide.topLift;
    let tested = 0, found = -1;
    for (let n = 0; n < this.boxes.length; n++) {
      const b = this.boxes[n]!;
      const mg = b.exact ? 0 : mg0, lift = b.exact ? 0 : lift0;
      const dx = cx - b.c[0], dy = cy - b.c[1], dz = cz - b.c[2];
      if (Math.abs(dx) > b.ext[0] || Math.abs(dy) > b.ext[1] || Math.abs(dz) > b.ext[2]) continue;
      tested++;
      const a = b.ax;
      const u = dx * a[0]! + dy * a[1]! + dz * a[2]!;
      const vv = dx * a[3]! + dy * a[4]! + dz * a[5]! - lift / 2;
      const w = dx * a[6]! + dy * a[7]! + dz * a[8]!;
      if (Math.abs(u) <= b.half[0] + mg && Math.abs(vv) <= b.half[1] + mg + lift / 2 && Math.abs(w) <= b.half[2] + mg && (!b.mask || maskHas(b.mask, u, w, b.half[0], b.half[2]))) {
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
  get boxCount(): number { return this.hitCount; }

  /** 当たりの 箱（世界の 座標。毎コマ 更新される）。プレイヤーの 攻撃を 受ける 口が 読む（gashaBigHit.ts） */
  get boxList(): readonly Box[] { return this.hitBoxes; }

  /** 体に ついて 動く 追加の 箱（置いた ブロック）を 入れかえる。当たりの 箱の 番号（hits）の あとに 足す。boxAt の 答えが hits の 数 以上なら 追加の 箱 */
  setExtras(list: readonly ExtraHit[]): void {
    this.boxes.length = this.hitCount;
    this.xhits = list.slice();
    for (const x of list) this.boxes.push({ name: 'placed', joint: x.joint, c: [0, 0, 0], ax: new Array<number>(9).fill(0), half: [0, 0, 0], ext: [0, 0, 0], exact: true });
    this.xboxes = this.boxes.slice(this.hitCount);
    this.model.group.updateMatrixWorld(true);
    this.updateBoxes();
  }
  /** 追加の 箱（置いた ブロック。setExtras に わたした 順。世界の 座標） */
  get extraBoxes(): readonly Box[] { return this.xboxes; }
  /** 当たりの 箱（hits）の 数。これ 以上の 番号は 追加の 箱 */
  get hitBoxCount(): number { return this.hitCount; }
  /** 箱 n の 関節（追加の 箱も 含む） */
  jointOfBox(n: number): JointName | null { return this.boxes[n]?.joint ?? null; }
}
