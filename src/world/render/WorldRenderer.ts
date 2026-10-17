import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Data3DTexture,
  type Scene,
  type Texture,
} from 'three';
import type { CropStageSource, SectionData } from '../../contracts';
import { cropKindOfBlock } from '../../contracts';
import { BLOCK_TYPES, isCrossIndex, isWildIndex } from '../blocks/blockTypes';
import { createAtlasTexture, WATER_ALPHA } from '../blocks/textures';
import { WorldLight } from '../light/WorldLight';
import { sectionGet } from '../sections';
import { lodSortKey, sectionSortKey } from './drawOrder';
import { columnKey, CHUNK_SIZE, type ArrayVoxelWorld } from '../VoxelWorld';
import type { StreamLight, StreamMesh } from '../stream/ChunkStream';
import { R_DRAW, R_DRAW_DROP, cheb, colKey } from '../stream/ring';
import { CHUNK_DRAW_DISTANCE, RENDER_CONFIG } from './config';
import { setRipeMinBrightness } from './cropLight';
import { applyLightShader } from './lightShader';
import { CropSwayMesh, SWAY_POOL_MAX, type SwayItem } from './cropSway';
import { meshChunkLod } from './lodMesh';
import { crossTileName, RIPE_FLAG, type MeshData } from './meshChunk';
import { pickEvictions } from './voxel/geometryBudget';
import { setAoRadius } from './voxel/aoUniforms';
import { SectionMesher, type SectionMeshData, type VoxelPiece } from './voxel/sectionMesher';
import { DEFAULT_MICRO_R, columnDistance, nextTier, normalizeMicroR, type Tier } from './voxel/tier';
import { createOccupancyTexture, createVoxelMaterial, createVoxelShared, type VoxelShared } from './voxel/voxelMaterial';

export interface RebuildStats {
  /** いちばん最近の作り直し（セクション 1 つ分のメッシュ作り）にかかったミリ秒（描画そのものはふくまない） */
  lastMs: number;
  /** ブロックや光が変わって作り直したセクションの数（最初の全部の分・段の切りかえはふくまない） */
  count: number;
}

/** render.chunks() の答え（M5 AC15）。「チャンク」は 列（16×16 の縦ぜんぶ） */
export interface ChunkStats {
  /** 列の数（8×8 = 64） */
  total: number;
  /** 遠くを かんたんメッシュ（LOD）で描いている列の数 */
  lodDrawn: number;
  /** 距離が 88 以下で、いま描いている（メッシュがあって見える）列の数 */
  drawn: number;
  /** 距離が 88 以下の列の数 */
  inRange: number;
  /** 描く距離（88） */
  maxDistance: number;
  /** 描いている列の番号（colKey(cx, cz)。負の列でも ちがう数） */
  drawnIndices: number[];
}

export type SectionTier = 'micro' | 'box' | 'lod' | 'none';
export type NoneReason = 'empty' | 'hidden' | 'unlit';

/** window.__rikkun.world.sectionInfo の答え（VOX-E） */
export interface SectionInfo {
  tier: SectionTier;
  reason: NoneReason | null;
  meshes: number;
  triangles: number;
  dist: number;
}

export interface SectionStats {
  microR: number;
  total: number;
  micro: number;
  box: number;
  lod: number;
  none: number;
  noneBy: { empty: number; hidden: number; unlit: number };
  microMaxDist: number;
  boxMinDist: number;
  boxMaxDist: number;
}

export interface MeshStats {
  geometryBytes: number;
  geometryBytesLimit: number;
  meshCount: number;
  disposedTotal: number;
  pending: number;
}

export interface RebuildLogEntry {
  x: number;
  y: number;
  z: number;
  kind: 'micro' | 'box' | 'water';
  frame: number;
}

/** 描画まわりの設定（F3 の設定・URL・テストから書きかえられる。毎コマ読む） */
export interface WorldRenderConfig {
  /** 小ブロックの半径（16 / 24 / 32。ほかは近い値になる） */
  microRadius: number;
}

/** 1 コマの作り直しの予算（ミリ秒）。VOX-E §5 */
const FRAME_BUDGET_MS = 8;
/** セクションのジオメトリの合計の上限（バイト）。こえたら 遠い順に dispose */
export const GEOMETRY_BYTES_LIMIT = 192 * 1024 * 1024;
/** 捨てたあと、この割合より下になったら また作る */
const REVIVE_RATIO = 0.75;
const LOG_CAP = 20000;
const LIGHT_MAX_N = 15;

type Cls = 0 | 1 | 2 | 3; // 0 = まだ見ていない / 1 = 全部空気 / 2 = 見えない / 3 = ふつう
const CLS_UNKNOWN = 0;
const CLS_AIR = 1;
const CLS_HIDDEN = 2;
const CLS_NORMAL = 3;

interface SecState {
  readonly col: ColState;
  readonly cx: number;
  readonly sy: number;
  readonly cz: number;
  cls: Cls;
  /** 最後に作った段（null = まだ・捨てた）。面が 0 でも入る */
  built: 'micro' | 'box' | null;
  /** 中身（ブロック・光）が変わって、作り直しが要る */
  dirty: boolean;
  /** プレイヤーがブロックを変えた（先に作る） */
  player: boolean;
  /** ブロックや光の変化による作り直し（rebuildStats の count に入れる） */
  byChange: boolean;
  /** 作ったが 見える面が 0 だった */
  faceless: boolean;
  evicted: boolean;
  queued: boolean;
  voxel: Mesh | null;
  extras: Mesh | null;
  water: Mesh | null;
  /** 小ブロックの段の材料（このセクションの「うまり」のテクスチャを持つ）と、うまりの中身（角の暗がり用。TEX-A） */
  voxMat: MeshBasicMaterial | null;
  aoTex: Data3DTexture | null;
  occ: Uint8Array | null;
  bytes: number;
  tris: number;
}

interface ColState {
  readonly cx: number;
  readonly cz: number;
  readonly secs: SecState[];
  tier: Tier | null;
  dist: number;
  /** 遠くで使う かんたんメッシュ（LOD。列ごと 1 まい） */
  lodOpaque: Mesh | null;
  lodWater: Mesh | null;
  lodStale: boolean;
  /** LOD をやめて 箱・小ブロックにした直後: セクションができるまで LOD を見せておく */
  lodHold: boolean;
  /** この列の作り直し待ち（queue の列ごとの分。ストリーミングの仕事えらび用） */
  readonly work: Set<SecState>;
  /** 描く輪の中心から この列までのチェビシェフ距離（ストリーミングのとき） */
  ring: number;
  /** ring ≤ R_DRAW（ストリーミングのとき、作る対象） */
  inDraw: boolean;
  /** 自分と 8 つのとなりの光がそろっている（ストリーミングのとき、メッシュを作ってよい。S2） */
  meshable: boolean;
}

function toGeometry(data: MeshData): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3));
  if (data.uvs.length > 0) g.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2));
  g.setAttribute('color', new BufferAttribute(new Float32Array(data.colors), 3));
  g.setAttribute('aLight', new BufferAttribute(new Float32Array(data.lights), 2));
  g.setAttribute('aDark', new BufferAttribute(new Float32Array(data.darks), 1));
  g.setIndex(new BufferAttribute(new Uint32Array(data.indices), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function voxelGeometry(p: VoxelPiece): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(p.positions, 3));
  g.setAttribute('aData', new BufferAttribute(p.data, 4, false));
  g.setAttribute('aLight', new BufferAttribute(p.light, 2, true));
  g.setIndex(new BufferAttribute(p.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function bytesOf(g: BufferGeometry): number {
  let n = g.index ? g.index.array.byteLength : 0;
  for (const k of Object.keys(g.attributes)) n += (g.attributes[k] as BufferAttribute).array.byteLength;
  return n;
}

function trisOf(m: Mesh | null): number {
  const idx = m?.geometry.getIndex();
  return idx ? idx.count / 3 : 0;
}

function sectionAllAir(s: SectionData): boolean {
  if (s.kind === 'uniform') return s.block === 0;
  for (let i = 0; i < 4096; i++) if (sectionGet(s, i) !== 0) return false;
  return true;
}

function sectionHasCross(s: SectionData): boolean {
  if (s.kind === 'uniform') return isCrossIndex(s.block);
  if (s.kind === 'palette') {
    for (const b of s.palette) if (isCrossIndex(b)) return true;
    return false;
  }
  for (let i = 0; i < 4096; i++) if (isCrossIndex(s.data[i])) return true;
  return false;
}

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
  private readonly atlas: Texture;
  private readonly voxelShared: VoxelShared;
  /** 箱の段の材料（うまりなし） */
  private readonly boxMaterial: MeshBasicMaterial;
  private readonly opaqueMaterial: MeshBasicMaterial;
  private readonly waterMaterial: MeshBasicMaterial;
  /** LOD 用: テクスチャなし（頂点の色だけ） */
  private readonly lodOpaqueMaterial: MeshBasicMaterial;
  private readonly lodWaterMaterial: MeshBasicMaterial;
  private readonly mesher: SectionMesher;
  private readonly nSections: number;
  private attached = false;
  /** ストリーミング（VOX-D）: 列は ChunkStream が光を計算した順に足し、メッシュは 描く輪の中だけ、1 つずつ stream が進める */
  private streaming = false;
  private ringC = { cx: 0, cz: 0 };
  /** ストリーミング: 光を計算ずみの列 */
  private readonly litCols = new Set<number>();
  /** 距離で段を決める。viewer を渡す前は 全部 小ブロック（距離 0） */
  private viewer: { x: number; z: number } | null = null;
  private microR = DEFAULT_MICRO_R;
  private crops: CropStageSource | undefined;
  private readonly queue = new Set<SecState>();
  private bytes = 0;
  private disposed = 0;
  private frame = 0;
  private evictedCount = 0;
  /** 角の暗がり（AO）の「うまり」のメモリ（バイト）と、持っているセクションの数 */
  private aoBytes = 0;
  private aoSections = 0;
  private readonly log: RebuildLogEntry[] = [];
  private stats: RebuildStats = { lastMs: 0, count: 0 };
  /** なでた ゆれ（M7-2）: ゆれ中の 作物 を 専用メッシュ で 描き、セクション側 の 板 は 隠す */
  private swaySource: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined;
  private swayMesh: CropSwayMesh | null = null;
  private readonly swayHidden = new Set<number>();
  private readonly swayNext = new Set<number>();
  private readonly swayCells: Array<{ x: number; y: number; z: number; deg: number }> = [];
  private readonly swayItems: SwayItem[] = [];
  private readonly hideFn = (x: number, y: number, z: number): boolean => this.swayHidden.has(this.swayKey(x, y, z));
  /** 光（置く・こわすと近くだけ計算し直す）。Sky・妖怪の出現・テストが読む */
  readonly light: WorldLight;
  /** メッシュを足す・捨てる・見せ方を変えるたびに 1 増える（#144 影の試作: 影の地図を描き直す合図） */
  meshVersion = 0;
  /** メッシュが変わった列 (cx, cz) を知らせる（影の地図が範囲に入るときだけ描き直すため） */
  onMeshChange: ((cx: number, cz: number) => void) | null = null;

  constructor(private readonly world: ArrayVoxelWorld) {
    this.light = new WorldLight(world);
    this.mesher = new SectionMesher(world, this.light);
    this.nSections = Math.ceil(world.size.y / 16);
    this.group.name = 'world';
    this.atlas = createAtlasTexture();
    this.voxelShared = createVoxelShared(this.atlas);
    this.boxMaterial = createVoxelMaterial(this.voxelShared, null);
    setAoRadius(this.microR);
    // alphaTest: 作物などの十字の板の すきとおる所を切りぬく
    this.opaqueMaterial = new MeshBasicMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.5 });
    this.waterMaterial = new MeshBasicMaterial({
      map: this.atlas,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    // 箱・小ブロックと同じ場所に LOD が重なる あいだ（切りかえ）は、箱・小ブロックを 手前に見せる
    this.lodOpaqueMaterial = new MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.lodWaterMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: WATER_ALPHA,
      depthWrite: false,
      side: DoubleSide,
    });
    applyLightShader(this.opaqueMaterial);
    applyLightShader(this.waterMaterial);
    applyLightShader(this.lodOpaqueMaterial, 'rikkun-world-light-lod');
    applyLightShader(this.lodWaterMaterial, 'rikkun-world-light-lod');
    this.syncColumns();
  }

  // ------------------------------------------------------------ 列・セクションの状態

  private newCol(cx: number, cz: number): ColState {
    const col: ColState = {
      cx,
      cz,
      secs: [],
      tier: null,
      dist: 0,
      lodOpaque: null,
      lodWater: null,
      lodStale: true,
      lodHold: false,
      work: new Set(),
      ring: 0,
      inDraw: false,
      meshable: false,
    };
    for (let sy = 0; sy < this.nSections; sy++) {
      col.secs.push({
        col, cx, sy, cz,
        cls: CLS_UNKNOWN,
        built: null,
        dirty: true,
        player: false,
        byChange: false,
        faceless: false,
        evicted: false,
        queued: false,
        voxel: null,
        extras: null,
        water: null,
        voxMat: null,
        aoTex: null,
        occ: null,
        bytes: 0,
        tris: 0,
      });
    }
    return col;
  }

  /** 読みこんである列と 状態を合わせる（足す・捨てる） */
  private syncColumns(): void {
    if (this.streaming) return;
    const loaded = this.world.loadedColumns();
    if (loaded.length === this.cols.size && loaded.every((c) => this.cols.has(columnKey(c.cx, c.cz)))) return;
    const seen = new Set<number>();
    for (const c of loaded) {
      const k = columnKey(c.cx, c.cz);
      seen.add(k);
      if (!this.cols.has(k)) {
        const col = this.newCol(c.cx, c.cz);
        this.cols.set(k, col);
        this.setTier(col);
        for (const st of col.secs) this.enqueue(st);
      }
    }
    for (const [k, col] of this.cols) {
      if (seen.has(k)) continue;
      for (const st of col.secs) {
        this.dropMeshes(st);
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
    if (this.streaming && !st.col.inDraw) return; // 描く輪の外は 仕事にしない
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
        this.dropMeshes(st);
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
    const drawnIndices: number[] = [];
    let inRange = 0;
    let lodDrawn = 0;
    for (const col of this.cols.values()) {
      if (col.dist > CHUNK_DRAW_DISTANCE) continue;
      inRange++;
      const lodOn = !!(col.lodOpaque?.visible || col.lodWater?.visible);
      const any = lodOn || col.secs.some((st) => st.voxel || st.extras || st.water);
      if (!any) continue;
      drawnIndices.push(colKey(col.cx, col.cz));
      if (col.tier === 'lod' && lodOn) lodDrawn++;
    }
    drawnIndices.sort((a, b) => a - b);
    return {
      total: this.cols.size,
      drawn: drawnIndices.length,
      lodDrawn,
      inRange,
      maxDistance: CHUNK_DRAW_DISTANCE,
      drawnIndices,
    };
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
    if (this.streaming) return; // 作るのは ChunkStream の runJob
    for (const col of this.cols.values()) this.updateLod(col);
    this.process(Number.POSITIVE_INFINITY, true);
    for (const col of this.cols.values()) this.updateLod(col);
  }

  // ------------------------------------------------------------ 毎コマ

  /** 変わったセクションを作り直す。毎コマ呼んでよい（変化が無ければすぐ終わる） */
  update(viewer?: { x: number; z: number }): void {
    this.frame++;
    if (viewer) this.setViewer(viewer.x, viewer.z);
    const r = normalizeMicroR(this.config.microRadius);
    if (r !== this.microR) {
      this.microR = r;
      setAoRadius(r);
      this.retier();
    }
    this.light.update();
    if (!this.attached) return;
    this.syncColumns();
    this.syncSway();
    this.world.settleExposure();
    this.takeChanges();
    if (!this.streaming) this.process(FRAME_BUDGET_MS, false);
    this.manageBytes();
    for (const col of this.cols.values()) if (col.lodHold || col.lodStale) this.updateLod(col);
    this.drawSway();
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
    if (this.streaming && !col.inDraw) return false;
    if (st.evicted) {
      if (this.bytes > this.geometryBytesLimit * REVIVE_RATIO) return false;
    }
    return st.dirty || st.built !== col.tier;
  }

  /** 次に作るセクション: プレイヤーが変えた所 → はじめて作る・変わった所（近い順）→ 箱から小ブロックへの差しかえ（近い順） */
  private pickNext(maxPrio: number): SecState | null {
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
    const t0 = performance.now();
    let did = 0;
    for (;;) {
      if (did > 0 && performance.now() - t0 >= budgetMs) break;
      const st = this.pickNext(boxOnly ? 1 : 2);
      if (!st) break;
      this.build(st, boxOnly);
      did++;
    }
  }

  private build(st: SecState, boxOnly: boolean): void {
    const col = st.col;
    const want = col.tier as 'micro' | 'box';
    const cls = this.classify(st);
    st.cls = cls;
    if (cls !== CLS_NORMAL) {
      // 全部空気・見えない: メッシュは作らない
      this.dropMeshes(st);
      st.built = want;
      st.dirty = false;
      st.player = false;
      st.faceless = false;
      this.finishItem(st);
      return;
    }
    // 小ブロックが間に合わない（まだ何も無い）所は 先に箱で出す。プレイヤーが変えた所は すぐ本番
    const tier: 'micro' | 'box' = want === 'micro' && (boxOnly || (st.built === null && !st.player)) ? 'box' : want;
    const t = performance.now();
    const data = this.mesher.build(st.cx, st.sy, st.cz, tier, {
      crops: this.crops,
      hide: this.swayHidden.size > 0 ? this.hideFn : undefined,
    });
    this.install(st, data, tier);
    const ms = performance.now() - t;
    st.built = tier;
    st.dirty = false;
    st.player = false;
    this.stats = { lastMs: ms, count: this.stats.count + (st.byChange ? 1 : 0) };
    st.byChange = false;
    this.finishItem(st);
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

  private install(st: SecState, data: SectionMeshData, tier: 'micro' | 'box'): void {
    const oldMeshes = [st.voxel, st.extras, st.water];
    const oldMat = st.voxMat;
    const oldTex = st.aoTex;
    let voxel: Mesh | null = null;
    let extras: Mesh | null = null;
    let water: Mesh | null = null;
    const org = [st.cx * CHUNK_SIZE, st.sy * 16, st.cz * CHUNK_SIZE] as const;
    let voxMat: MeshBasicMaterial | null = null;
    let aoTex: Data3DTexture | null = null;
    if (data.pieces.length > 0) {
      if (data.occupancy) {
        aoTex = createOccupancyTexture(data.occupancy);
        voxMat = createVoxelMaterial(this.voxelShared, aoTex);
      }
      voxel = new Mesh(voxelGeometry(data.pieces[0]), voxMat ?? this.boxMaterial);
      voxel.scale.setScalar(1 / 9);
      voxel.position.set(org[0], org[1], org[2]);
      voxel.userData.sortKey = sectionSortKey(st.cx, st.sy, st.cz, 0);
      voxel.matrixAutoUpdate = false;
      voxel.updateMatrix();
      this.group.add(voxel);
    }
    if (data.extras.faceCount > 0) extras = this.atlasMesh(data.extras, this.opaqueMaterial, 0, sectionSortKey(st.cx, st.sy, st.cz, 1));
    if (data.water.faceCount > 0) water = this.atlasMesh(data.water, this.waterMaterial, RENDER_CONFIG.waterRenderOrder, sectionSortKey(st.cx, st.sy, st.cz, 2));
    this.bytes -= st.bytes;
    for (const m of oldMeshes) if (m) this.disposeMesh(m);
    oldMat?.dispose();
    oldTex?.dispose();
    this.aoBytes += (aoTex ? data.occupancy!.length : 0) - (st.occ ? st.occ.length : 0);
    this.aoSections += (aoTex ? 1 : 0) - (st.occ ? 1 : 0);
    st.voxMat = voxMat;
    st.aoTex = aoTex;
    st.occ = aoTex ? data.occupancy : null;
    st.voxel = voxel;
    st.extras = extras;
    st.water = water;
    st.bytes = (voxel ? bytesOf(voxel.geometry) : 0) + (extras ? bytesOf(extras.geometry) : 0) + (water ? bytesOf(water.geometry) : 0);
    st.tris = trisOf(voxel) + trisOf(extras) + trisOf(water);
    this.bytes += st.bytes;
    st.faceless = !voxel && !extras && !water;
    st.evicted = false;
    this.meshChanged(st.cx, st.cz);
    if (voxel) this.pushLog(st, tier);
    if (water) this.pushLog(st, 'water');
  }

  private atlasMesh(data: MeshData, material: MeshBasicMaterial, order: number, sortKey: number): Mesh {
    const mesh = new Mesh(toGeometry(data), material);
    mesh.renderOrder = order;
    mesh.userData.sortKey = sortKey;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    return mesh;
  }

  private pushLog(st: SecState, kind: 'micro' | 'box' | 'water'): void {
    if (this.log.length >= LOG_CAP) this.log.splice(0, LOG_CAP / 4);
    this.log.push({ x: st.cx, y: st.sy, z: st.cz, kind, frame: this.frame });
  }

  private disposeMesh(m: Mesh): void {
    this.group.remove(m);
    m.geometry.dispose();
    this.disposed++;
  }

  /** セクションのメッシュを捨てる（built は そのまま） */
  private dropMeshes(st: SecState): void {
    if (!st.voxel && !st.extras && !st.water) return;
    this.meshChanged(st.cx, st.cz);
    for (const m of [st.voxel, st.extras, st.water]) if (m) this.disposeMesh(m);
    st.voxel = st.extras = st.water = null;
    st.voxMat?.dispose();
    st.aoTex?.dispose();
    if (st.occ) {
      this.aoBytes -= st.occ.length;
      this.aoSections--;
    }
    st.voxMat = null;
    st.aoTex = null;
    st.occ = null;
    this.bytes -= st.bytes;
    st.bytes = 0;
    st.tris = 0;
  }

  /** 上限をこえたら 遠い順に捨てる。足りてきたら 捨てた所を また作る */
  private manageBytes(): void {
    if (this.bytes > this.geometryBytesLimit) {
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
      for (const key of pickEvictions(entries, this.bytes, this.geometryBytesLimit)) {
        const st = byKey.get(key)!;
        this.dropMeshes(st);
        st.built = null;
        st.evicted = true;
        this.evictedCount++;
      }
      return;
    }
    if (this.evictedCount > 0 && this.bytes <= this.geometryBytesLimit * REVIVE_RATIO) {
      this.evictedCount = 0;
      for (const col of this.cols.values()) for (const st of col.secs) if (st.evicted) this.enqueue(st);
    }
  }

  // ------------------------------------------------------------ LOD（列ごと 1 まい）

  /** この列の LOD を 見せる／消す（作るのは 1 列 0.3ms ほどなので その場で） */
  private updateLod(col: ColState): void {
    const want = (col.tier === 'lod' && col.dist <= CHUNK_DRAW_DISTANCE) || col.lodHold;
    if (want && col.lodStale && this.attached && !this.streaming && this.light.isColumnLit(col.cx, col.cz)) this.rebuildLod(col);
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
    col.lodOpaque = data.opaque.faceCount > 0 ? this.atlasMesh(data.opaque, this.lodOpaqueMaterial, 0, lodSortKey(col.cx, col.cz, false)) : null;
    col.lodWater = data.water.faceCount > 0 ? this.atlasMesh(data.water, this.lodWaterMaterial, RENDER_CONFIG.waterRenderOrder, lodSortKey(col.cx, col.cz, true)) : null;
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

  // ------------------------------------------------------------ ストリーミング（VOX-D。ChunkStream とのつなぎ）

  /**
   * ストリーミングにする（列を足す前に 1 回）。光は手動（lightColumn）になり、列は streamLight() で光ができた順に足され、
   * メッシュは 描く輪（≤ R_DRAW）の中だけ、streamMesh() の runJob で 1 つずつ作る（予算は ChunkStream）。
   */
  enableStreaming(): void {
    this.streaming = true;
    this.light.setManual(true);
  }

  get isStreaming(): boolean {
    return this.streaming;
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
      runJob: () => this.runJob(),
      columnState: (cx, cz) => this.columnState(cx, cz),
    };
  }

  /** 光ができた列を足す */
  noteLit(cx: number, cz: number): void {
    this.takeChanges(); // 読みこんだときの「変わった」を ここで受けとる（作る前に 作りなおしにならないように）
    this.litCols.add(columnKey(cx, cz));
    const k = columnKey(cx, cz);
    if (!this.cols.has(k)) {
      const col = this.newCol(cx, cz);
      this.cols.set(k, col);
      this.setRingOf(col);
      this.setTier(col);
      for (const st of col.secs) this.enqueue(st);
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
        this.dropMeshes(st);
        this.dequeue(st);
      }
      this.dropLod(col);
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
    col.inDraw = col.ring <= R_DRAW;
  }

  /** 描く輪の中心（プレイヤーのいる列）。輪の外（> R_DRAW_DROP）になった列の絵は捨てる */
  setRing(cx: number, cz: number): void {
    this.ringC = { cx, cz };
    for (const col of this.cols.values()) {
      const was = col.inDraw;
      this.setRingOf(col);
      if (col.ring > R_DRAW_DROP) {
        for (const st of col.secs) {
          if (st.built !== null || st.voxel || st.extras || st.water) this.dropMeshes(st);
          st.built = null;
          st.dirty = true;
          st.evicted = false;
          this.dequeue(st);
        }
        if (col.lodOpaque || col.lodWater) this.dropLod(col);
        col.lodStale = true;
        col.lodHold = false;
      } else if (col.inDraw && !was) {
        for (const st of col.secs) this.enqueue(st);
      } else if (!col.inDraw && was) {
        for (const st of col.secs) this.dequeue(st);
      }
    }
  }

  /** この列の LOD を いま作る仕事があるか */
  private lodJob(col: ColState): boolean {
    return col.lodStale && col.tier === 'lod' && col.dist <= CHUNK_DRAW_DISTANCE && col.inDraw && col.meshable;
  }

  private lodJobCount(): number {
    if (!this.streaming) return 0;
    let n = 0;
    for (const col of this.cols.values()) if (this.lodJob(col)) n++;
    return n;
  }

  /** 光ずみで まだ作っていない仕事の数（セクション 1 つ・LOD 1 列が 1 つ） */
  pendingJobs(): number {
    let n = this.lodJobCount();
    for (const col of this.cols.values()) {
      if (!col.meshable || !col.inDraw) continue;
      for (const st of col.work) if (this.needsWork(st)) n++;
    }
    return n;
  }

  private pickJob(): { col: ColState; st: SecState | null; p: number } | null {
    let best: { col: ColState; st: SecState | null; p: number } | null = null;
    let bd = Infinity;
    let be = Infinity;
    const { cx: pcx, cz: pcz } = this.ringC;
    for (const col of this.cols.values()) {
      if (!col.inDraw || !col.meshable) continue;
      let p = Infinity;
      let bs: SecState | null = null;
      for (const st of col.work) {
        if (!this.needsWork(st)) {
          if (!st.evicted) this.dequeue(st);
          continue;
        }
        const sp = st.player ? 0 : st.built === null || st.dirty ? 1 : 2;
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
  runJob(): boolean {
    const j = this.pickJob();
    if (j === null) return false;
    if (j.st !== null) this.build(j.st, false);
    else {
      this.rebuildLod(j.col);
      this.updateLod(j.col);
    }
    return true;
  }

  /** 'true' = その列の本当の段まで・'drawn' = 何かの絵を出している・'none' = まだ */
  columnState(cx: number, cz: number): 'none' | 'drawn' | 'true' {
    const col = this.cols.get(columnKey(cx, cz));
    if (col === undefined || col.tier === null || !col.meshable) return 'none';
    if (col.tier === 'lod') {
      if (col.dist > CHUNK_DRAW_DISTANCE) return 'true'; // 描くものが無い
      return col.lodStale ? 'none' : 'true';
    }
    let all = true;
    for (const st of col.secs) {
      if (st.built === null) return 'none';
      if (this.needsWork(st)) all = false;
    }
    return all ? 'true' : 'drawn';
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
      if (this.streaming ? !col.meshable : !this.light.isColumnLit(st.cx, st.cz)) return none('unlit');
    }
    const tier = meshes > 0 && st.built ? st.built : (col.tier ?? 'micro');
    return { tier, reason: null, meshes, triangles: st.tris, dist };
  }

  /** 角の暗がり（AO）の 作り方・小ブロックの半径・うまりのメモリ・持っているセクションの数（hook render.aoStats） */
  aoStats(): { mode: 'shader'; radius: number; textureBytes: number; sections: number } {
    return { mode: 'shader', radius: this.microR, textureBytes: this.aoBytes, sections: this.aoSections };
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
    const out: SectionStats = {
      microR: this.microR,
      total: 0,
      micro: 0,
      box: 0,
      lod: 0,
      none: 0,
      noneBy: { empty: 0, hidden: 0, unlit: 0 },
      microMaxDist: 0,
      boxMinDist: 0,
      boxMaxDist: 0,
    };
    let boxMin = Infinity;
    for (const col of this.cols.values()) {
      for (let sy = 0; sy < col.secs.length; sy++) {
        const i = this.sectionInfo(col.cx, sy, col.cz);
        out.total++;
        if (i.tier === 'none') {
          out.none++;
          out.noneBy[i.reason ?? 'empty']++;
        } else if (i.tier === 'lod') out.lod++;
        else if (i.tier === 'micro') {
          out.micro++;
          out.microMaxDist = Math.max(out.microMaxDist, i.dist);
        } else {
          out.box++;
          boxMin = Math.min(boxMin, i.dist);
          out.boxMaxDist = Math.max(out.boxMaxDist, i.dist);
        }
      }
    }
    out.boxMinDist = boxMin === Infinity ? 0 : boxMin;
    return out;
  }

  meshStats(): MeshStats {
    let meshCount = 0;
    for (const col of this.cols.values()) for (const st of col.secs) meshCount += (st.voxel ? 1 : 0) + (st.extras ? 1 : 0) + (st.water ? 1 : 0);
    return {
      geometryBytes: this.bytes,
      geometryBytesLimit: this.geometryBytesLimit,
      meshCount,
      disposedTotal: this.disposed,
      // 世界が教えてくれたのに まだ受けとっていない変化（setBlock のすぐあと）もふくめる: 0 なら本当に落ちついた
      pending: this.queue.size + this.lodJobCount() + this.world.uncollectedMeshChanges(),
    };
  }

  /** セクションのメッシュを作り直した記録（古い順）。clear: 返してから空にする */
  rebuildLog(clear = false): RebuildLogEntry[] {
    const out = this.log.slice();
    if (clear) this.log.length = 0;
    return out;
  }

  rebuildStats(): RebuildStats {
    return { ...this.stats };
  }

  /** 今の三角形の数（テスト・計測用。見えているものだけ） */
  triangleCount(): number {
    let n = 0;
    for (const col of this.cols.values()) {
      for (const st of col.secs) n += st.tris;
      if (col.lodOpaque?.visible) n += trisOf(col.lodOpaque);
      if (col.lodWater?.visible) n += trisOf(col.lodWater);
    }
    return n;
  }

  /** 絵の材料（昼夜の明るさを渡すために登録する用） */
  materials(): MeshBasicMaterial[] {
    return [this.boxMaterial, this.opaqueMaterial, this.waterMaterial, this.lodOpaqueMaterial, this.lodWaterMaterial];
  }

  /** メッシュの数（描画回数の目安。見えているもの） */
  meshCount(): number {
    let n = 0;
    for (const col of this.cols.values()) {
      for (const st of col.secs) n += (st.voxel ? 1 : 0) + (st.extras ? 1 : 0) + (st.water ? 1 : 0);
      if (col.lodOpaque?.visible) n++;
      if (col.lodWater?.visible) n++;
    }
    return n;
  }

  dispose(): void {
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
    this.swayMesh?.dispose();
    this.boxMaterial.dispose();
    this.voxelShared.dummyAo.dispose();
    this.opaqueMaterial.dispose();
    this.waterMaterial.dispose();
    this.lodOpaqueMaterial.dispose();
    this.lodWaterMaterial.dispose();
    this.atlas.dispose();
  }

  // ------------------------------------------------------------ なでた ゆれ（M7-2）

  /** ゆれている 作物 の 一覧 を 教える 先（`FarmSparkle.forEachSway` が 合う）。 */
  setSwaySource(src: ((cb: (x: number, y: number, z: number, deg: number) => void) => void) | undefined): void {
    this.swaySource = src;
  }

  /** いま 専用メッシュ で ゆらしている 本数（テスト・計測用） */
  swayCount(): number {
    return this.swayMesh?.count ?? 0;
  }

  private swayKey(x: number, y: number, z: number): number {
    return (x * 4096 + z) * 512 + y;
  }

  /** ゆれ 中 の マス の 集まり が 変わったら、そのセクション だけ 作り直しに 出す（板 を 隠す／出す） */
  private syncSway(): void {
    this.swayCells.length = 0;
    this.swayNext.clear();
    if (this.swaySource) {
      this.swaySource((x, y, z, deg) => {
        if (this.swayCells.length >= SWAY_POOL_MAX) return;
        const b = this.world.getIndex(x, y, z);
        if (b < 0 || !isCrossIndex(b)) return;
        this.swayCells.push({ x, y, z, deg });
        this.swayNext.add(this.swayKey(x, y, z));
      });
    }
    if (this.swayHidden.size === 0 && this.swayNext.size === 0) return;
    let changed = false;
    for (const c of this.swayCells) {
      if (!this.swayHidden.has(this.swayKey(c.x, c.y, c.z))) {
        this.world.touch(c.x, c.y, c.z);
        changed = true;
      }
    }
    if (this.swayHidden.size > 0) {
      for (const k of this.swayHidden) {
        if (this.swayNext.has(k)) continue;
        const y = k % 512;
        const r = (k - y) / 512;
        const z = r % 4096;
        const x = (r - z) / 4096;
        this.world.touch(x, y, z);
        changed = true;
      }
    }
    if (changed) {
      this.swayHidden.clear();
      for (const k of this.swayNext) this.swayHidden.add(k);
    }
  }

  private drawSway(): void {
    if (this.swayCells.length === 0 && !this.swayMesh?.mesh.visible) return;
    if (!this.swayMesh) {
      this.swayMesh = new CropSwayMesh(this.opaqueMaterial);
      this.group.add(this.swayMesh.mesh);
    }
    this.swayItems.length = 0;
    for (const c of this.swayCells) {
      // 板 を 隠せている（作り直し 済み）ものだけ 描く
      if (!this.swayHidden.has(this.swayKey(c.x, c.y, c.z))) continue;
      const b = this.world.getIndex(c.x, c.y, c.z);
      const stage = this.crops?.stageAt(c.x, c.y, c.z) ?? 3;
      const ripe = isWildIndex(b) || (cropKindOfBlock(BLOCK_TYPES[b].id) !== null && stage === 3);
      this.swayItems.push({
        x: c.x, y: c.y, z: c.z, deg: c.deg,
        tile: crossTileName(b, stage),
        sky: this.light.skyAt(c.x, c.y, c.z) / LIGHT_MAX_N,
        blk: this.light.blockAt(c.x, c.y, c.z) / LIGHT_MAX_N + (ripe ? RIPE_FLAG : 0),
      });
    }
    this.swayMesh.set(this.swayItems);
  }
}

/** 同じ優先なら: 輪の距離 → 中心どうしの距離 → cz → cx（S3） */
function jobBefore(col: ColState, e: number, bd: number, be: number, other: ColState): boolean {
  if (col.ring !== bd) return col.ring < bd;
  if (e !== be) return e < be;
  if (col.cz !== other.cz) return col.cz < other.cz;
  return col.cx < other.cx;
}

const NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
