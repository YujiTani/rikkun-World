import { columnKey } from '../VoxelWorld';
import type { FrameClock } from '../frameClock';
import type { StreamLight, StreamMesh } from '../stream/ChunkStream';
import type { RingCenter } from '../stream/layout';
import { getRing, type RingSpec } from '../stream/ring';
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
  /** 全部の列の 段(小ブロック・箱・LOD)を 決めなおす */
  retier(): void;
}

/**
 * ストリーミング（VOX-D）: 列は ChunkStream が光を計算した順に足し、メッシュは 描く輪の中だけ、1 つずつ stream が進める。
 * WorldRenderer から分けた（4-7）。列の辞書は WorldRenderer と同じものを読み書きする。
 */
export class StreamDriver {
  /** ストリーミングにしたか */
  on = false;
  /** 描く輪の 中心（COOP-1: 1P と、いれば 2P。1 人のときは 長さ 1） */
  private centers: RingCenter[] = [{ cx: 0, cz: 0 }];
  /** setLayout で もらった 輪。無ければ getRing() */
  private spec: RingSpec | null = null;
  /** 2P の 正しい 位置（水平。COOP-1）。無ければ 2 つ目の 中心の 列の まん中 */
  private viewer2: { x: number; z: number } | null = null;
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
      setLayout: (centers, spec) => this.setLayout(centers, spec),
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
    let best = Infinity;
    for (const c of this.centers) {
      const d = Math.max(Math.abs(col.cx - c.cx), Math.abs(col.cz - c.cz));
      if (d < best) best = d;
    }
    col.ring = best; // どの 中心からでも いい、いちばん 近い 中心との チェビシェフ距離（COOP-1 §5）
    col.inDraw = col.ring <= (this.spec ?? getRing()).draw;
  }

  /** 中心との ユークリッド距離の 2 乗（近い 方の 中心。同じ 輪の 距離の 並び用） */
  private nearEuclid(col: ColState): number {
    let best = Infinity;
    for (const c of this.centers) {
      const e = (col.cx - c.cx) ** 2 + (col.cz - c.cz) ** 2;
      if (e < best) best = e;
    }
    return best;
  }

  /** 描く輪の中心（プレイヤーのいる列）。輪の外（> R_DRAW_DROP）になった列の絵は捨てる。setLayout の 中心 1 つの ばん */
  setRing(cx: number, cz: number): void {
    this.setLayout([{ cx, cz }], getRing());
  }

  /** 1P の ほかに 絵の 段(小ブロック・箱・LOD)を 決める 点（2P。無ければ null） */
  extraViewer(): { x: number; z: number } | null {
    if (this.viewer2 !== null) return this.viewer2;
    const c = this.centers[1];
    return c === undefined ? null : { x: c.cx * 16 + 8, z: c.cz * 16 + 8 };
  }

  /** 2P の 正しい 位置（水平）。null = いない。動いたら 段を 決めなおす */
  setViewer2(p: { x: number; z: number } | null): void {
    const v = this.viewer2;
    if (p === null ? v === null : v !== null && v.x === p.x && v.z === p.z) return;
    this.viewer2 = p === null ? null : { x: p.x, z: p.z };
    this.host.retier();
  }

  /** 描く輪の 中心（1 つか 2 つ）と 大きさ（COOP-1）。どの 中心からも 遠い（> drawDrop）列の 絵は 捨てる */
  setLayout(centers: readonly RingCenter[], spec: RingSpec): void {
    const hadTwo = this.centers.length > 1;
    this.centers = centers.map((c) => ({ cx: c.cx, cz: c.cz }));
    this.spec = spec;
    for (const col of this.cols.values()) {
      const was = col.inDraw;
      this.setRingOf(col);
      if (col.ring > spec.drawDrop) {
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
    if (hadTwo || this.centers.length > 1) this.host.retier(); // 2P の まわりも 近い 段(小ブロック・箱)で 描く
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
      const e = this.nearEuclid(col);
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
