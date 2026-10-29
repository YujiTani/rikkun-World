/**
 * #293 試作: 大きい がしゃどくろ（第一形態）の うごき。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ・前へ 進む: 1 歩 = ためる（腕を 振り上げる）→ たたきつける（打撃・衝撃波の できごと）→ 引きよせる（gashaBigStep.ts。キーの 姿勢を イージングで つなぐ）。
 *  ・さがる・ふり返る は Meshy の モーションを 箱の 関節へ うつす（gashaBigMotion.ts）。さがる ときは 体を クリップの こしの 動きだけ 進める（gashaBigPlant.ts）。
 *  ・ふだんは 白目で ゆっくり はって さまよう（シード付き 乱数）。攻撃されると 赤い 目で 怒り、止まって プレイヤーの 方を 向く。20 秒 攻撃されないと 白目に もどる。
 *  ・当たり（見えない 箱）は 毎コマ 作りなおさず、箱の いまの 場所を 毎コマ 更新して「このマスは 固いか」を その場で 聞く（マスの 集合を 作らない）。
 *  ・上に のっている プレイヤーは、のっている 箱が 動いた ぶん（位置と 向き）いっしょに 動かす。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import { Object3D, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBigTypes';
import { TUNE as T } from './gashaBigTuning';
import { aimClip, bakeClip, clipProgress, MotionPlayer, type BakedClip } from './gashaBigMotion';
import { fitStride, plantHands, type PlantReport } from './gashaBigPlant';
import { StepCrawler, type Side } from './gashaBigStep';
import { AttackCycle } from './gashaBigAttack';
import { DEG, wrapPi, type ActorClips, type ActorEnv, type ActorMode, type ActorWork, type Box, type ExtraHit, type WarnMark } from './gashaBigActorBase';
import { aimOpts, retargetOpts, skeletonOf } from './gashaBigActorRig';
import { ActorBoxes } from './gashaBigActorBoxes';
import { AttackRunner, ATTACK_NAMES, type AttackHost } from './gashaBigActorAttack';
import { applyEyeColors, NeckLook } from './gashaBigActorLook';
import { applyBodyTransform, groundHeight, RideCarry, type BodyTilt } from './gashaBigActorBody';

export { aimOpts, retargetOpts, skeletonOf };
export type { ActorClips, ActorEnv, ExtraHit, WarnMark };

function makeRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
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
  private readonly look: NeckLook;
  /** 首の 向き（ラジアン。怒って いる 間 プレイヤーの 方へ。neck と Head に 半分ずつ かける） */
  get lookYaw(): number { return this.look.yaw; }
  get lookPitch(): number { return this.look.pitch; }
  /** 首が まわり きって 体が まわって いる 間 true */
  bodyTurning = false;
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
  /** 少女への 切りかえの 噴火を おえて 上を 向いた まま 固まって いる(mode = 'frozen')。unfreeze() / calm で 解ける */
  held = false;
  /** とどめで lock() された（二度と ふだんの 動きに もどらない。place() で 作りなおす まで）。怒り解除・休み明け・なぐられ・攻撃の 指示でも 固まった まま */
  locked = false;
  /** finale() で はじめた 噴火は おわったら 固まる */
  private finaleOn = false;
  /** 怒って プレイヤーを 追う 1 歩を している 間 true（調整表 chase。1 歩の 途中で 攻撃は はじめない） */
  chasing = false;
  /** 追う 1 歩の 途中で 攻撃の 番に なった とき、1 歩の 区切りまで 待たせて いる 攻撃の 名前 */
  private pendingAttack: string | null = null;
  /** 次の 1 歩の 区切りで 止まる（goTo の 行き先が もう 半歩 より 近い） */
  private stopAtBoundary = false;
  /** さいごに たたきつけた 所（世界の 座標） */
  lastSlam: { x: number; y: number; z: number; side: Side; step: number } | null = null;
  /** さいごに 手を つきなおした 所（世界の 座標） */
  lastTap: { x: number; y: number; z: number; side: Side; step: number } | null = null;

  /** 怒りの 攻撃サイクル（回数・休み。gashaBigAttack.ts） */
  readonly cycle = new AttackCycle();

  /** 口の 位置の 目印（頭の 関節の 子。口の 前の 少し 外） */
  private mouthAnchor: Object3D | null = null;

  private readonly player: MotionPlayer;
  private baked: { crawl: BakedClip; back: BakedClip; lookBack: BakedClip };
  private readonly clips: ActorClips;
  /** 手を 地面に ついて いる コマの 数 など（はう・さがる の クリップ）*/
  plant: PlantReport[] = [];
  private readonly boxes: ActorBoxes;
  private readonly atk: AttackRunner;
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
  private readonly ride = new RideCarry();

  private readonly names: JointName[];
  private readonly jointIndex: Map<JointName, number>;

  private eyeShown = -1;

  /** 手を うごかさない（ride の テスト用に 外から 止める） */
  frozen = false;

  constructor(model: BigModel, clips: ActorClips, readonly env: ActorEnv, seed = 293) {
    this.model = model;
    this.names = Object.keys(model.joints) as JointName[];
    this.jointIndex = new Map(this.names.map((n, i) => [n, i] as const));

    this.rnd = makeRnd(seed);
    this.clips = clips;
    this.baked = { crawl: null as never, back: null as never, lookBack: null as never };
    this.player = new MotionPlayer(this.names.length);
    this.look = new NeckLook(this.names);
    this.boxes = new ActorBoxes(model, this.names, this.jointIndex, this.work);
    this.atk = new AttackRunner(this.attackHost(), this.jointIndex);
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
    this.chasing = false; this.pendingAttack = null; this.held = false; this.finaleOn = false; this.locked = false;
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
    this.atk.rebuild(this.step, this.model);
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
    if (this.locked || this.mode === 'frozen') return; // 固まって いる 間は なぐられても 怒り直さない
    this.angryLeft = T.angry.calmSec;
    this.restLeft = 0; // 怒ったら 休みは 中断（白目に もどったら また 歩き出す）
    this.walkLeft = this.randIn(T.wander.walkSec);
    this.backOn = false;
    if (!this.isAngry()) { this.mode = 'angry'; this.target = null; this.player.play(null, { fade: T.clips.idleFadeSec }); this.fadeStep(0, T.clips.idleFadeSec); this.cycle.begin(); }
  }

  /** 怒りの 間（ならし・攻撃・つかれて 休む）か */
  isAngry(): boolean { return this.mode === 'angry' || this.mode === 'attack' || this.mode === 'tired' || this.mode === 'frozen'; }

  angry(on: boolean): void {
    if (on) this.hit();
    else this.calm();
  }

  private calm(): void {
    this.angryLeft = 0;
    if (this.locked) return; // とどめの あとは 固まった まま（ふだんの 動きに もどらない）
    this.bodyTurning = false;
    this.cycle.reset();
    this.clearAttackState();
    this.held = false; this.finaleOn = false;
    if (this.chasing) { this.chasing = false; this.fadeStep(0, T.clips.idleFadeSec); }
    if (this.isAngry()) {
      const was = this.mode;
      this.mode = 'idle'; this.pauseLeft = this.randIn(T.wander.pauseSec);
      if (was !== 'angry') { this.fadeStep(0, T.clips.idleFadeSec); this.eyeShown = -1; }
    }
  }

  /** 攻撃の 途中の 状態を ぜんぶ 片づける（当たり・予告・払い・光線・噴火・雷の 雲と 電気・待たせた 攻撃）。怒り・サイクルは そのまま */
  private clearAttackState(): void {
    this.atk.clear();
    this.pendingAttack = null;
  }

  /** 攻撃を 中断して 怒りの ならしに もどる（少女への 切りかえなど）。画面の 効果は 呼ぶ 側が 消す。怒り・サイクルの 回数は のこす */
  abortAttack(): void {
    if (this.mode !== 'attack' && this.mode !== 'tired') { this.clearAttackState(); return; }
    this.clearAttackState();
    this.atk.clearTired();
    this.step.reset();
    this.backToAngry(0.3);
    this.cycle.abortToGap();
  }

  // ---------------------------------------------------------------- 攻撃・つかれ
  /** 攻撃を はじめる（デバッグ・サイクルから）。怒って いなければ 怒らせる */
  attack(name: string): void {
    if (this.locked) return;
    if (!this.isAngry()) this.hit();
    if (this.mode === 'attack') return;
    this.cycle.forceAttack(name);
    this.startAttack(name);
  }

  /** つかれて 休む（デバッグ）。sec を 省くと 調整表 */
  tired(sec?: number): void {
    if (this.locked) return;
    if (!this.isAngry()) this.hit();
    this.cycle.forceTired(sec);
    this.startTired();
  }

  /**
   * 少女への 切りかえ: 攻撃の 途中なら 片づけて、必ず 噴火攻撃を する。噴火が おわったら 上を 向いた まま 固まる(held)。
   * 固まらない 設定(freeze.enabled = false)なら ふつうの 噴火を 1 回 するだけ。
   */
  finale(): void {
    if (this.locked || this.mode === 'frozen') return;
    if (!this.isAngry()) this.hit();
    this.abortAttack();
    this.chasing = false;
    this.finaleOn = T.freeze.enabled;
    this.cycle.forceAttack('eruption');
    this.startAttack('eruption');
  }

  /** 固まりを 解いて 怒りの ならしに もどる(体力が 回復する など。ふだんは 使わない) */
  unfreeze(): void {
    if (this.locked || this.mode !== 'frozen') return;
    this.held = false; this.finaleOn = false;
    this.atk.eruption.phase = 'idle'; this.atk.eruption.pitch = 0; this.atk.eruption.hold = false;
    this.angryLeft = T.angry.calmSec;
    this.backToAngry(0.5);
    this.cycle.begin();
  }

  /** とどめ: どんな 状態でも その場で 固まる(攻撃・追いかけは 片づける)。固まった あとは 倒れる・くずれる(setTilt・hideJoint) */
  lock(): void {
    this.locked = true;
    if (this.mode !== 'frozen') {
      this.abortAttack();
      this.chasing = false; this.pendingAttack = null; this.finaleOn = false;
      this.atk.eruption.phase = 'idle'; this.atk.eruption.hold = false;
      this.enterHeld();
    }
    this.held = true;
  }

  // ---------------------------------------------------------------- とどめの あと: 倒れる・しずむ・はがれる
  private readonly tilt: BodyTilt = { roll: 0, pitch: 0, pivotY: 0, liftY: 0 };

  /**
   * 体を 横(roll)・前(pitch)へ ラジアンで かたむけ(土台の 上 pivotY(もとの 座標)の 高さを 中心に)、sink ブロック 地面へ しずめる。固い 当たりも 箱ごと ついて いく。
   * 0, 0, _, 0 で もとに もどす。体は あみを 組んだ 足(はって あるく 形)なので 地面に ぴったり ふせる ことは できない。前へ のめって 手が 地面に うまる 形で「倒れこむ」。
   */
  setTilt(roll: number, pitch: number, pivotY: number, sink: number): void {
    this.tilt.roll = roll; this.tilt.pitch = pitch; this.tilt.pivotY = pivotY;
    this.tilt.liftY = -sink;
    this.dirty = true;
  }

  /** 関節の 箱を 当たりから はずす(くずれて 落ちた)。見た目は 呼んだ 側が 消す */
  hideJoint(j: JointName): void {
    this.boxes.hideJoint(j);
  }

  showAllJoints(): void {
    this.boxes.showAllJoints();
  }

  private enterHeld(): void {
    this.held = true;
    this.mode = 'frozen'; this.atk.attackName = null; this.atk.warn = null; this.target = null;
    this.angryLeft = 0; // 目は 白目に もどる(eyesWhite)。BGM の 頼みも おわる
    this.cycle.reset();
    this.eyeShown = -1;
  }

  private startAttack(name: string): void {
    if (!ATTACK_NAMES.includes(name)) { this.cycle.attackEnded(); return; } // まだ ない 攻撃は とばす
    this.mode = 'attack'; this.target = null;
    this.chasing = false; this.pendingAttack = null;
    this.player.play(null, { fade: 0 });
    this.atk.begin(name);
  }

  private startTired(): void {
    this.clearAttackState(); // 途中の 攻撃の 当たり・雲・電気が のこらない ように
    this.chasing = false;
    this.mode = 'tired'; this.target = null;
    this.player.play(null, { fade: 0 });
    this.atk.beginTired();
  }
  /** つかれ・攻撃を おえて ふだんの 怒りへ（姿勢は なめらかに もどる） */
  private backToAngry(sec: number): void {
    this.mode = 'angry'; this.atk.attackName = null; this.atk.warn = null; this.atk.clearTired();
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
    if (T.chase.holdHeight) return moved; // 出現した 高さを 保って 浮いて 進む（地面に ついて いかない）
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
    this.ride.begin(this.env, this.model, this.boxes);

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
    this.ride.end(this.env, this.model);
  }

  /** 左手の 指さきの 世界の 位置（指さす 向き = 手の 先） */
  fingerTip(out: Vector3): Vector3 {
    return this.atk.fingerTip(out);
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
    if (this.mode === 'frozen') { // 固まり: 動かない・攻撃しない・追わない・向きも かえない(上を 向いた まま)
      this.speedNow = 0;
      return false;
    }
    if (this.mode === 'attack') { // 攻撃 5 種の 1 コマ（gashaBigActorAttack.ts）
      this.speedNow = 0;
      this.atk.update(dt);
      return false;
    }
    if (this.mode === 'tired') {
      this.speedNow = 0;
      if (this.atk.updateTired(dt)) this.backToAngry(T.tired.exitSec);
      return false;
    }
    if (this.mode === 'angry') {
      const p = this.env.player();
      const K = T.chase, chase = K.enabled;
      const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
      // 首が 先: 首が 上限まで まわり きって から 体が まわりはじめる。体が プレイヤーに 向く まで まわり つづけ、体が 追いつく ほど 首は 正面へ もどる
      // 追う とき（chase）は 首が turnStartDeg まで まわったら 体も まわる（歩く 向きが プレイヤーから ずれ つづけない ように）
      const diff = wrapPi(want - this.yaw);
      const ym = T.angry.lookYawMaxDeg * DEG;
      const startRad = chase ? Math.min(ym, K.turnStartDeg * DEG) : ym;
      if (!this.bodyTurning && Math.abs(diff) > startRad && Math.abs(this.look.yaw) >= startRad - 0.02) this.bodyTurning = true;
      if (this.bodyTurning && Math.abs(diff) < 2 * DEG) this.bodyTurning = false;
      if (this.bodyTurning) {
        const y0 = this.yaw;
        moved = this.turnToward(want, (chase ? K.turnDegPerSec : T.angry.turnDegPerSec) * DEG * dt);
        if (this.stepW > 0) this.step.rotate(wrapPi(this.yaw - y0)); // ついている 手は 世界で 止める
      }
      this.speedNow = 0;
      if (chase) moved = this.chaseTick(dt, p, want) || moved;
      const ev = T.attack.enabled ? this.cycle.update(dt) : {};
      if (ev.start) {
        // 追う 1 歩の 途中なら 1 歩の 区切りまで 待つ（腕の 姿勢が とぶのを さける）
        if (this.chasing) this.pendingAttack = ev.start; else this.startAttack(ev.start);
      }
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

  /** 怒って いる 間の 追いかけ（1 歩 = ためる → たたきつける → 引きよせる を 遅い 速さで）。体が 動いたら true */
  private chaseTick(dt: number, p: { x: number; z: number }, want: number): boolean {
    const K = T.chase, C = this.step;
    const dist = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    if (!this.chasing) {
      if (dist <= K.stopDist + K.resumeMargin) return false;
      this.chasing = true;
      if (this.stepW <= 0) C.reset();
      this.stepBoundary = true;
      this.fadeStep(1, T.crawl.startFadeSec);
    }
    // 1 歩の 区切り: 近づいた か、攻撃の 番なら ここで 止まる
    if (this.stepBoundary) {
      this.stepBoundary = false;
      if (this.pendingAttack || dist < K.stopDist) {
        this.chasing = false;
        this.fadeStep(0, T.clips.idleFadeSec);
        const n = this.pendingAttack;
        this.pendingAttack = null;
        if (n) this.startAttack(n);
        return false;
      }
    }
    // 向きが 大きく ずれて いる 間は 1 歩を 短く する（crawl と おなじ）
    const err = Math.abs(wrapPi(want - this.yaw));
    const lim = T.crawl.moveAngleDeg * DEG;
    C.strideMul = Math.max(0, Math.min(1, 1 - (err - lim) / lim));
    const ev = C.update(dt * K.speedMul);
    if (ev.stepStart) this.stepBoundary = true;
    const mv = this.advance(ev.advance * this.model.scale, dt);
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
    return groundHeight(this.model, this.env.groundY, this.pos, this.yaw);
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
    const atk = this.atk;
    this.eyeShown = applyEyeColors(this.model, this.eyeMix, this.mode === 'tired', this.mode === 'attack' && atk.attackName === 'beam' ? atk.beam.glow : 0);
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
    this.look.apply(m);
  }

  /** 怒って いる 間、首を プレイヤーの 方へ（上限つき・なめらか）。まだ 動いて いる（0 に もどりきって いない）なら true */
  private updateLook(dt: number): boolean {
    const atk = this.atk;
    const beamLook = this.mode === 'attack' && atk.attackName === 'beam' && atk.beam.phase !== 'done';
    const erupting = (this.mode === 'attack' && atk.attackName === 'eruption') || this.mode === 'frozen';
    let tp = 0;
    if (erupting) tp = -T.eruption.headUpDeg * DEG * atk.eruption.pitch; // 上を 向く（首と 頭に 半分ずつ）
    else if (this.mode === 'attack' && atk.attackName === 'thunder') tp = -T.thunder.headUpDeg * DEG * atk.thunder.raise; // 空を 見あげる
    return this.look.update(dt, this.model, this.env, tp, this.mode === 'angry' || beamLook, beamLook ? atk.beamLook : null, this.player.pose);
  }

  private applyTransform(): void {
    applyBodyTransform(this.model.group, this.pos, this.yaw, this.model.scale, this.tilt);
  }

  // ---------------------------------------------------------------- 当たりの 箱（gashaBigActorBoxes.ts）
  /** 箱の 世界での 場所を 更新（関節の いまの 姿勢）。group の 行列は 先に 更新して おく */
  updateBoxes(): void { this.boxes.updateBoxes(); }

  /** マス（i, j, k）の 中心が 入る 箱の 番号（なければ -1）。voxelize と おなじ きまり（j < 0 は 地面の 下なので なし） */
  boxAt(i: number, j: number, k: number): number { return this.boxes.boxAt(i, j, k); }

  solid(i: number, j: number, k: number): boolean { return this.boxes.solid(i, j, k); }

  /** 足もとの すぐ 下の マスが どの 箱か（のっている 箱）。足が 地面に のって いる ときだけ */
  boxUnder(x: number, y: number, z: number): number { return this.boxes.boxUnder(x, y, z); }

  /** いまの 当たりの 箱の 数 */
  get boxCount(): number { return this.boxes.boxCount; }

  /** 当たりの 箱（世界の 座標。毎コマ 更新される）。プレイヤーの 攻撃を 受ける 口が 読む（gashaBigHit.ts） */
  get boxList(): readonly Box[] { return this.boxes.boxList; }

  /** 体に ついて 動く 追加の 箱（置いた ブロック）を 入れかえる。当たりの 箱の 番号（hits）の あとに 足す。boxAt の 答えが hits の 数 以上なら 追加の 箱 */
  setExtras(list: readonly ExtraHit[]): void { this.boxes.setExtras(list); }
  /** 追加の 箱（置いた ブロック。setExtras に わたした 順。世界の 座標） */
  get extraBoxes(): readonly Box[] { return this.boxes.extraBoxes; }
  /** 当たりの 箱（hits）の 数。これ 以上の 番号は 追加の 箱 */
  get hitBoxCount(): number { return this.boxes.hitBoxCount; }
  /** 箱 n の 関節（追加の 箱も 含む） */
  jointOfBox(n: number): JointName | null { return this.boxes.jointOfBox(n); }

  // ---------------------------------------------------------------- 攻撃（gashaBigActorAttack.ts）
  /** 両手たたきつけ・両手で 払う・目から 光線・口から 火山噴火・自分に 落雷の 動き（テストが 中身を 読む） */
  get slam2() { return this.atk.slam2; }
  get sweep() { return this.atk.sweep; }
  get beam() { return this.atk.beam; }
  get eruption() { return this.atk.eruption; }
  get thunder() { return this.atk.thunder; }
  /** 攻撃の 名前（attack モードの 間） */
  get attackName(): string | null { return this.atk.attackName; }
  /** 予告の 半円（なければ null） */
  get warn(): WarnMark | null { return this.atk.warn; }
  /** 払っている 手の いま（世界の 座標。払って いなければ null） */
  get sweepNow() { return this.atk.sweepNow; }
  /** 光線の 間 首が 向く 点（世界の 座標。外から 毎コマ 決める。なければ プレイヤー） */
  get beamLook(): { x: number; y: number; z: number } | null { return this.atk.beamLook; }
  set beamLook(v: { x: number; y: number; z: number } | null) { this.atk.beamLook = v; }
  /** 各攻撃を 出した 数（テスト用） */
  get slam2Count(): number { return this.atk.slam2Count; }
  get sweepCount(): number { return this.atk.sweepCount; }
  get beamCount(): number { return this.atk.beamCount; }
  get eruptionCount(): number { return this.atk.eruptionCount; }
  get thunderCount(): number { return this.atk.thunderCount; }

  /** 攻撃の 動きが 体から 受ける 物（要る 物だけ。this ぜんたいは わたさない） */
  private attackHost(): AttackHost {
    return {
      model: this.model, env: this.env, cycle: this.cycle, pos: this.pos,
      step: () => this.step, yaw: () => this.yaw, stepWant: () => this.stepWant, finaleOn: () => this.finaleOn,
      holdStep: () => { this.stepW = 1; this.stepWant = 1; },
      fadeStep: (want, sec) => this.fadeStep(want, sec),
      resetEyes: () => { this.eyeShown = -1; },
      endAttack: () => { this.cycle.attackEnded(); if (this.cycle.phase === 'tired') this.startTired(); else this.backToAngry(0.3); },
      backToAngry: (sec) => this.backToAngry(sec),
      enterHeld: () => this.enterHeld(),
    };
  }
}
