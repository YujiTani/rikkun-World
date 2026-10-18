import type { ChunkColumn } from '../../contracts';
import { COUNT_LIGHT_TOTAL_MAX, COUNT_MESH_MAX, type FrameClock } from '../frameClock';
import { MAX_COLUMNS, R_DRAW, R_GEN, R_LIGHT, canLight, cheb, colKey, compareNear, getRing, ringCount } from './ring';

/**
 * 列の読みこみ・捨て・光・メッシュの進め方（VOX-D §2・§8。docs/tickets/VOX-D.md）。three を使わない。
 * 列は「なし → 読みこみ中 → 生成ずみ → 光ずみ → メッシュずみ」と段を進む。中心から近い順に作り、遠くなったら捨てる。
 */

export type Stage = 'none' | 'loading' | 'generated' | 'lit' | 'meshed';
export type Phase = 'boot' | 'play' | 'wait';

/** 世界の窓口（ChunkedVoxelWorld が合う） */
export interface StreamWorld {
  loadColumn(column: ChunkColumn): void;
  unloadColumn(cx: number, cz: number): boolean;
  column(cx: number, cz: number): ChunkColumn | undefined;
  isSaveDirty(cx: number, cz: number): boolean;
  requeueSaveDirty(cols: readonly { cx: number; cz: number }[]): void;
}

/** 光の窓口。1 列ぶんを まとめて計算する */
export interface StreamLight {
  lightColumn(cx: number, cz: number): void;
}

/** メッシュの窓口（WorldRenderer のつなぎ）。仕事 1 つ = セクション 1 つのメッシュ（または列 1 つの LOD） */
export interface StreamMesh {
  /** 描く輪の中心（プレイヤーのいる列）を伝える */
  setRing(pcx: number, pcz: number): void;
  /** 光ずみで、まだ作っていない仕事の数 */
  pendingJobs(): number;
  /** 次の仕事の近さ（チェビシェフ。プレイヤーが変えた所は −1）。無ければ null */
  nextJobDist(): number | null;
  /** 1 つ進める。進めたら true */
  runJob(): boolean;
  /** 'true' = その列の本当の段まで・'drawn' = 何かの絵を出している・'none' = まだ */
  columnState(cx: number, cz: number): 'none' | 'drawn' | 'true';
  /** 箱から小ブロックへの差しかえを してよいか（開始のあと） */
  allowUpgrades?(on: boolean): void;
  /** 前の runJob で作ったメッシュの数と、小ブロックを作ったか（count の時計用。#179） */
  lastJob?(): { meshes: number; micro: boolean };
}

/** 列の出どころ・保存先（保存は SaveManager がつなぐ） */
export interface StreamIO {
  generate(cx: number, cz: number): ChunkColumn;
  /** 保存（IndexedDB のキーの一覧・ページの中の入れ物）に この列があるか */
  has(cx: number, cz: number): boolean;
  /** 保存から読む。こわれている・読めない → null。非同期でもよい */
  read(cx: number, cz: number): ChunkColumn | null | Promise<ChunkColumn | null>;
  /** true = 保存は IndexedDB（書き終わりを待つ）。false = ページの中の入れ物（keep でその場で預かる） */
  persistent(): boolean;
  /** 捨てる列の中身を ページの中の入れ物に預ける（persistent() が false のとき） */
  keep(col: ChunkColumn): void;
  /** 保存を始める（さわった列を書く）。いま始めてよいか */
  canFlush(): boolean;
  flush(): void;
  /** この列を いま書いている最中か / 保存が書いている途中か */
  writing(cx: number, cz: number): boolean;
  saving(): boolean;
}

export interface StreamDeps {
  world: StreamWorld;
  light: StreamLight;
  mesh: StreamMesh;
  io: StreamIO;
  now?: () => number;
  /** 1 コマの仕事を 時間で決めるか 数で決めるか（#179。E2E のサーバーは count） */
  clock?: FrameClock;
  /** true の列は 光を計算しない（S4: 置きものを書くまで待つ） */
  holdLight?: (cx: number, cz: number) => boolean;
  /** 列を世界に入れたとき（how: 作った / 保存から） */
  onLoaded?: (cx: number, cz: number, how: 'generated' | 'saved') => void;
  /** 開始の前に 読みこんでおく列（K6 の保険） */
  required?: () => readonly { cx: number; cz: number }[];
  /** 開始の条件がそろった（kind: 起動 / 待ち） */
  onReady?: (kind: 'boot' | 'wait') => void;
}

/** B1・B2 */
export const BUDGET_STREAM_MS = 4;
export const BUDGET_TOTAL_MS = 8;
export const BUDGET_PREP_MS = 30;
/** K3 */
/** 捨てる前の保存を また始めるまでの、最小の update の回数 */
export const FLUSH_GAP = 30;
export const START_JOBS = 169 + 121 + 81;

interface Col {
  cx: number;
  cz: number;
  stage: 'loading' | 'generated' | 'lit';
}

export interface StreamInfo {
  ready: boolean;
  phase: Phase;
  progress: number;
  center: { cx: number; cz: number };
  columns: { loading: number; generated: number; lit: number; meshed: number };
  queued: number;
  saving: boolean;
  unloadPending: number;
  totals: { generated: number; readFromSave: number; unloaded: number; savedBeforeUnload: number };
  frameMs: { last: number; max: number };
}

/** 保険の列を ready のあと捨てない コマ数 */
const REQ_KEEP_FRAMES = 600;

const START_GEN = 6;

export class ChunkStream {
  private readonly cols = new Map<number, Col>();
  private readonly arrivals: { cx: number; cz: number; col: ChunkColumn | null }[] = [];
  private cx = 0;
  private cz = 0;
  private _ready = false;
  private _phase: Phase = 'boot';
  private _progress = 0;
  private work: number | null = null;
  private waitFrames = 0;
  /** 保険の列(K6)を ready のあと しばらく（コマ数で）捨てずに おく: ready の直後に 当たったマスを 読めるように */
  private tick = 0;
  private reqSeen = new Set<number>();
  private keepReq: { keys: Set<number>; until: number } | null = null;
  private unloadWait = 0;
  private blockedWait = 0;
  /** 前の flush から 数えた update の回数（書けないときに 毎コマ 保存を始めないため） */
  private sinceFlush = 1e9;
  private readonly totals = { generated: 0, readFromSave: 0, unloaded: 0, savedBeforeUnload: 0 };
  private readonly frame = { last: 0, max: 0 };
  /** 保存を待たせた列（待っていた列の数え用） */
  private readonly waited = new Set<number>();
  private readonly now: () => number;

  constructor(private readonly d: StreamDeps) {
    this.now = d.now ?? (() => performance.now());
    d.mesh.setRing(0, 0);
  }

  // ------------------------------------------------------------ 中心・段階

  /** 歩いて中心の列が変わった（開始のやりなおしはしない）。待っている仕事は新しい中心で並べなおされる（S5） */
  setCenter(cx: number, cz: number): void {
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    this.d.mesh.setRing(cx, cz);
  }

  /** 中心を変えて 開始をやりなおす（起動・テレポート・遠くへもどる）。進みぐあいは 0 から */
  restart(cx: number, cz: number, kind: 'boot' | 'wait'): void {
    this.cx = cx;
    this.cz = cz;
    this.d.mesh.setRing(cx, cz);
    this._ready = false;
    this._phase = kind;
    this._progress = 0;
    this.waitFrames = 0;
    this.reqSeen.clear();
    this.keepReq = null;
  }

  /** テスト用: 1 コマの仕事を ちょうど n こにする（null = ms の予算）。0 は止める */
  setWork(n: number | null): void {
    this.work = n;
  }

  get ready(): boolean {
    return this._ready;
  }
  get phase(): Phase {
    return this._phase;
  }
  get progress(): number {
    return this._progress;
  }
  get center(): { cx: number; cz: number } {
    return { cx: this.cx, cz: this.cz };
  }
  /** 待ちが続いたコマ数（じゅんびちゅうのカードを出すかどうかに使う） */
  get waitedFrames(): number {
    return this.waitFrames;
  }

  /** その中心で 開始の条件（K1・K2）がもう そろっているか（遠くへもどるかの判定。保険の列は見ない） */
  isAreaReady(cx: number, cz: number): boolean {
    return this.startCount(cx, cz) === START_JOBS;
  }

  stageOf(cx: number, cz: number): Stage {
    const c = this.cols.get(colKey(cx, cz));
    if (c === undefined) return 'none';
    if (c.stage === 'lit' && cheb(cx, cz, this.cx, this.cz) <= getRing().draw && this.d.mesh.columnState(cx, cz) !== 'none') return 'meshed';
    return c.stage;
  }

  /** 描く輪の中で メッシュずみの列か（妖怪の出る場所） */
  isDrawn(cx: number, cz: number): boolean {
    return this.stageOf(cx, cz) === 'meshed';
  }

  isGenerated(cx: number, cz: number): boolean {
    const c = this.cols.get(colKey(cx, cz));
    return c !== undefined && c.stage !== 'loading';
  }

  isLit(cx: number, cz: number): boolean {
    return this.cols.get(colKey(cx, cz))?.stage === 'lit';
  }

  loadedCount(): number {
    let n = 0;
    for (const c of this.cols.values()) if (c.stage !== 'loading') n++;
    return n;
  }

  /** 世界に入っていて stream が知らない列（テスト・保険で先に入れた列）を 生成ずみとして受けとる */
  adopt(cx: number, cz: number): void {
    const k = colKey(cx, cz);
    if (!this.cols.has(k) && this.d.world.column(cx, cz)) this.cols.set(k, { cx, cz, stage: 'generated' });
  }

  // ------------------------------------------------------------ 進み

  /** 開始のすすみぐあいの数（K3。371 で そろい）。開始の半径は輪の大きさによらず 生成 6・光 5・メッシュ 4（small の輪でも ぎりぎり入る。#203） */
  private startCount(pcx: number, pcz: number): number {
    let n = 0;
    for (let dz = -START_GEN; dz <= START_GEN; dz++) {
      for (let dx = -START_GEN; dx <= START_GEN; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const r = Math.max(Math.abs(dx), Math.abs(dz));
        const c = this.cols.get(colKey(cx, cz));
        if (c === undefined || c.stage === 'loading') continue;
        n++; // 生成（半径 6）
        if (r > 5) continue;
        if (c.stage === 'lit') n++; // 光（半径 5）
        if (r > 4 || c.stage !== 'lit') continue;
        const m = this.d.mesh.columnState(cx, cz);
        if (m !== 'none') n++; // メッシュ（K1・K2: 何かの絵。半径 2 も 箱でよい）
      }
    }
    return n;
  }

  /** 1 コマ進める。budget: 遊んでいる間は 4 / 8 ms、じゅんびちゅうの間は 30 ms（B1・B2）。work が決まっていれば ちょうどそのこ数 */
  update(): void {
    const t0 = this.now();
    this.drainArrivals();
    this.d.mesh.allowUpgrades?.(this._ready);
    const prep = this._phase !== 'play';
    const totalMs = prep ? BUDGET_PREP_MS : BUDGET_TOTAL_MS;
    const streamMs = prep ? BUDGET_PREP_MS : BUDGET_STREAM_MS;
    let done = 0;
    let streamUsed = 0;
    const count = this.d.clock === 'count';
    let made = 0;
    let madeMicro = false;
    this.unloadWait = 0;
    let flushed = false;
    for (;;) {
      if (this.work !== null) {
        if (done >= this.work) break;
      } else if (count) {
        // count: 時間は見ない。メッシュ 8 個まで（小ブロックは 1 個で おしまい）・仕事は 64 こまで
        if (done >= COUNT_LIGHT_TOTAL_MAX || made > COUNT_MESH_MAX - 2 || madeMicro) break;
      } else if (done > 0 && this.now() - t0 >= totalMs) break;
      const sj = this.work === null && !count && done > 0 && streamUsed >= streamMs ? null : this.pickStreamJob();
      const md = this.d.mesh.nextJobDist();
      let ran = false;
      if (sj !== null && sj.kind === 'unload') {
        const ts = this.now();
        ran = this.doUnload(sj.c);
        streamUsed += this.now() - ts;
      } else if (sj !== null && (md === null || sj.dist <= md)) {
        const ts = this.now();
        this.runStreamJob(sj);
        streamUsed += this.now() - ts;
        ran = true;
      } else if (md !== null) {
        ran = this.d.mesh.runJob();
        if (ran && count) {
          const j = this.d.mesh.lastJob?.() ?? { meshes: 1, micro: false };
          made += j.meshes;
          madeMicro = j.micro;
        }
      }
      if (!ran) {
        // 捨てたいけれど 保存の書き終わりを待っている列: 保存を始める
        break;
      }
      done++;
    }
    // 捨てる待ち（保存の書き終わりを待つ列）の数え直しと、保存の開始
    this.countUnloadWait();
    this.sinceFlush++;
    if (!flushed && this.blockedWait > 0 && this.sinceFlush >= FLUSH_GAP && !this.d.io.saving() && this.d.io.canFlush()) {
      this.d.io.flush();
      flushed = true;
      this.sinceFlush = 0;
    }
    this.tick++;
    this.updateReady();
    if (this._phase === 'wait') this.waitFrames++;
    this.frame.last = this.now() - t0;
    if (this.frame.last > this.frame.max) this.frame.max = this.frame.last;
  }

  /** いまの中心で 開始の条件（K1・K2）が そろっているか（count の時計で 止めている間に進めるかを決める。#179） */
  startSettled(): boolean {
    return this.startCount(this.cx, this.cz) === START_JOBS;
  }

  private updateReady(): void {
    if (this._ready) return;
    const n = this.startCount(this.cx, this.cz);
    const req = this.d.required?.() ?? [];
    for (const r of req) this.reqSeen.add(colKey(r.cx, r.cz));
    const reqOk = req.every((r) => this.isGenerated(r.cx, r.cz));
    const full = n === START_JOBS;
    const p = Math.min(n / START_JOBS, full && !reqOk ? 0.999 : 1);
    if (p > this._progress) this._progress = p;
    if (full && reqOk) {
      this._progress = 1;
      this._ready = true;
      if (this.reqSeen.size > 0) this.keepReq = { keys: new Set(this.reqSeen), until: this.tick + REQ_KEEP_FRAMES };
      const kind = this._phase === 'boot' ? 'boot' : 'wait';
      this._phase = 'play';
      this.d.mesh.allowUpgrades?.(true);
      this.d.onReady?.(kind);
    }
  }

  // ------------------------------------------------------------ 仕事えらび

  private pickStreamJob(): StreamJob | null {
    const pcx = this.cx;
    const pcz = this.cz;
    const w = this.d.world;
    if (!this._ready) for (const r of this.d.required?.() ?? []) this.reqSeen.add(colKey(r.cx, r.cz)); // 1 回だけ作る
    // 1. 捨てる（いちばん遠いものから。保存を待つものは とばす）
    let far: Col | null = null;
    let farD = -1;
    for (const c of this.cols.values()) {
      if (c.stage === 'loading') continue;
      const dd = cheb(c.cx, c.cz, pcx, pcz);
      if (dd <= getRing().keep) continue;
      if (!this.canDiscard(c.cx, c.cz) || this.isRequiredNow(c.cx, c.cz)) continue;
      if (dd > farD) {
        far = c;
        farD = dd;
      }
    }
    // そろうまでは、生成・光を 先にする（テレポートのあと 古い列を捨てるのを待たずに 開始できるように）
    if (far !== null && this._ready) return { kind: 'unload', c: far, dist: farD, col: far.cx, row: far.cz };
    // 2. 開始の前に要る保険の列（K6）は、輪の外でも先に読みこむ
    if (!this._ready) {
      for (const r of this.d.required?.() ?? []) {
        this.reqSeen.add(colKey(r.cx, r.cz));
        if (!this.cols.has(colKey(r.cx, r.cz))) return { kind: 'gen', cx: r.cx, cz: r.cz, dist: -1, col: r.cx, row: r.cz };
      }
    }
    // 3. 生成・光（近い順）
    let best: StreamJob | null = null;
    for (let dz = -getRing().gen; dz <= getRing().gen; dz++) {
      for (let dx = -getRing().gen; dx <= getRing().gen; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const dist = Math.max(Math.abs(dx), Math.abs(dz));
        const c = this.cols.get(colKey(cx, cz));
        let cand: StreamJob | null = null;
        if (c === undefined) {
          cand = { kind: 'gen', cx, cz, dist, col: cx, row: cz };
        } else if (c.stage === 'generated' && dist <= getRing().light && !(this.d.holdLight?.(cx, cz) ?? false) && canLight((a, b) => this.isGenerated(a, b), cx, cz)) {
          cand = { kind: 'light', c, dist, col: cx, row: cz };
        }
        if (cand === null) continue;
        if (best === null || betterJob(pcx, pcz, cand, best)) best = cand;
      }
    }
    void w;
    if (best === null && far !== null) return { kind: 'unload', c: far, dist: farD, col: far.cx, row: far.cz };
    return best;
  }

  /** 開始の前で、保険の列として要る列か（輪の外でも 捨てない） */
  private isRequiredNow(cx: number, cz: number): boolean {
    const k = colKey(cx, cz);
    if (this._ready) return this.keepReq !== null && this.tick < this.keepReq.until && this.keepReq.keys.has(k);
    // 読みこんで 当てた列は required から消える。ready までは reqSeen で覚えておく（pickStreamJob が 毎回 1 回だけ足す）
    return this.reqSeen.has(k);
  }

  private runStreamJob(j: StreamJob): void {
    if (j.kind === 'light') {
      this.d.light.lightColumn(j.c.cx, j.c.cz);
      j.c.stage = 'lit';
      return;
    }
    if (j.kind === 'gen') this.startLoad(j.cx, j.cz);
  }

  private startLoad(cx: number, cz: number): void {
    const io = this.d.io;
    const k = colKey(cx, cz);
    if (io.has(cx, cz)) {
      const r = io.read(cx, cz);
      if (r instanceof Promise) {
        this.cols.set(k, { cx, cz, stage: 'loading' });
        r.then(
          (col) => this.arrivals.push({ cx, cz, col }),
          () => this.arrivals.push({ cx, cz, col: null }),
        );
        return;
      }
      this.install(cx, cz, r, true);
      return;
    }
    this.install(cx, cz, null, false);
  }

  /** col が null なら 作る。fromSave: 保存にあった列（null = こわれていた → 作って さわった扱い） */
  private install(cx: number, cz: number, col: ChunkColumn | null, fromSave: boolean): void {
    let c = col;
    let how: 'generated' | 'saved' = 'saved';
    if (c === null) {
      c = this.d.io.generate(cx, cz);
      how = 'generated';
    }
    this.d.world.loadColumn(c);
    this.cols.set(colKey(cx, cz), { cx, cz, stage: 'generated' });
    if (how === 'saved') this.totals.readFromSave++;
    else {
      this.totals.generated++;
      if (fromSave) this.d.world.requeueSaveDirty([{ cx, cz }]); // こわれた列は 作りなおして 次の保存で上書き
    }
    this.d.onLoaded?.(cx, cz, how);
  }

  private drainArrivals(): void {
    if (this.arrivals.length === 0) return;
    const list = this.arrivals.splice(0);
    for (const a of list) {
      const k = colKey(a.cx, a.cz);
      const c = this.cols.get(k);
      if (c === undefined || c.stage !== 'loading') continue;
      if (cheb(a.cx, a.cz, this.cx, this.cz) > getRing().keep && !this.isRequiredNow(a.cx, a.cz)) {
        this.cols.delete(k); // 輪の外になった: 取り消す
        continue;
      }
      this.install(a.cx, a.cz, a.col, true);
    }
  }

  // ------------------------------------------------------------ 捨てる

  private canDiscard(cx: number, cz: number): boolean {
    const io = this.d.io;
    if (!io.persistent()) return true; // ページの中の入れ物には その場で預けられる
    return !this.d.world.isSaveDirty(cx, cz) && !io.writing(cx, cz);
  }

  private doUnload(c: Col): boolean {
    const w = this.d.world;
    const io = this.d.io;
    const k = colKey(c.cx, c.cz);
    if (!io.persistent() && w.isSaveDirty(c.cx, c.cz)) {
      const col = w.column(c.cx, c.cz);
      if (col !== undefined) io.keep(col);
      this.totals.savedBeforeUnload++;
    }
    if (this.waited.delete(k)) this.totals.savedBeforeUnload++;
    w.unloadColumn(c.cx, c.cz);
    this.cols.delete(k);
    this.totals.unloaded++;
    return true;
  }

  /**
   * 輪の外（> keep）で まだ捨てていない列の数（unloadPending）。そのうち、保存の書き終わりを待って いま捨てられない列は
   * 「待たせた列」として覚える。blocked = 待たせている列の数
   */
  private countUnloadWait(): void {
    let n = 0;
    let blocked = 0;
    for (const c of this.cols.values()) {
      if (c.stage === 'loading') continue;
      if (cheb(c.cx, c.cz, this.cx, this.cz) <= getRing().keep) continue;
      n++;
      if (!this.canDiscard(c.cx, c.cz)) {
        blocked++;
        this.waited.add(colKey(c.cx, c.cz));
      }
    }
    this.unloadWait = n;
    this.blockedWait = blocked;
  }

  // ------------------------------------------------------------ 見る（窓口）

  info(): StreamInfo {
    const columns = { loading: 0, generated: 0, lit: 0, meshed: 0 };
    for (const c of this.cols.values()) {
      if (c.stage === 'loading') columns.loading++;
      else if (c.stage === 'generated') columns.generated++;
      else if (cheb(c.cx, c.cz, this.cx, this.cz) <= getRing().draw && this.d.mesh.columnState(c.cx, c.cz) !== 'none') columns.meshed++;
      else columns.lit++;
    }
    return {
      ready: this._ready,
      phase: this._phase,
      progress: this._progress,
      center: { cx: this.cx, cz: this.cz },
      columns,
      queued: this.queuedCount(),
      saving: this.d.io.saving(),
      unloadPending: this.unloadWait,
      totals: { ...this.totals },
      frameMs: { ...this.frame },
    };
  }

  /** 待っている仕事の数（0 = 輪が ぜんぶそろった） */
  queuedCount(): number {
    let n = 0;
    const pcx = this.cx;
    const pcz = this.cz;
    for (let dz = -getRing().gen; dz <= getRing().gen; dz++) {
      for (let dx = -getRing().gen; dx <= getRing().gen; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dz));
        const c = this.cols.get(colKey(pcx + dx, pcz + dz));
        if (c === undefined) n++;
        else if (c.stage === 'loading') n++;
        else if (c.stage === 'generated' && dist <= getRing().light) n++;
      }
    }
    for (const c of this.cols.values()) if (c.stage !== 'loading' && cheb(c.cx, c.cz, pcx, pcz) > getRing().keep) n++;
    return n + this.d.mesh.pendingJobs();
  }

  /** 持っている列の数の上限（R6）。テスト用 */
  static readonly MAX = MAX_COLUMNS;
  static readonly RING_SIZES = [ringCount(R_DRAW), ringCount(R_LIGHT), ringCount(R_GEN)] as const;
}

type StreamJob =
  | { kind: 'unload'; c: Col; dist: number; col: number; row: number }
  | { kind: 'light'; c: Col; dist: number; col: number; row: number }
  | { kind: 'gen'; cx: number; cz: number; dist: number; col: number; row: number };

/** a が b より先か（距離 → 光が生成より先 → S3 の並び） */
function betterJob(pcx: number, pcz: number, a: StreamJob, b: StreamJob): boolean {
  if (a.dist !== b.dist) return a.dist < b.dist;
  if (a.kind !== b.kind) return a.kind === 'light';
  return compareNear(pcx, pcz, { cx: a.col, cz: a.row }, { cx: b.col, cz: b.row }) < 0;
}
