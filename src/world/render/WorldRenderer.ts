import { Group, type MeshBasicMaterial, type Scene } from 'three';
import type { CropStageSource } from '../../contracts';
import { COUNT_MESH_MAX, COUNT_MESH_TOTAL_MAX, type FrameClock } from '../frameClock';
import { WorldLight } from '../light/WorldLight';
import { lodSortKey } from './drawOrder';
import { columnKey, type ArrayVoxelWorld } from '../VoxelWorld';
import type { StreamLight, StreamMesh } from '../stream/ChunkStream';
import { CHUNK_DRAW_DISTANCE, RENDER_CONFIG } from './config';
import { setRipeMinBrightness } from './cropLight';
import { meshChunkLod } from './lodMesh';
import { sectionAllAir, sectionHasCross } from './rendererGeometry';
import { createRenderMaterials, disposeRenderMaterials, type RenderMaterials } from './rendererMaterials';
import { chunkStats, meshCount, meshDigest, sectionStats, triangleCount } from './rendererStats';
import type {
  ChunkStats, MeshJobStats, MeshStats, NoneReason, RebuildLogEntry, RebuildStats, SectionInfo, SectionStats, SectionTier, WorldRenderConfig,
} from './rendererTypes';
import { SectionMeshStore } from './sectionMeshStore';
import {
  CLS_AIR, CLS_HIDDEN, CLS_NORMAL, CLS_UNKNOWN, newColState, type Cls, type ColState, type SecState,
} from './sectionState';
import { StreamDriver } from './streamDriver';
import { SwayDriver } from './swayDriver';
import { pickEvictions } from './voxel/geometryBudget';
import { setAoCenter, setAoRadius } from './voxel/aoUniforms';
import { updateGlow } from './voxel/glowUniforms';
import { SectionMesher } from './voxel/sectionMesher';
import { DEFAULT_MICRO_R, columnDistance, nextTier, normalizeMicroR } from './voxel/tier';

export type {
  ChunkStats, MeshJobStats, MeshStats, NoneReason, RebuildLogEntry, RebuildStats, SectionInfo, SectionStats, SectionTier, WorldRenderConfig,
} from './rendererTypes';

/** 1 コマの作り直しの予算（ミリ秒）。VOX-E §5 */
const FRAME_BUDGET_MS = 8;
/** セクションのジオメトリの合計の上限（バイト）。こえたら 遠い順に dispose */
export const GEOMETRY_BYTES_LIMIT = 192 * 1024 * 1024;
/** 捨てたあと、この割合より下になったら また作る */
const REVIVE_RATIO = 0.75;

/**
 * 世界をセクション（16³）ごとのメッシュで描く（VOX-E。docs/design/VOX-plan.md §5・§6）。
 * - 近さの段（列ごと）: 小ブロック（r 以内。既定 32）→ 1 マスの箱＋9×9 の模様（〜48）→ LOD（列ごと 1 まい。〜88）。r の出入りは ±2 ずらす。
 * - メッシュはセクションごとに 不透明（小ブロック/箱）・絵（たいまつ・十字の板）・水。全部空気・見えない・光が未計算のセクションは作らない。
 * - ブロックを変えたら、そのセクション（ふちならとなり）だけ作り直す。1 コマ 8ms までの予算で、
 *   プレイヤーが変えた所 → はじめて作る所（近い順）→ 箱から小ブロックへの差しかえ（近い順）。
 *   小ブロックが間に合わない所は 先に箱で出す。
 * - 描く輪の外に出たセクションのメッシュは dispose。合計が上限をこえたら 遠い順に dispose。
 */
export class WorldRenderer {
  readonly group = new Group();
  /** F3 の設定などで書きかえる（毎コマ読む） */
  readonly config: WorldRenderConfig = { microRadius: DEFAULT_MICRO_R };
  /** セクションのジオメトリの合計の上限（バイト） */
  geometryBytesLimit = GEOMETRY_BYTES_LIMIT;
  private readonly cols = new Map<number, ColState>();
  private readonly mats: RenderMaterials;
  /** セクションのメッシュを group に 取りつける・捨てる（ジオメトリのバイト数・AO のメモリ・作り直しの記録もここ） */
  private readonly store: SectionMeshStore;
  /** ストリーミング（VOX-D）: 列は ChunkStream が光を計算した順に足し、メッシュは 描く輪の中だけ、1 つずつ stream が進める */
  private readonly stream: StreamDriver;
  /** なでた ゆれ（M7-2）: ゆれ中の 作物 を 専用メッシュ で 描き、セクション側 の 板 は 隠す */
  private readonly sway: SwayDriver;
  /** 1 回で作る（箱・プレイヤーが変えた所・count の時計・attach の一気） */
  private readonly mesher: SectionMesher;
  /** 分けて作る小ブロックの仕事 1 つ（はじめて使うときに作る。約 13 MB） */
  private sliceMesher: SectionMesher | null = null;
  private job: { st: SecState; gen: number; cpuMs: number; slices: number } | null = null;
  private jobStats: MeshJobStats = { active: null, finished: 0, cancelled: 0, slices: 0, maxSliceMs: 0 };
  private readonly nSections: number;
  private attached = false;
  private viewer: { x: number; z: number } | null = null;
  private microR = DEFAULT_MICRO_R;
  private crops: CropStageSource | undefined;
  private readonly queue = new Set<SecState>();
  private evictedCount = 0;
  private stats: RebuildStats = { lastMs: 0, count: 0 };
  /** 光（置く・こわすと近くだけ計算し直す）。Sky・妖怪の出現・テストが読む */
  readonly light: WorldLight;
  /** メッシュを足す・捨てる・見せ方を変えるたびに 1 増える（#144 影の試作: 影の地図を描き直す合図） */
  meshVersion = 0;
  /** メッシュが変わった列 (cx, cz) を知らせる（影の地図が範囲に入るときだけ描き直すため） */
  onMeshChange: ((cx: number, cz: number) => void) | null = null;

  /**
   * microRadius: はじめの小ブロックの半径（0 = 小ブロックなし）。作るときに渡すので、最初の update を待たずに効く
   * （列の段も 光る前から この半径で決まる。#180: E2E のサーバーは 細かいメッシュを 1 つも作らない）。
   */
  constructor(
    private readonly world: ArrayVoxelWorld,
    microRadius: number = DEFAULT_MICRO_R,
    private readonly clock: FrameClock = 'time',
    private readonly now: () => number = () => performance.now(),
  ) {
    this.microR = normalizeMicroR(microRadius);
    this.config.microRadius = this.microR;
    this.light = new WorldLight(world, undefined, clock);
    this.mesher = new SectionMesher(world, this.light);
    this.nSections = Math.ceil(world.size.y / 16);
    this.group.name = 'world';
    this.mats = createRenderMaterials(this.microR);
    this.store = new SectionMeshStore(this.group, this.mats, (cx, cz) => this.meshChanged(cx, cz));
    this.sway = new SwayDriver(world, this.light, this.group, this.mats.opaqueMaterial);
    this.stream = new StreamDriver(this.cols, clock, this.store, this.light, {
      newCol: (cx, cz) => newColState(cx, cz, this.nSections),
      setTier: (col) => this.setTier(col),
      enqueue: (st) => this.enqueue(st),
      dequeue: (st) => this.dequeue(st),
      dropMeshes: (st) => this.store.dropMeshes(st),
      dropLod: (col) => this.dropLod(col),
      takeChanges: () => this.takeChanges(),
      needsWork: (st) => this.needsWork(st),
      waitsForJob: (st) => this.waitsForJob(st),
      checkJob: () => this.checkJob(),
      build: (st, boxOnly, deadline) => this.build(st, boxOnly, deadline),
      rebuildLod: (col) => this.rebuildLod(col),
      updateLod: (col) => this.updateLod(col),
    });
    this.syncColumns();
  }

  // ------------------------------------------------------------ 列・セクションの状態

  /** 読みこんである列と 状態を合わせる（足す・捨てる） */
  private syncColumns(): void {
    if (this.stream.on) return;
    const loaded = this.world.loadedColumns();
    if (loaded.length === this.cols.size && loaded.every((c) => this.cols.has(columnKey(c.cx, c.cz)))) return;
    const seen = new Set<number>();
    for (const c of loaded) {
      const k = columnKey(c.cx, c.cz);
      seen.add(k);
      if (!this.cols.has(k)) {
        const col = newColState(c.cx, c.cz, this.nSections);
        this.cols.set(k, col);
        this.setTier(col);
        for (const st of col.secs) this.enqueue(st);
      }
    }
    for (const [k, col] of this.cols) {
      if (seen.has(k)) continue;
      for (const st of col.secs) {
        this.store.dropMeshes(st);
        this.dequeue(st);
      }
      this.dropLod(col);
      this.cols.delete(k);
    }
  }

  private colAt(cx: number, cz: number): ColState | undefined {
    return this.cols.get(columnKey(cx, cz));
  }

  private enqueue(st: SecState): void {
    if (st.queued) return;
    if (this.stream.on && !st.col.inDraw) return; // 描く輪の外は 仕事にしない
    st.queued = true;
    this.queue.add(st);
    st.col.work.add(st);
  }

  private dequeue(st: SecState): void {
    st.queued = false;
    this.queue.delete(st);
    st.col.work.delete(st);
  }

  /** この列の段を、いまの視点・半径で決める。変わったら true */
  private setTier(col: ColState): boolean {
    const v = this.viewer;
    col.dist = v ? columnDistance(col.cx, col.cz, v.x, v.z) : 0;
    const next = nextTier(col.dist, col.tier, this.microR);
    if (next === col.tier) return false;
    const was = col.tier;
    col.tier = next;
    if (next === 'lod') {
      // 箱・小ブロックを捨てて、LOD に
      for (const st of col.secs) {
        this.store.dropMeshes(st);
        st.built = null;
        st.dirty = true;
        this.dequeue(st);
      }
      col.lodHold = false;
    } else {
      if (was === 'lod' && col.lodOpaque) col.lodHold = true;
      for (const st of col.secs) this.enqueue(st);
    }
    return true;
  }

  private retier(): void {
    for (const col of this.cols.values()) {
      this.setTier(col);
      this.updateLod(col);
    }
  }

  // ------------------------------------------------------------ 視点

  /**
   * カメラの水平の位置を伝える。段（小ブロック・箱・LOD）を 決めなおす（位置が変わったときだけ）。
   * メッシュの作りは update() が 予算の中で進める。毎コマ呼んでよい。
   */
  setViewer(x: number, z: number): void {
    const v = this.viewer;
    if (v && v.x === x && v.z === z) return;
    this.light.setViewer(x, z);
    setAoCenter(x, z);
    if (v) {
      v.x = x;
      v.z = z;
    } else {
      this.viewer = { x, z };
    }
    this.retier();
  }

  /** window.__rikkun.render.chunks() 用 */
  chunkStats(): ChunkStats {
    return chunkStats(this.cols);
  }

  /**
   * 作物の段階を聞く先を決める（A の FarmSystem）。作物のあるセクションを 作り直す（1 回だけ）。
   * 段階が変わったときは A が `world.touch` するので、そのセクションだけ作り直される。
   */
  setCropStageSource(src: CropStageSource | undefined): void {
    this.crops = src;
    if (!this.attached) return;
    for (const col of this.cols.values()) {
      for (const st of col.secs) {
        const sec = this.world.section(st.cx, st.sy, st.cz);
        if (sec && sectionHasCross(sec)) this.markDirty(st, false);
      }
    }
  }

  /** みのった作物の明るさの下限（設定 `farmRipeMinBrightness`）。設定を変えたら呼ぶ */
  setRipeMinBrightness(v: number): void {
    setRipeMinBrightness(v);
  }

  private markDirty(st: SecState, player: boolean): void {
    st.dirty = true;
    st.gen++;
    st.byChange = true;
    if (player) st.player = true;
    st.col.lodStale = true;
    if (st.col.tier !== 'lod') this.enqueue(st);
  }

  /** scene に入れて、まず 全部のセクションを 箱で作る（小ブロックへの差しかえは update が少しずつ） */
  attach(scene: Scene): void {
    scene.add(this.group);
    if (this.attached) return;
    this.attached = true;
    this.world.takeDirtySectionsEx();
    this.world.takeDirtyChunks();
    this.syncColumns();
    if (this.stream.on) return; // 作るのは ChunkStream の runJob
    for (const col of this.cols.values()) this.updateLod(col);
    this.process(Number.POSITIVE_INFINITY, true);
    for (const col of this.cols.values()) this.updateLod(col);
  }

  // ------------------------------------------------------------ 毎コマ

  /** 変わったセクションを作り直す。毎コマ呼んでよい（変化が無ければすぐ終わる） */
  update(viewer?: { x: number; z: number }): void {
    this.store.frame++;
    if (viewer) this.setViewer(viewer.x, viewer.z);
    const r = normalizeMicroR(this.config.microRadius);
    if (r !== this.microR) {
      this.microR = r;
      setAoRadius(r);
      this.retier();
    }
    this.light.update();
    updateGlow(performance.now() / 1000); // ほたるいしの いき（見た目だけ。ゲームの 時間には 関係しない）
    if (!this.attached) return;
    this.syncColumns();
    this.sway.sync();
    this.world.settleExposure();
    this.takeChanges();
    if (!this.stream.on) this.process(FRAME_BUDGET_MS, false);
    this.manageBytes();
    for (const col of this.cols.values()) if (col.lodHold || col.lodStale) this.updateLod(col);
    this.sway.draw(this.crops);
  }

  /** 世界が教えてくれた「変わったセクション」を 作り直し待ちに入れる */
  private takeChanges(): void {
    const changed = this.world.takeDirtySectionsEx();
    this.world.takeDirtyChunks(); // 列の dirty は このクラスでは使わない（ためないように空にする）
    if (changed.length === 0) return;
    for (const d of changed) {
      const col = this.colAt(d.cx, d.cz);
      if (!col || d.sy >= col.secs.length) continue;
      this.markDirty(col.secs[d.sy], d.block);
    }
    // ブロックが変わると となりのセクションの「見えない」「全部空気」も変わる: 変わったとなりも作り直す
    for (const d of changed) {
      if (!d.block) continue;
      for (const [dx, dy, dz] of NEIGHBORS) {
        const nc = this.colAt(d.cx + dx, d.cz + dz);
        const ns = nc?.secs[d.sy + dy];
        if (!ns || ns.cls === CLS_UNKNOWN) continue;
        if (this.classify(ns) !== ns.cls) this.markDirty(ns, false);
      }
    }
  }

  private classify(st: SecState): Cls {
    const sec = this.world.section(st.cx, st.sy, st.cz);
    if (!sec || sectionAllAir(sec)) return CLS_AIR;
    if (this.world.isSectionHidden(st.cx, st.sy, st.cz)) return CLS_HIDDEN;
    return CLS_NORMAL;
  }

  private needsWork(st: SecState): boolean {
    const col = st.col;
    if (col.tier === null || col.tier === 'lod') return false;
    if (this.stream.on && !col.inDraw) return false;
    if (st.evicted) {
      if (this.store.bytes > this.geometryBytesLimit * REVIVE_RATIO) return false;
    }
    return st.dirty || st.built !== col.tier;
  }

  /** 次に作るセクション: プレイヤーが変えた所 → はじめて作る・変わった所（近い順）→ 箱から小ブロックへの差しかえ（近い順） */
  private pickNext(maxPrio: number): SecState | null {
    this.checkJob();
    let best: SecState | null = null;
    let bp = Infinity;
    let bd = Infinity;
    let bk = Infinity;
    for (const st of this.queue) {
      if (!this.needsWork(st)) {
        // 仕事が無くなったもの（段が変わったなど）は 待ちから外す
        if (!st.evicted) this.dequeue(st);
        continue;
      }
      if (!this.light.isColumnLit(st.cx, st.cz)) continue; // 光ができてから（光が計算されると dirty でもう一度来る）
      if (this.waitsForJob(st)) continue;
      const p = st.player ? 0 : st.built === null || st.dirty ? 1 : 2;
      if (p > maxPrio) continue;
      const d = st.col.dist;
      const k = columnKey(st.cx, st.cz) * 32 + st.sy;
      if (p < bp || (p === bp && (d < bd || (d === bd && k < bk)))) {
        best = st;
        bp = p;
        bd = d;
        bk = k;
      }
    }
    return best;
  }

  /** 予算（ミリ秒）のあいだ、待ちのセクションを 順に作る（かならず 1 つは作る）。boxOnly: 箱だけ（はじめの一気） */
  private process(budgetMs: number, boxOnly: boolean): void {
    if (this.clock === 'count' && Number.isFinite(budgetMs)) {
      this.processCount(boxOnly);
      return;
    }
    const t0 = this.now();
    let did = 0;
    for (;;) {
      if (did > 0 && this.now() - t0 >= budgetMs) break;
      const st = this.pickNext(boxOnly ? 1 : 2);
      if (!st) break;
      this.build(st, boxOnly, t0 + budgetMs);
      did++;
    }
  }

  /** count の時計: 作ったメッシュ 8 個まで（小ブロックは 1 個で そのコマはおしまい）。作らないものは数えず、合計 256 まで */
  private processCount(boxOnly: boolean): void {
    let made = 0;
    for (let n = 0; n < COUNT_MESH_TOTAL_MAX; n++) {
      // 1 つの作り直しで 最大 2 つ（本体＋水）のメッシュができる
      if (made > COUNT_MESH_MAX - 2) break;
      const st = this.pickNext(boxOnly ? 1 : 2);
      if (!st) break;
      this.store.logged = 0;
      this.store.loggedMicro = false;
      this.build(st, boxOnly);
      made += this.store.logged;
      if (this.store.loggedMicro) break;
    }
  }

  /**
   * セクション 1 つを作る。deadline が有限で 小ブロックなら、分けて作る（sliceMesher）: 締め切りまで進めて、できたら取りつける。
   * dirty は できたときに「始めてから markDirty が来たか」で決める（作っている間も 待ちに のこる）。
   */
  private build(st: SecState, boxOnly: boolean, deadline?: number): void {
    const col = st.col;
    const want = col.tier as 'micro' | 'box';
    const cls = this.classify(st);
    st.cls = cls;
    if (cls !== CLS_NORMAL) {
      // 全部空気・見えない: メッシュは作らない
      if (this.job?.st === st) this.cancelJob();
      this.store.dropMeshes(st);
      st.built = want;
      st.dirty = false;
      st.player = false;
      st.faceless = false;
      this.finishItem(st);
      return;
    }
    // 小ブロックが間に合わない（まだ何も無い）所は 先に箱で出す。プレイヤーが変えた所は すぐ本番
    const tier: 'micro' | 'box' = want === 'micro' && (boxOnly || (st.built === null && !st.player)) ? 'box' : want;
    const opts = {
      crops: this.crops,
      hide: this.sway.hidden.size > 0 ? this.sway.hideFn : undefined,
    };
    const slice =
      this.clock === 'time' &&
      deadline !== undefined &&
      Number.isFinite(deadline) &&
      tier === 'micro' &&
      !st.player &&
      this.config.meshSlice !== false &&
      (this.job === null || this.job.st === st);
    if (slice) {
      this.buildSliced(st, opts, deadline);
      return;
    }
    if (this.job?.st === st) this.cancelJob();
    const t = this.now();
    const data = this.mesher.build(st.cx, st.sy, st.cz, tier, opts);
    this.store.install(st, data, tier);
    const ms = this.now() - t;
    st.built = tier;
    st.dirty = false;
    st.player = false;
    this.stats = { lastMs: ms, count: this.stats.count + (st.byChange ? 1 : 0) };
    st.byChange = false;
    this.finishItem(st);
  }

  private buildSliced(st: SecState, opts: { crops: CropStageSource | undefined; hide: ((x: number, y: number, z: number) => boolean) | undefined }, deadline: number): void {
    let mesher = this.sliceMesher;
    if (mesher === null) mesher = this.sliceMesher = new SectionMesher(this.world, this.light);
    let job = this.job;
    if (job === null) {
      mesher.start(st.cx, st.sy, st.cz, 'micro', opts);
      job = this.job = { st, gen: st.gen, cpuMs: 0, slices: 0 };
    }
    const t = this.now();
    const data = mesher.resume(deadline, this.now);
    const ms = this.now() - t;
    job.cpuMs += ms;
    job.slices++;
    this.jobStats.slices++;
    if (ms > this.jobStats.maxSliceMs) this.jobStats.maxSliceMs = ms;
    if (data === null) return; // 続きは 次のコマ
    const t2 = this.now();
    this.store.install(st, data, 'micro');
    this.jobStats.finished++;
    this.job = null;
    st.built = 'micro';
    st.dirty = st.gen !== job.gen; // 作っている間に 中身が変わったら もう一度
    st.player = false;
    this.stats = { lastMs: job.cpuMs + (this.now() - t2), count: this.stats.count + (st.byChange ? 1 : 0) };
    st.byChange = st.dirty;
    this.finishItem(st);
  }

  /** この仕事は まだ作ってよいか（列が無い・段が変わった・輪の外・捨てた・プレイヤーが変えた なら捨てる） */
  private jobValid(st: SecState): boolean {
    if (this.cols.get(columnKey(st.cx, st.cz)) !== st.col) return false;
    if (st.col.tier !== 'micro') return false;
    if (this.stream.on && !st.col.inDraw) return false;
    return !st.evicted && !st.player;
  }

  private checkJob(): void {
    if (this.job !== null && !this.jobValid(this.job.st)) this.cancelJob();
  }

  private cancelJob(): void {
    if (this.job === null) return;
    this.sliceMesher?.cancel();
    this.job = null;
    this.jobStats.cancelled++;
  }

  /** 分けて作る仕事が ほかのセクションで 動いている間は、小ブロックで作るものは 待つ（箱の段・プレイヤーが変えた所は 先に 1 回で作る） */
  private waitsForJob(st: SecState): boolean {
    const j = this.job;
    if (j === null || j.st === st) return false;
    return !st.player && st.col.tier === 'micro' && st.built !== null && this.config.meshSlice !== false;
  }

  /** 分けて作る仕事の様子（hook world.meshJob） */
  meshJobStats(): MeshJobStats {
    const j = this.job;
    return { ...this.jobStats, active: j === null ? null : { cx: j.st.cx, sy: j.st.sy, cz: j.st.cz } };
  }

  private finishItem(st: SecState): void {
    if (!this.needsWork(st)) this.dequeue(st);
    this.afterBuilt(st.col);
  }

  /** LOD のあいだ見せていた列に セクションができたら LOD を消す */
  private afterBuilt(col: ColState): void {
    if (col.lodHold && !col.secs.some((s) => this.needsWork(s))) {
      col.lodHold = false;
      this.updateLod(col);
    }
  }

  /** 上限をこえたら 遠い順に捨てる。足りてきたら 捨てた所を また作る */
  private manageBytes(): void {
    if (this.store.bytes > this.geometryBytesLimit) {
      const entries: { key: number; bytes: number; dist: number }[] = [];
      const byKey = new Map<number, SecState>();
      for (const col of this.cols.values()) {
        for (const st of col.secs) {
          if (st.bytes <= 0) continue;
          const key = columnKey(st.cx, st.cz) * 32 + st.sy;
          byKey.set(key, st);
          entries.push({ key, bytes: st.bytes, dist: col.dist });
        }
      }
      for (const key of pickEvictions(entries, this.store.bytes, this.geometryBytesLimit)) {
        const st = byKey.get(key)!;
        this.store.dropMeshes(st);
        st.built = null;
        st.evicted = true;
        this.evictedCount++;
      }
      return;
    }
    if (this.evictedCount > 0 && this.store.bytes <= this.geometryBytesLimit * REVIVE_RATIO) {
      this.evictedCount = 0;
      for (const col of this.cols.values()) for (const st of col.secs) if (st.evicted) this.enqueue(st);
    }
  }

  // ------------------------------------------------------------ ストリーミング（VOX-D。ChunkStream とのつなぎ。streamDriver.ts）

  /**
   * ストリーミングにする（列を足す前に 1 回）。光は手動（lightColumn）になり、列は streamLight() で光ができた順に足され、
   * メッシュは 描く輪（≤ R_DRAW）の中だけ、streamMesh() の runJob で 1 つずつ作る（予算は ChunkStream）。
   */
  enableStreaming(): void {
    this.stream.enable();
    this.light.setManual(true);
  }

  get isStreaming(): boolean {
    return this.stream.on;
  }

  /** ChunkStream の光の窓口。1 列の光を計算し、その列を 描く候補に足す */
  streamLight(): StreamLight {
    return this.stream.streamLight();
  }

  /** ChunkStream のメッシュの窓口 */
  streamMesh(): StreamMesh {
    return this.stream.streamMesh();
  }

  /** 光ができた列を足す */
  noteLit(cx: number, cz: number): void {
    this.stream.noteLit(cx, cz);
  }

  /** 世界から列を捨てた（ブロックを捨てる前後どちらでもよい）。この列の絵と状態を捨てる。となりの絵は そのまま */
  noteUnloaded(cx: number, cz: number): void {
    this.stream.noteUnloaded(cx, cz);
  }

  /** 描く輪の中心（プレイヤーのいる列）。輪の外（> R_DRAW_DROP）になった列の絵は捨てる */
  setRing(cx: number, cz: number): void {
    this.stream.setRing(cx, cz);
  }

  /** 光ずみで まだ作っていない仕事の数（セクション 1 つ・LOD 1 列が 1 つ） */
  pendingJobs(): number {
    return this.stream.pendingJobs();
  }

  /** 次の仕事の近さ（チェビシェフ。プレイヤーが変えた所は −1）。無ければ null */
  nextJobDist(): number | null {
    return this.stream.nextJobDist();
  }

  /** 仕事を 1 つ進める（セクション 1 つのメッシュ、または 列 1 つの LOD）。進めたら true */
  runJob(deadline?: number): boolean {
    return this.stream.runJob(deadline);
  }

  /** 'true' = その列の本当の段まで・'drawn' = 何かの絵を出している・'none' = まだ */
  columnState(cx: number, cz: number): 'none' | 'drawn' | 'true' {
    return this.stream.columnState(cx, cz);
  }

  // ------------------------------------------------------------ LOD（列ごと 1 まい）

  /** この列の LOD を 見せる／消す（作るのは 1 列 0.3ms ほどなので その場で） */
  private updateLod(col: ColState): void {
    const want = (col.tier === 'lod' && col.dist <= CHUNK_DRAW_DISTANCE) || col.lodHold;
    if (want && col.lodStale && this.attached && !this.stream.on && this.light.isColumnLit(col.cx, col.cz)) this.rebuildLod(col);
    const on = want && !!col.lodOpaque;
    if (col.lodOpaque && col.lodOpaque.visible !== want) this.meshChanged(col.cx, col.cz);
    if (col.lodOpaque) col.lodOpaque.visible = want;
    if (col.lodWater) col.lodWater.visible = want;
    if (!on && col.lodHold && !col.lodOpaque) col.lodHold = false;
  }

  private rebuildLod(col: ColState): void {
    const data = meshChunkLod(this.world, col.cx, col.cz, this.light);
    if (col.lodOpaque) this.group.remove(col.lodOpaque), col.lodOpaque.geometry.dispose();
    if (col.lodWater) this.group.remove(col.lodWater), col.lodWater.geometry.dispose();
    col.lodOpaque = data.opaque.faceCount > 0 ? this.store.atlasMesh(data.opaque, this.mats.lodOpaqueMaterial, 0, lodSortKey(col.cx, col.cz, false)) : null;
    col.lodWater = data.water.faceCount > 0 ? this.store.atlasMesh(data.water, this.mats.lodWaterMaterial, RENDER_CONFIG.waterRenderOrder, lodSortKey(col.cx, col.cz, true)) : null;
    col.lodStale = false;
    this.meshChanged(col.cx, col.cz);
  }

  private meshChanged(cx: number, cz: number): void {
    this.meshVersion++;
    this.onMeshChange?.(cx, cz);
  }

  private dropLod(col: ColState): void {
    if (col.lodOpaque) this.group.remove(col.lodOpaque), col.lodOpaque.geometry.dispose();
    if (col.lodWater) this.group.remove(col.lodWater), col.lodWater.geometry.dispose();
    col.lodOpaque = col.lodWater = null;
  }

  // ------------------------------------------------------------ 見る（テスト・計測）

  /** window.__rikkun.world.sectionInfo 用。セクション座標 (sx, sy, sz) */
  sectionInfo(sx: number, sy: number, sz: number): SectionInfo {
    const col = this.colAt(sx, sz);
    const st = col?.secs[sy];
    if (!col || !st) return { tier: 'none', reason: 'empty', meshes: 0, triangles: 0, dist: 0 };
    const cls = this.classify(st);
    const dist = col.dist;
    const none = (reason: NoneReason): SectionInfo => ({ tier: 'none', reason, meshes: 0, triangles: 0, dist });
    if (cls === CLS_AIR) return none('empty');
    if (cls === CLS_HIDDEN) return none('hidden');
    if (col.tier === 'lod') return { tier: 'lod', reason: null, meshes: 0, triangles: 0, dist };
    // 上限をこえて捨てた（evicted）セクションは いま描いていない: tier 'none'（reason は unlit 扱い＝まだ作っていない）
    if (st.evicted) return none('unlit');
    const meshes = (st.voxel ? 1 : 0) + (st.extras ? 1 : 0) + (st.water ? 1 : 0);
    if (meshes === 0) {
      if (st.built !== null && st.faceless) return none('empty'); // 見える面が 0
      if (this.stream.on ? !col.meshable : !this.light.isColumnLit(st.cx, st.cz)) return none('unlit');
    }
    const tier: SectionTier = meshes > 0 && st.built ? st.built : (col.tier ?? 'micro');
    return { tier, reason: null, meshes, triangles: st.tris, dist };
  }

  /** 見えているセクションのメッシュ（voxel・extras・water の全部の attribute と index のバイト、うまり）を、セクションの鍵の順に FNV-1a でまとめた値（hook render.meshDigest。PERF-2） */
  meshDigest(): { sections: number; hash: string } {
    return meshDigest(this.cols);
  }

  /** 角の暗がり（AO）の 作り方・小ブロックの半径・うまりのメモリ・持っているセクションの数（hook render.aoStats） */
  aoStats(): { mode: 'shader'; radius: number; textureBytes: number; sections: number } {
    return { mode: 'shader', radius: this.microR, textureBytes: this.store.aoBytes, sections: this.store.aoSections };
  }

  /** そのセクションの「うまり」（小ブロックの段で、面があるときだけ。無ければ null） */
  occupancyOf(sx: number, sy: number, sz: number): Uint8Array | null {
    return this.colAt(sx, sz)?.secs[sy]?.occ ?? null;
  }

  /** 視点（水平）。まだ無ければ null */
  viewerNow(): { x: number; z: number } | null {
    return this.viewer;
  }

  /** 全部のセクションを 作り直しに出す（テスト用: 小ブロック地形の入り切りのあと） */
  rebuildAll(): void {
    for (const col of this.cols.values()) for (const st of col.secs) this.markDirty(st, false);
  }

  /** 小ブロックの半径（F3 表示用。sectionStats より軽い） */
  get microRadiusNow(): number {
    return this.microR;
  }

  sectionStats(): SectionStats {
    return sectionStats(this.cols, this.world, this.microR, this);
  }

  meshStats(): MeshStats {
    let meshCount = 0;
    for (const col of this.cols.values()) for (const st of col.secs) meshCount += (st.voxel ? 1 : 0) + (st.extras ? 1 : 0) + (st.water ? 1 : 0);
    return {
      geometryBytes: this.store.bytes,
      geometryBytesLimit: this.geometryBytesLimit,
      meshCount,
      disposedTotal: this.store.disposed,
      // 世界が教えてくれたのに まだ受けとっていない変化（setBlock のすぐあと）もふくめる: 0 なら本当に落ちついた
      pending: this.queue.size + this.stream.lodJobCount() + this.world.uncollectedMeshChanges(),
    };
  }

  /** セクションのメッシュを作り直した記録（古い順）。clear: 返してから空にする */
  rebuildLog(clear = false): RebuildLogEntry[] {
    const out = this.store.log.slice();
    if (clear) this.store.log.length = 0;
    return out;
  }

  rebuildStats(): RebuildStats {
    return { ...this.stats };
  }

  /** 今の三角形の数（テスト・計測用。見えているものだけ） */
  triangleCount(): number {
    return triangleCount(this.cols);
  }

  /** 絵の材料（昼夜の明るさを渡すために登録する用） */
  materials(): MeshBasicMaterial[] {
    const m = this.mats;
    return [m.boxMaterial, m.opaqueMaterial, m.waterMaterial, m.lodOpaqueMaterial, m.lodWaterMaterial];
  }

  /** メッシュの数（描画回数の目安。見えているもの） */
  meshCount(): number {
    return meshCount(this.cols);
  }

  dispose(): void {
    this.sliceMesher?.cancel();
    this.job = null;
    this.group.removeFromParent();
    for (const col of this.cols.values()) {
      for (const st of col.secs) {
        for (const m of [st.voxel, st.extras, st.water]) m?.geometry.dispose();
        st.voxMat?.dispose();
        st.aoTex?.dispose();
      }
      col.lodOpaque?.geometry.dispose();
      col.lodWater?.geometry.dispose();
    }
    this.sway.dispose();
    disposeRenderMaterials(this.mats);
  }

  // ------------------------------------------------------------ なでた ゆれ（M7-2。swayDriver.ts）

  /** ゆれている 作物 の 一覧 を 教える 先（`FarmSparkle.forEachSway` が 合う）。 */
  setSwaySource(src: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined): void {
    this.sway.setSource(src);
  }

  /** いま 専用メッシュ で ゆらしている 本数（テスト・計測用） */
  swayCount(): number {
    return this.sway.count();
  }
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
