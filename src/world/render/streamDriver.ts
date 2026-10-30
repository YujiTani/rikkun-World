import { columnKey } from '../VoxelWorld';
import type { FrameClock } from '../frameClock';
import type { StreamLight, StreamMesh } from '../stream/ChunkStream';
import { cheb, getRing } from '../stream/ring';
import { CHUNK_DRAW_DISTANCE } from './config';
import type { SectionMeshStore } from './sectionMeshStore';
import type { ColState, SecState } from './sectionState';

/** 時間の時計で 差しかえを先にする 足もとの距離（ブロック） */
const NEAR_UPGRADE_DIST = 24;

/** 同じ優先なら: 輪の距離 → 中心どうしの距離 → cz → cx（S3） */
function jobBefore(col: ColState, e: number, bd: number, be: number, other: ColState): boolean {
  if (col.ring !== bd) return col.ring < bd;
  if (e !== be) return e < be;
  if (col.cz !== other.cz) return col.cz < other.cz;
  return col.cx < other.cx;
}

/** ストリーミングが WorldRenderer に 頼むこと（WorldRenderer が 作って渡す。StreamDriver は WorldRenderer を知らない） */
interface StreamHost {
  newCol(cx: number, cz: number): ColState;
  setTier(col: ColState): boolean;
  enqueue(st: SecState): void;
  dequeue(st: SecState): void;
  dropMeshes(st: SecState): void;
  dropLod(col: ColState): void;
  takeChanges(): void;
  needsWork(st: SecState): boolean;
  waitsForJob(st: SecState): boolean;
  checkJob(): void;
  build(st: SecState, boxOnly: boolean, deadline?: number): void;
  rebuildLod(col: ColState): void;
  updateLod(col: ColState): void;
}

/**
 * ストリーミング（VOX-D）: 列は ChunkStream が光を計算した順に足し、メッシュは 描く輪の中だけ、1 つずつ stream が進める。
 * WorldRenderer から分けた（4-7）。列の辞書は WorldRenderer と同じものを読み書きする。
 */
export class StreamDriver {
  /** ストリーミングにしたか */
  on = false;
  private ringC = { cx: 0, cz: 0 };
  /** 光を計算ずみの列 */
  private readonly litCols = new Set<number>();
  /** 箱から小ブロックへの差しかえを してよいか（ストリーミングでは ready のあと） */
  private upgradesOn = true;

  constructor(
    private readonly cols: Map<number, ColState>,
    private readonly clock: FrameClock,
    private readonly store: SectionMeshStore,
    private readonly light: { lightColumn(cx: number, cz: number): void },
    private readonly host: StreamHost,
  ) {}

  /** ストリーミングにする（列を足す前に 1 回）。開始(ready)まで 箱から小ブロックへの差しかえは しない */
  enable(): void {
    this.on = true;
    this.upgradesOn = false;
  }

  /** ChunkStream の光の窓口。1 列の光を計算し、その列を 描く候補に足す */
  streamLight(): StreamLight {
    return {
      lightColumn: (cx, cz) => {
        this.light.lightColumn(cx, cz);
        this.noteLit(cx, cz);
      },
    };
  }

  /** ChunkStream のメッシュの窓口 */
  streamMesh(): StreamMesh {
    return {
      setRing: (cx, cz) => this.setRing(cx, cz),
      pendingJobs: () => this.pendingJobs(),
      nextJobDist: () => this.nextJobDist(),
      runJob: (deadline) => this.runJob(deadline),
      columnState: (cx, cz) => this.columnState(cx, cz),
      allowUpgrades: (on) => {
        this.upgradesOn = on;
      },
      lastJob: () => ({ meshes: this.store.logged, micro: this.store.loggedMicro }),
    };
  }

  /** 光ができた列を足す */
  noteLit(cx: number, cz: number): void {
    this.host.takeChanges(); // 読みこんだときの「変わった」を ここで受けとる（作る前に 作りなおしにならないように）
    this.litCols.add(columnKey(cx, cz));
    const k = columnKey(cx, cz);
    if (!this.cols.has(k)) {
      const col = this.host.newCol(cx, cz);
      this.cols.set(k, col);
      this.setRingOf(col);
      this.host.setTier(col);
      for (const st of col.secs) this.host.enqueue(st);
    }
    this.refreshMeshable(cx, cz);
  }

  /** 世界から列を捨てた（ブロックを捨てる前後どちらでもよい）。この列の絵と状態を捨てる。となりの絵は そのまま */
  noteUnloaded(cx: number, cz: number): void {
    const k = columnKey(cx, cz);
    this.litCols.delete(k);
    const col = this.cols.get(k);
    if (col !== undefined) {
      for (const st of col.secs) {
        this.host.dropMeshes(st);
        this.host.dequeue(st);
      }
      this.host.dropLod(col);
      this.cols.delete(k);
    }
    this.refreshMeshable(cx, cz);
  }

  private refreshMeshable(cx: number, cz: number): void {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cols.get(columnKey(cx + dx, cz + dz));
        if (c === undefined) continue;
        let ok = true;
        for (let ez = -1; ez <= 1 && ok; ez++) for (let ex = -1; ex <= 1; ex++) if (!this.litCols.has(columnKey(c.cx + ex, c.cz + ez))) { ok = false; break; }
        c.meshable = ok;
      }
    }
  }

  private setRingOf(col: ColState): void {
    col.ring = cheb(col.cx, col.cz, this.ringC.cx, this.ringC.cz);
    col.inDraw = col.ring <= getRing().draw;
  }

  /** 描く輪の中心（プレイヤーのいる列）。輪の外（> R_DRAW_DROP）になった列の絵は捨てる */
  setRing(cx: number, cz: number): void {
    this.ringC = { cx, cz };
    for (const col of this.cols.values()) {
      const was = col.inDraw;
      this.setRingOf(col);
      if (col.ring > getRing().drawDrop) {
        for (const st of col.secs) {
          if (st.built !== null || st.voxel || st.extras || st.water) this.host.dropMeshes(st);
          st.built = null;
          st.dirty = true;
          st.evicted = false;
          this.host.dequeue(st);
        }
        if (col.lodOpaque || col.lodWater) this.host.dropLod(col);
        col.lodStale = true;
        col.lodHold = false;
      } else if (col.inDraw && !was) {
        for (const st of col.secs) this.host.enqueue(st);
      } else if (!col.inDraw && was) {
        for (const st of col.secs) this.host.dequeue(st);
      }
    }
  }

  /** この列の LOD を いま作る仕事があるか */
  private lodJob(col: ColState): boolean {
    return col.lodStale && col.tier === 'lod' && col.dist <= CHUNK_DRAW_DISTANCE && col.inDraw && col.meshable;
  }

  lodJobCount(): number {
    if (!this.on) return 0;
    let n = 0;
    for (const col of this.cols.values()) if (this.lodJob(col)) n++;
    return n;
  }

  /** 光ずみで まだ作っていない仕事の数（セクション 1 つ・LOD 1 列が 1 つ） */
  pendingJobs(): number {
    let n = this.lodJobCount();
    for (const col of this.cols.values()) {
      if (!col.meshable || !col.inDraw) continue;
      for (const st of col.work) if (this.host.needsWork(st)) n++;
    }
    return n;
  }

  private pickJob(): { col: ColState; st: SecState | null; p: number } | null {
    this.host.checkJob();
    let best: { col: ColState; st: SecState | null; p: number } | null = null;
    let bd = Infinity;
    let be = Infinity;
    const { cx: pcx, cz: pcz } = this.ringC;
    for (const col of this.cols.values()) {
      if (!col.inDraw || !col.meshable) continue;
      let p = Infinity;
      let bs: SecState | null = null;
      for (const st of col.work) {
        if (!this.host.needsWork(st)) {
          if (!st.evicted) this.host.dequeue(st);
          continue;
        }
        // 時間の時計のときだけ: 足もと（16 ブロック以内）の 箱 → 小ブロックの差しかえを、初めて作る箱・LOD より先に（PERF-2 続き）
        const sp = st.player ? 0 : st.built === null || st.dirty ? 1 : this.clock === 'time' && col.dist <= NEAR_UPGRADE_DIST ? 0.5 : 2;
        if ((sp === 2 || sp === 0.5) && !this.upgradesOn) continue;
        if (this.host.waitsForJob(st)) continue;
        if (sp < p || (sp === p && bs !== null && st.sy < bs.sy)) {
          p = sp;
          bs = st;
        }
      }
      if (this.lodJob(col) && p > 1) {
        p = 1;
        bs = null;
      }
      if (p === Infinity) continue;
      const e = (col.cx - pcx) ** 2 + (col.cz - pcz) ** 2;
      const better = best === null || p < best.p || (p === best.p && jobBefore(col, e, bd, be, best.col));
      if (better) {
        best = { col, st: bs, p };
        bd = col.ring;
        be = e;
      }
    }
    return best;
  }

  /** 次の仕事の近さ（チェビシェフ。プレイヤーが変えた所は −1）。無ければ null */
  nextJobDist(): number | null {
    const j = this.pickJob();
    if (j === null) return null;
    return j.p === 0 ? -1 : j.col.ring;
  }

  /** 仕事を 1 つ進める（セクション 1 つのメッシュ、または 列 1 つの LOD）。進めたら true */
  runJob(deadline?: number): boolean {
    const j = this.pickJob();
    if (j === null) return false;
    this.store.logged = 0;
    this.store.loggedMicro = false;
    if (j.st !== null) this.host.build(j.st, false, deadline);
    else {
      this.store.logged = 1;
      this.host.rebuildLod(j.col);
      this.host.updateLod(j.col);
    }
    return true;
  }

  /** 'true' = その列の本当の段まで・'drawn' = 何かの絵を出している・'none' = まだ */
  columnState(cx: number, cz: number): 'none' | 'drawn' | 'true' {
    const col = this.cols.get(columnKey(cx, cz));
    if (col === undefined || col.tier === null || !col.meshable) return 'none';
    if (col.tier === 'lod') {
      if (col.dist > CHUNK_DRAW_DISTANCE) return 'true'; // 描くものが無い
      // 作り直し待ち（まわりのマスが変わった）でも、前の LOD を見せている間は 'drawn'（一瞬 絵なしと数えない。#214）
      if (col.lodStale) return col.lodOpaque || col.lodWater ? 'drawn' : 'none';
      return 'true';
    }
    let all = true;
    for (const st of col.secs) {
      if (st.built === null) return 'none';
      if (this.host.needsWork(st)) all = false;
    }
    return all ? 'true' : 'drawn';
  }
}
