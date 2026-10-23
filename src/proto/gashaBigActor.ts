/**
 * #293 試作: 大きい がしゃどくろ（第一形態）の うごき。画面・DOM には さわらない（ユニットテストで 動かせる）。
 *  ・モーションを 箱の 関節へ うつす（gashaBigMotion.ts）。はう（Climb 左 → 右 → …）・ふり返る・休み。
 *  ・ふだんは 白目で ゆっくり はって さまよう（シード付き 乱数）。攻撃されると 赤い 目で 怒り、止まって プレイヤーの 方を 向く。20 秒 攻撃されないと 白目に もどる。
 *  ・当たり（見えない 箱）は 毎コマ 作りなおさず、箱の いまの 場所を 毎コマ 更新して「このマスは 固いか」を その場で 聞く（マスの 集合を 作らない）。
 *  ・上に のっている プレイヤーは、のっている 箱が 動いた ぶん（位置と 向き）いっしょに 動かす。
 * 数は ぜんぶ gashaBigTuning.ts。
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import type { BigModel, JointName } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';
import { bakeClip, MotionPlayer, type BakedClip, type ClipJson, type RetargetOpts, type Skeleton } from './gashaBigMotion';
import { plantHands, type PlantReport } from './gashaBigPlant';

export interface ActorEnv {
  /** 地面の いちばん 上の ブロックの 高さ（立つ 面は +1） */
  groundY(x: number, z: number): number;
  /** プレイヤーの いま の 位置と 向き（度） */
  player(): { x: number; y: number; z: number; yawDeg: number };
  /** プレイヤーを 動かす（位置の ずれ、向き（度）の ずれ） */
  carryPlayer?(dx: number, dy: number, dz: number, dYawDeg: number): void;
}

export type ActorClips = Record<'climbL' | 'climbR' | 'lookBack', ClipJson>;
export type ActorMode = 'idle' | 'crawl' | 'look' | 'angry';

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
  /** 動きの 速さ（再生の 速さ）と 進む 速さ（ブロック / 秒）。rebake で 調整表から 読む */
  crawlRate = 1;
  crawlSpeed = 1.5;

  private readonly boxes: Box[] = [];
  private readonly player: MotionPlayer;
  private baked: { climbL: BakedClip; climbR: BakedClip; lookBack: BakedClip };
  private readonly clips: ActorClips;
  /** 手を 地面に ついて いる コマの 数 など（左・右の クリップ）*/
  plant: PlantReport[] = [];
  private rnd: () => number;
  private home = new Vector3();
  private pauseLeft = 0;
  /** あと この 秒 はい回ったら 長い 休みに はいる */
  walkLeft = 0;
  /** 長い 休みの のこり（秒）。0 = 休んで いない */
  restLeft = 0;
  private nextIsRight = false;
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
    this.baked = { climbL: null as never, climbR: null as never, lookBack: null as never };
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
  /** 調整表から クリップを うつして 焼く。ついている 手が すべらない ように 腕を 作りなおす（plantHands） */
  rebake(): void {
    const C = T.crawl;
    this.crawlRate = C.motionRate;
    this.crawlSpeed = C.speedPerHeight * T.size.height; // 身長から きめる（大きさを かえても 重さが おなじ）
    const sk = skeletonOf(this.model);
    const clips = this.clips;
    this.baked = {
      climbL: bakeClip(clips.climbL, retargetOpts(T.clips.climb), sk),
      climbR: bakeClip(clips.climbR, retargetOpts(T.clips.climb), sk),
      lookBack: bakeClip(clips.lookBack, retargetOpts(T.clips.lookBack), sk),
    };
    // からだの 進む 速さ（もとの 座標 / クリップの 秒）= ブロック / 実時間の 秒 ÷ 拡大 ÷ 動きの 速さ
    const speed = this.crawlSpeed / this.model.scale / this.crawlRate;
    this.plant = plantHands(this.model, [this.baked.climbL, this.baked.climbR], { tol: C.contactTol, spread: C.plantSpread, speed });
  }

  private randIn(r: readonly [number, number]): number { return r[0] + this.rnd() * (r[1] - r[0]); }

  // ---------------------------------------------------------------- 外から よぶ もの
  walk(on: boolean): void {
    this.wanderOn = on;
    if (!on) { this.target = null; if (this.mode === 'crawl') this.toIdle(); }
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
    if (this.mode === 'crawl') this.toIdle();
  }

  goTo(x: number, z: number): void {
    this.restLeft = 0; // 行き先を 言われたら 休みは やめる
    this.target = { x, z };
    if (this.mode === 'idle' || this.mode === 'look') this.startCrawl();
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
    if (this.mode !== 'angry') { this.mode = 'angry'; this.target = null; this.player.play(null, { fade: T.clips.idleFadeSec }); }
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
    const clip = this.nextIsRight ? this.baked.climbR : this.baked.climbL;
    this.nextIsRight = !this.nextIsRight;
    this.player.play(clip, { fade: T.clips.fadeSec / this.crawlRate, rate: this.crawlRate, loop: false });
  }

  private toIdle(): void {
    this.mode = 'idle';
    this.player.play(null, { fade: T.clips.idleFadeSec });
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
    const poseNow = this.player.work > 0 || this.lastWork > 0;
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
    // crawl
    const t = this.target;
    if (!t) { this.toIdle(); return false; }
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < T.wander.arriveDist) {
      this.target = null;
      this.toIdle();
      this.pauseLeft = this.randIn(T.wander.pauseSec);
      if (this.wanderOn && this.rnd() < T.wander.lookBackChance) this.lookBack();
      return false;
    }
    // 左右の 手を 順に（クリップの 終わりの すこし 前に 次の クリップへ クロスフェード）
    if (this.player.timeLeft() <= T.clips.fadeSec / this.crawlRate) {
      const clip = this.nextIsRight ? this.baked.climbR : this.baked.climbL;
      this.nextIsRight = !this.nextIsRight;
      this.player.play(clip, { fade: T.clips.fadeSec / this.crawlRate, rate: this.crawlRate, loop: false });
    }
    const want = Math.atan2(dx, dz);
    const err = Math.abs(wrapPi(want - this.yaw));
    moved = this.turnToward(want, T.crawl.turnDegPerSec * DEG * dt);
    // 向きが 大きく ずれて いる 間は 進まない（その場で 向きを かえる）
    const lim = T.crawl.moveAngleDeg * DEG;
    const f = Math.max(0, Math.min(1, 1 - (err - lim) / lim));
    const step = Math.min(dist, this.crawlSpeed * f * dt);
    this.speedNow = step / dt;
    if (step > 0) {
      this.pos.x += Math.sin(this.yaw) * step;
      this.pos.z += Math.cos(this.yaw) * step;
      moved = true;
    }
    // 地面の 高さ（手・からだの 下の 何点か）。ゆっくり ついて いく
    const gy = this.groundTarget();
    const maxD = T.ground.followSpeed * dt;
    const dy = gy - this.pos.y;
    this.pos.y += Math.abs(dy) <= maxD ? dy : Math.sign(dy) * maxD;
    return moved || Math.abs(dy) > 1e-6;
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
    for (let i = 0; i < this.names.length; i++) m.joints[this.names[i]!].quaternion.copy(this.player.pose[i]!);
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
}
