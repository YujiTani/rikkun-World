// 建築中の 家（HOUSE-1C PR-2 #340。仕様 §2.10・§4.5〜4.7・AC21・AC23・AC32c・AC39）。いま 建てて いる 家は 1 けんだけ。DOM・three なし。
// 進みは 世界の 歩数（update が 呼ばれた 数）で 決まる。メニュー・上空の 視点が 開いて いる 間は update が 呼ばれない ので 止まる（AC41）。
// 毎ステップ 世界を 読まない: かべ・仕上げを 立てる ステップだけ 書き、立てる 場所が 読みこまれて いない 間は 書かず、読みこまれたら 1 回だけ ぜんぶ 合わせる。
import type { BlockId, Vec3 } from '../../contracts';
import { houseBuildTicks } from '../editor/model';
import type { Blueprint } from '../editor/blueprint';
import { makePlan, stageCounts, type BuildPlan, type PlanBlueprint, type PlanCell } from './plan';
import { KEEP_OUT, NO_SPAWN_RADIUS } from './tuning';
import { buildWord } from './words';

interface BuilderWorld {
  getBlock(x: number, y: number, z: number): BlockId | 'outside';
  setBlock(x: number, y: number, z: number, id: BlockId): boolean;
  isLoaded(x: number, z: number): boolean;
}

/** 建てて いる 家（保存に のこす 形） */
export interface ActiveBuild {
  /** せっけいずの 番号と 中身の 写し（あとで せっけいずが かわっても この 家は かわらない） */
  number: number;
  bp: PlanBlueprint & { name: { front: string; back: string } };
  /** 外の 箱の 北西の すみ（床の 段） */
  at: Vec3;
  /** たった ステップ・長さ（ステップ） */
  elapsed: number;
  length: number;
  /** 建てて いる 建築士さん（id）と、もとの 立ち位置（足もと）。完成後 もどる 先 */
  architect: string;
  home: Vec3 | null;
}

export interface BuilderSave {
  v: 1;
  active: ActiveBuild | null;
  /** 完成したが 場所が 読みこまれて いなくて 形を まだ 書けて いない 家 */
  pending: Array<Pick<ActiveBuild, 'number' | 'bp' | 'at'>>;
  /** はじめての 家の おまけを 使ったか（建て はじめたら true） */
  bonusUsed: boolean;
}

/** 窓口 `building()` の 形 */
export interface BuildingView {
  name: string;
  w: number;
  d: number;
  progress: number;
  leftTicks: number;
  leftText: string;
  at: Vec3;
}

export interface BuilderDeps {
  world: BuilderWorld;
  /** 完成: 家の 形を 外の 箱 ぜんぶに 書いて 記録する（足場も 空気で 消える）。HouseSystem.finishShape */
  finish(b: Pick<ActiveBuild, 'number' | 'bp' | 'at'>): void;
}

/** 場所が 読みこまれて いるかを 見直す 間かく（ステップ） */
const RECHECK_TICKS = 60;

function parseVec(raw: unknown): Vec3 | null {
  const r = raw as Record<string, unknown> | null;
  return r && typeof r === 'object' && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z) ? { x: Math.floor(r.x as number), y: Math.floor(r.y as number), z: Math.floor(r.z as number) } : null;
}

function parsePlanBp(raw: unknown): ActiveBuild['bp'] | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Number.isInteger(r.w) || !Number.isInteger(r.d) || !Number.isInteger(r.windows) || !Array.isArray(r.furniture)) return null;
  const n = r.name as Record<string, unknown> | null;
  return { w: r.w as Blueprint['w'], d: r.d as Blueprint['d'], windows: r.windows as number, furniture: (r.furniture as Blueprint['furniture']).map((p) => ({ ...p })), name: { front: String(n?.front ?? ''), back: String(n?.back ?? '') } };
}

export class HouseBuilder {
  private cur: ActiveBuild | null = null;
  private plan: BuildPlan | null = null;
  private pending: Array<Pick<ActiveBuild, 'number' | 'bp' | 'at'>> = [];
  private bonusUsed = false;
  /** 立てた 数（かべ・仕上げ）と、場所を 合わせなおす 必要が あるか */
  private doneWalls = 0;
  private doneFinish = 0;
  private stale = false;
  /** 読みこみの 見直しまでの 数え（ステップ）。場所用・できた 家用 */
  private staleWait = RECHECK_TICKS;
  private pendingWait = 0;

  constructor(private readonly d: BuilderDeps) {}

  /** はじめての 家の おまけが のこって いるか（まだ 1 けんも 建て はじめて いない） */
  firstBonus(): boolean {
    return !this.bonusUsed;
  }

  active(): ActiveBuild | null {
    return this.cur;
  }

  /** 建て はじめる（建築中は 始められない）。length 0 以下 ＝ 式。足場を ぜんぶ 立てる */
  start(a: Omit<ActiveBuild, 'elapsed' | 'length'>, length: number): boolean {
    if (this.cur) return false;
    this.cur = { ...a, elapsed: 0, length: length > 0 ? Math.floor(length) : houseBuildTicks(a.bp) };
    this.plan = makePlan(a.bp);
    this.bonusUsed = true;
    this.doneWalls = 0;
    this.doneFinish = 0;
    this.stale = !this.loaded(a.at, a.bp);
    this.staleWait = RECHECK_TICKS;
    if (!this.stale) for (const c of this.plan.scaffold) this.put(a.at, c);
    return true;
  }

  /** 1 ステップ。完成したら その 家を 返す（写しを 返す） */
  update(): ActiveBuild | null {
    this.recheckPending();
    const b = this.cur;
    if (!b || !this.plan) return null;
    b.elapsed++;
    if (b.elapsed >= b.length) {
      const done = b;
      this.cur = null;
      this.plan = null;
      this.complete(done);
      return done;
    }
    const want = stageCounts(this.plan, b.elapsed, b.length);
    if (!this.stale && want.walls === this.doneWalls && want.finish === this.doneFinish) return null;
    if (!this.stale && !this.loaded(b.at, b.bp)) this.stale = true;
    if (this.stale && !this.syncIfLoaded()) return null;
    this.advance(b.at, want);
    return null;
  }

  /** 窓口 `building()` */
  view(): BuildingView | null {
    const b = this.cur;
    if (!b) return null;
    return {
      name: b.bp.name.front + b.bp.name.back,
      w: b.bp.w,
      d: b.bp.d,
      progress: b.elapsed / b.length,
      leftTicks: b.length - b.elapsed,
      leftText: buildWord(b.elapsed, b.length),
      at: { ...b.at },
    };
  }

  // ------------------------------------------------------------ 守り（置く・ほる・歩く・湧き）

  /** (x, y, z) が 建築中の 場所（外の 箱 × 高さ 5）の 中か。置く・ほるが 失敗する */
  locked(x: number, y: number, z: number): boolean {
    const b = this.cur;
    if (!b) return false;
    const a = b.at;
    return x >= a.x && x < a.x + b.bp.w + 2 && z >= a.z && z < a.z + b.bp.d + 2 && y >= a.y && y <= a.y + KEEP_OUT.levels;
  }

  /** プレイヤーが 歩いて 入れない マス（箱の 中の 床の 上の 段） */
  keepOut(x: number, y: number, z: number): boolean {
    const b = this.cur;
    return b !== null && y > b.at.y && this.locked(x, y, z);
  }

  /** 妖怪が 湧けない か（建築中の 場所の まん中から 横 16 マス 以内。世界は 読まない） */
  noSpawn(x: number, z: number): boolean {
    const b = this.cur;
    return b !== null && Math.hypot(x - (b.at.x + (b.bp.w + 2) / 2), z - (b.at.z + (b.bp.d + 2) / 2)) <= NO_SPAWN_RADIUS;
  }

  // ------------------------------------------------------------ 保存

  serialize(): BuilderSave {
    const copy = (b: Pick<ActiveBuild, 'number' | 'bp' | 'at'>) => ({ number: b.number, bp: parsePlanBp(b.bp)!, at: { ...b.at } });
    return {
      v: 1,
      active: this.cur ? { ...copy(this.cur), elapsed: this.cur.elapsed, length: this.cur.length, architect: this.cur.architect, home: this.cur.home ? { ...this.cur.home } : null } : null,
      pending: this.pending.map(copy),
      bonusUsed: this.bonusUsed,
    };
  }

  /** 読みこむ（前の 中身は すてる）。形が おかしい 所は 「建築中の 家 なし・おまけ あり」 */
  load(raw: unknown): void {
    this.cur = null;
    this.plan = null;
    this.pending = [];
    this.bonusUsed = false;
    this.doneWalls = 0;
    this.doneFinish = 0;
    this.stale = false;
    const r = raw as Record<string, unknown> | null;
    if (!r || typeof r !== 'object') return;
    this.bonusUsed = r.bonusUsed === true;
    const one = (x: unknown): Pick<ActiveBuild, 'number' | 'bp' | 'at'> | null => {
      const o = x as Record<string, unknown> | null;
      const bp = parsePlanBp(o?.bp);
      const at = parseVec(o?.at);
      return o && bp && at && Number.isInteger(o.number) ? { number: o.number as number, bp, at } : null;
    };
    if (Array.isArray(r.pending)) {
      for (const p of r.pending) {
        const v = one(p);
        if (v) this.pending.push(v);
      }
    }
    const a = r.active as Record<string, unknown> | null;
    const base = one(a);
    if (a && base && Number.isFinite(a.elapsed) && Number.isFinite(a.length) && (a.length as number) > 0) {
      this.cur = { ...base, elapsed: Math.max(0, Math.floor(a.elapsed as number)), length: Math.floor(a.length as number), architect: typeof a.architect === 'string' ? a.architect : 'first', home: parseVec(a.home) };
      this.plan = makePlan(base.bp);
      this.bonusUsed = true;
      this.stale = true; // 世界は 保存の とおりに もどって いる はず。念のため 場所が 読みこまれたら 1 回 合わせる
      this.staleWait = RECHECK_TICKS;
    }
  }

  // ------------------------------------------------------------ 中の 動き

  /** 外の 箱の 四すみの 列が 読みこまれて いるか */
  private loaded(at: Vec3, bp: Pick<PlanBlueprint, 'w' | 'd'>): boolean {
    const w = this.d.world;
    const ow = bp.w + 2;
    const od = bp.d + 2;
    return w.isLoaded(at.x, at.z) && w.isLoaded(at.x + ow - 1, at.z + od - 1) && w.isLoaded(at.x + ow - 1, at.z) && w.isLoaded(at.x, at.z + od - 1);
  }

  private put(at: Vec3, c: PlanCell): void {
    const x = at.x + c.x;
    const y = at.y + c.y;
    const z = at.z + c.z;
    if (this.d.world.getBlock(x, y, z) !== c.id) this.d.world.setBlock(x, y, z, c.id);
  }

  /** 読みこまれて いれば、足場を 立てなおし、かべ・仕上げは 0 から 数えなおして（advance が 今の 進みまで 合わせる）true。60 ステップに 1 回だけ 見る */
  private syncIfLoaded(): boolean {
    const b = this.cur;
    if (!b || !this.plan) return false;
    if (++this.staleWait < RECHECK_TICKS) return false;
    this.staleWait = 0;
    if (!this.loaded(b.at, b.bp)) return false;
    for (const c of this.plan.scaffold) this.put(b.at, c);
    this.doneWalls = 0;
    this.doneFinish = 0;
    this.stale = false;
    return true;
  }

  private advance(at: Vec3, want: { walls: number; finish: number }): void {
    const p = this.plan!;
    for (; this.doneWalls < want.walls; this.doneWalls++) this.put(at, p.walls[this.doneWalls]!);
    for (; this.doneFinish < want.finish; this.doneFinish++) this.put(at, p.finish[this.doneFinish]!);
  }

  private complete(done: Pick<ActiveBuild, 'number' | 'bp' | 'at'>): void {
    this.pendingWait = 0;
    if (this.loaded(done.at, done.bp)) this.d.finish(done);
    else this.pending.push({ number: done.number, bp: done.bp, at: done.at });
  }

  /** 完成したのに 場所が 読みこまれて いなかった 家: 読みこまれたら 形を 書く */
  private recheckPending(): void {
    if (this.pending.length === 0 || ++this.pendingWait < RECHECK_TICKS) return;
    this.pendingWait = 0;
    const left: typeof this.pending = [];
    for (const p of this.pending) {
      if (this.loaded(p.at, p.bp)) this.d.finish(p);
      else left.push(p);
    }
    this.pending = left;
  }
}
