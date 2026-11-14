import { createRng, hashInts, type Rng } from '../world/gen/random';
import { PathFinder, type Goal } from './townCarpenterPath';
import { MOTION_LEN, type MotionName } from './townCarpenterPose';
import type { RepairGate, RepairJob } from './townRepairs';
import type { ScaffoldRect } from './townScaffoldSet';
import { TOWN } from './townTuning';

/**
 * TOWN-1 1.4 §2.16 の 9〜14: 街の だいくさん（こやの 建築士さん 1 人）。朝に こやを 出て、こわれた まとまりを 近い 順に 歩いて 回り、
 * たたいて もどし、おわると おじぎ、ぜんぶ 回ったら 歩いて 帰る。計算だけ（three なし）。ぶつからない・やられない（体力が ない）。
 * 状態: home（こや）→ walk（歩く）→ fix（たたく・おじぎ）→ wait（人が まって いる まとまりの そばで まつ）→ back（帰る）。
 */
const C = TOWN.repair.carpenter;
/** 地面の 高さが かわった とき の 追いかけ（1 ステップに 上は 0.18、下は 0.35 マス まで） */
const RISE = 0.18;
const FALL = 0.35;

export type CarpenterState = 'home' | 'walk' | 'fix' | 'wait' | 'back';

export interface CarpenterDeps {
  /** いま もどす 係（townRepairs.jobs()） */
  jobs(): readonly RepairJob[];
  /** 人が そばで まって いる まとまりか */
  waiting(j: RepairJob): boolean;
  /** 列 (x, z) へ いまの 高さ fromY から 足を おける 足もとの y（立てなければ null。屋根の 下・橋の 上は 高さで 見わける） */
  standY(x: number, z: number, fromY: number): number | null;
  /** 足場の 四角（まとまりの 四角。わくは ＋1 マス。中は 通らない） */
  frames(): readonly ScaffoldRect[];
  /** だれかが こやの 建築士さんの メニューを 開いて いるか */
  menuOpen(): boolean;
  /** 列を 読みこんで いるか */
  isLoaded(x: number, z: number): boolean;
  /** こやの 作業台の 前（足もと・向き。yaw 0 ＝ 北 ＝ −z） */
  home: { x: number; y: number; z: number; yaw: number };
  seed: number;
  /** ぽんと うつった（ほこりを 出す） */
  onWarp?(x: number, y: number, z: number): void;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class TownCarpenter implements RepairGate {
  state: CarpenterState = 'home';
  /** こやを 出て いる（るす） */
  out = false;
  x: number;
  y: number;
  z: number;
  /** 向き（ラジアン。0 ＝ 北 ＝ −z。atan2(dx, −dz)） */
  yaw: number;
  /** しぐさと その コマ（rest ＝ 立つだけ） */
  motion: MotionName | 'rest' = 'rest';
  frame = 0;
  target: RepairJob | null = null;

  private readonly rng: Rng;
  private readonly finder: PathFinder;
  private readonly path: number[] = [];
  private pi = 0;
  private departAt = -1;
  private t = 0;
  private leg = 0;
  private bowing = false;
  /** いまの 行き先は 人が まって いる まとまりの そば（着いたら たたかず まつ） */
  private waitKind = false;
  /** 道が 見つからなかった（その場で まって warpSteps で うつる） */
  private noPath = false;
  private readonly goal: Extract<Goal, { kind: 'rect' }> = { kind: 'rect', minX: 0, maxX: 0, minZ: 0, maxZ: 0, dMin: C.standMin, dMax: C.standMax };

  constructor(private readonly d: CarpenterDeps) {
    this.x = d.home.x;
    this.y = d.home.y;
    this.z = d.home.z;
    this.yaw = d.home.yaw;
    this.rng = createRng(hashInts(d.seed, 0x7a11, 0));
    this.finder = new PathFinder(
      (x, z, fy) => d.standY(x, z, fy),
      (x, z) => this.inFrame(x, z),
    );
  }

  // ---- 建築士さんの 口（townRepairs の gate）

  allows(job: RepairJob): boolean {
    return this.state === 'fix' && this.target === job && !this.bowing;
  }

  rush(job: RepairJob): boolean {
    return !this.d.isLoaded(job.minX, job.minZ);
  }

  /** るすの ふだが 出て いるか */
  sign(): boolean {
    return this.out;
  }

  // ---- 1 ステップ

  step(): void {
    this.t++;
    if (this.state !== 'home' && !this.d.isLoaded(Math.floor(this.x), Math.floor(this.z))) {
      this.goHome(true); // 見て いない 間に 街を はなれた: のこりは すぐ もどって いる。こやに もどる
      return;
    }
    switch (this.state) {
      case 'home':
        this.stepHome();
        break;
      case 'walk':
      case 'back':
        this.stepWalk();
        break;
      case 'fix':
        this.stepFix();
        break;
      case 'wait':
        this.stepWait();
        break;
      default: {
        const never: never = this.state;
        throw new Error(`state ${String(never)}`);
      }
    }
  }

  private stepHome(): void {
    this.motion = 'rest';
    this.yaw = this.d.home.yaw;
    if (!this.hasWork()) {
      this.departAt = -1;
      return;
    }
    if (this.d.menuOpen()) {
      this.departAt = -1; // メニューが とじる まで 出かけない
      return;
    }
    if (this.departAt < 0) this.departAt = this.t + Math.floor(this.rng() * (C.departMax + 1));
    if (this.t >= this.departAt) {
      this.departAt = -1;
      this.out = true;
      this.pickNext();
    }
  }

  private stepWalk(): void {
    this.motion = 'walk';
    this.frame = (this.frame + 1) % MOTION_LEN.walk;
    this.leg++;
    if (this.state === 'walk' && (this.target === null || this.target.finished)) {
      this.pickNext();
      return;
    }
    if (this.leg > C.warpSteps) {
      this.warp();
      return;
    }
    if (this.noPath) return; // 道が ない: その場で まつ（warpSteps で うつる）
    if (this.pi >= this.path.length) {
      this.arrive();
      return;
    }
    const wx = this.path[this.pi]! + 0.5;
    const wz = this.path[this.pi + 1]! + 0.5;
    const wy = this.path[this.pi + 2]!;
    const dx = wx - this.x;
    const dz = wz - this.z;
    const dist = Math.hypot(dx, dz);
    this.turnTo(Math.atan2(dx, -dz));
    this.followY(wy);
    if (dist <= C.walkPerStep) {
      this.x = wx;
      this.z = wz;
      this.pi += 3;
    } else {
      this.x += (dx / dist) * C.walkPerStep;
      this.z += (dz / dist) * C.walkPerStep;
    }
  }

  private stepFix(): void {
    const j = this.target;
    if (j === null) {
      this.pickNext();
      return;
    }
    if (this.bowing) {
      this.motion = 'bow';
      if (++this.frame >= MOTION_LEN.bow) {
        this.bowing = false;
        this.pickNext();
      }
      return;
    }
    if (j.finished) {
      this.bowing = true;
      this.motion = 'bow';
      this.frame = 0;
      return;
    }
    if (this.d.waiting(j)) {
      this.pickNext(); // 人が そばに いる: とばして つぎへ
      return;
    }
    this.motion = 'tap';
    this.frame = (this.frame + 1) % MOTION_LEN.tap;
    this.faceTarget(j);
  }

  private stepWait(): void {
    this.motion = 'rest';
    if (this.target !== null) this.faceTarget(this.target);
    // まって いた 人が はなれたか・べつの まとまりが 空いたか
    for (const j of this.d.jobs()) {
      if (!j.finished && !this.d.waiting(j)) {
        this.pickNext();
        return;
      }
    }
    if (this.target === null || this.target.finished || !this.hasWork()) this.pickNext();
  }

  // ---- 行き先

  private hasWork(): boolean {
    for (const j of this.d.jobs()) if (!j.finished) return true;
    return false;
  }

  /** つぎの まとまりを きめて 歩きだす。なければ まって いる まとまりの そば、それも なければ 帰る */
  private pickNext(): void {
    this.bowing = false;
    let best: RepairJob | null = null;
    let bestD = Infinity;
    let wait: RepairJob | null = null;
    let waitD = Infinity;
    for (const j of this.d.jobs()) {
      if (j.finished) continue;
      if (this.d.waiting(j)) {
        const dw = this.distTo(j, this.x, this.z);
        if (dw < waitD) {
          waitD = dw;
          wait = j;
        }
        continue;
      }
      const dh = this.distTo(j, this.d.home.x, this.d.home.z); // こやから 近い 順
      if (dh < bestD) {
        bestD = dh;
        best = j;
      }
    }
    if (best !== null) this.startLeg(best, 'walk');
    else if (wait !== null) this.startLeg(wait, 'wait');
    else this.goHome(false);
  }

  private startLeg(j: RepairJob, kind: 'walk' | 'wait'): void {
    this.target = j;
    this.leg = 0;
    this.goal.minX = j.minX;
    this.goal.maxX = j.maxX;
    this.goal.minZ = j.minZ;
    this.goal.maxZ = j.maxZ;
    this.goal.yMin = j.minY - C.standDyDown;
    this.goal.yMax = j.maxY + C.standDyUp;
    this.pi = 0;
    this.state = 'walk';
    this.waitKind = kind === 'wait';
    this.noPath = !this.finder.find(Math.floor(this.x), Math.floor(this.z), this.fy(), this.goal, this.path);
    if (this.noPath) this.path.length = 0;
    if (this.path.length === 0 && (!this.noPath || this.atGoal())) this.arrive();
  }

  /** いまの 足もとの 高さ（マス） */
  private fy(): number {
    return Math.floor(this.y + 0.01);
  }

  /** まとまり j の まわりの 列 (x, z) に 立てる 足もとの y（こわれた 高さの 近くで さがす。なければ null） */
  private columnY(x: number, z: number, j: RepairJob): number | null {
    for (let fy = j.minY; fy <= j.maxY + 2; fy += 3) {
      const y = this.d.standY(x, z, fy);
      if (y !== null) return y;
    }
    return null;
  }

  private atGoal(): boolean {
    const dx = Math.max(this.goal.minX - this.x, 0, this.x - this.goal.maxX - 1);
    const dz = Math.max(this.goal.minZ - this.z, 0, this.z - this.goal.maxZ - 1);
    const d = Math.max(dx, dz);
    return d >= C.standMin && d <= C.standMax + 1;
  }

  private goHome(instant: boolean): void {
    this.target = null;
    this.bowing = false;
    if (instant || this.atHome()) {
      this.arriveHome();
      return;
    }
    this.state = 'back';
    this.leg = 0;
    this.pi = 0;
    const h: Goal = { kind: 'cell', x: Math.floor(this.d.home.x), z: Math.floor(this.d.home.z) };
    this.noPath = !this.finder.find(Math.floor(this.x), Math.floor(this.z), this.fy(), h, this.path);
    if (this.noPath) this.path.length = 0;
  }

  private atHome(): boolean {
    return Math.hypot(this.x - this.d.home.x, this.z - this.d.home.z) < 0.05;
  }

  private arriveHome(): void {
    this.x = this.d.home.x;
    this.y = this.d.home.y;
    this.z = this.d.home.z;
    this.yaw = this.d.home.yaw;
    this.state = 'home';
    this.out = false;
    this.motion = 'rest';
    this.frame = 0;
    this.path.length = 0;
    this.pi = 0;
  }

  private arrive(): void {
    if (this.state === 'back') {
      this.arriveHome();
      return;
    }
    this.state = this.waitKind ? 'wait' : 'fix';
    this.frame = 0;
    this.motion = this.waitKind ? 'rest' : 'tap';
    if (this.target !== null) this.faceTarget(this.target);
  }

  /** 3,000 ステップ たっても 着かない: 行き先の そばへ ぽんと うつる（行き先の 輪の 立てる 所の うち いちばん 近い 所。帰りは こや） */
  private warp(): void {
    if (this.state === 'back') {
      this.d.onWarp?.(this.x, this.y, this.z);
      this.arriveHome();
      return;
    }
    const g = this.goal;
    let bx = NaN;
    let bz = NaN;
    let by = 0;
    let bd = Infinity;
    for (let z = g.minZ - C.standMax; z <= g.maxZ + C.standMax; z++) {
      for (let x = g.minX - C.standMax; x <= g.maxX + C.standMax; x++) {
        const dd = Math.max(g.minX - x, 0, x - g.maxX, g.minZ - z, 0, z - g.maxZ);
        if (dd < C.standMin || dd > C.standMax) continue;
        const y = this.target === null ? null : this.columnY(x, z, this.target);
        if (y === null || this.inFrame(x, z) || y < (g.yMin ?? -Infinity) || y > (g.yMax ?? Infinity)) continue;
        const dist = Math.hypot(x + 0.5 - this.x, z + 0.5 - this.z);
        if (dist < bd) {
          bd = dist;
          bx = x;
          bz = z;
          by = y;
        }
      }
    }
    if (Number.isNaN(bx)) {
      this.leg = 0; // 立てる 所が 1 つも ない: もう 1 回 まつ
      return;
    }
    this.d.onWarp?.(this.x, this.y, this.z);
    this.x = bx + 0.5;
    this.z = bz + 0.5;
    this.y = by;
    this.path.length = 0;
    this.pi = 0;
    this.noPath = false;
    this.arrive();
    this.d.onWarp?.(this.x, this.y, this.z);
  }

  // ---- 動き

  private distTo(j: RepairJob, x: number, z: number): number {
    return Math.hypot((j.minX + j.maxX + 1) / 2 - x, (j.minZ + j.maxZ + 1) / 2 - z);
  }

  private faceTarget(j: RepairJob): void {
    this.turnTo(Math.atan2((j.minX + j.maxX + 1) / 2 - this.x, -((j.minZ + j.maxZ + 1) / 2 - this.z)));
  }

  private turnTo(a: number): void {
    const dd = wrap(a - this.yaw);
    this.yaw = wrap(this.yaw + Math.max(-C.turnRate, Math.min(C.turnRate, dd)));
  }

  private followY(gy: number): void {
    const dy = gy - this.y;
    this.y = Math.abs(dy) < 0.01 ? gy : this.y + Math.max(-FALL, Math.min(RISE, dy));
  }

  /** 足場の わく（四角 ＋1 マス）の 中か */
  private inFrame(x: number, z: number): boolean {
    for (const s of this.d.frames()) if (x >= s.min.x - 1 && x <= s.max.x + 1 && z >= s.min.z - 1 && z <= s.max.z + 1) return true;
    return false;
  }
}
