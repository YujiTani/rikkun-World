import type { CropStageSource } from '../../../contracts';
import { LOOK_N, LOOK_VOLUME, fillBlockLook, hasLook, initLooks, occludes } from '../../../proto/voxel/looks';
import { newSample, sampleSurface, type ColumnSource, type SurfaceSample } from '../../micro/microSurface';
import { scanColumn, type ColumnInfo } from '../../micro/worldColumns';
import { BLOCK_TYPES, isOpaqueIndex } from '../../blocks/blockTypes';
import { OCC_BYTES, OCC_NY, packOccupancy } from './ao';
import { ROW_NONE, rowCodeOf, terrainKindOf } from './projection';
import { OPACITY } from '../../light/opacity';
import type { WorldLight } from '../../light/WorldLight';
import type { ArrayVoxelWorld } from '../../VoxelWorld';
import { meshSectionExtras } from './sectionExtras';
import type { MeshData } from '../meshChunk';

/**
 * セクション（16³）1 つぶんのメッシュ作り（three に依存しない。型付き配列で返す）。VOX-E。
 * 試作 `src/proto/voxel/meshVoxel.ts`（列ごと）を セクションごとに直したもの:
 * - micro: 小ブロック（9×9×9）の形。greedyShape（同じ種類・同じ光の面を 1 まいにまとめる）と、
 *   小ブロック地形（microSurface の S）。色は 面の向き・ワールドの座標から 16×16 の絵の画素（シェーダー。TEX-A）。
 *   頂点のデータ aData = [ブロックの種類, てっぺんから何小ブロック下か（形の面は 255）, 0, 面の番号]。
 * - box: 1 マスの箱。絵は 近くと同じ投影。光は面の角のなめらかな平均（今までと同じ）。
 * - 光: micro の面は「面の前のブロックの光」を 1 つ（なめらかにしない）。頂点に aLight（空・ブロック各 1 バイト）として焼く。
 * - 座標は セクションの左下を 0 とした小ブロックの数（Uint16）。mesh.scale = 1/9、mesh.position = セクションの位置で置く。
 * - 小ブロック地形のとび出し（地面のブロックの上 8 小ブロックまで）は、地面のあるセクションが持つ。
 *   だから 全部空気のセクションは いつも 面が 0。
 * - 地面の表面ブロックのとなりの固いブロック（段差の下・建物の下）は、けずらない平らな箱として 面を作る対象（active）に入れる。
 *   表面の高さ S は ブロックの上のへりより下へへこむので、そこは 1 ブロック単位では「見えない面」でも 帯が見える（#142）。
 */

export interface VoxelPiece {
  /** セクションの中の小ブロック座標 */
  positions: Uint16Array;
  /** aData = [ブロックの種類, 地形の横の面の行の符号（255 = 世界の高さで決める）, 0, 面の番号] */
  data: Uint8Array;
  /** aLight = [空の光, ブロックの光]（0〜255。255 = 15 を 17 倍） */
  light: Uint8Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
}

export interface SectionMeshData {
  pieces: VoxelPiece[];
  /** 小ブロック・箱の四角の数 */
  faces: number;
  /** atlas（絵）で描く不透明のもの: たいまつ・十字の板・絵のブロック */
  extras: MeshData;
  water: MeshData;
  /** 三角形の合計（pieces + extras + water） */
  triangles: number;
  /** 角の暗がり（AO）用の 小ブロックの「うまり」の 3D テクスチャの中身（ao.ts）。micro で面があるときだけ */
  occupancy: Uint8Array | null;
}

export type MeshTier = 'micro' | 'box';

const N = LOOK_N;
/** まわり 1 ブロックをふくむ 1 辺のブロック数と、小ブロック数 */
const BL = 18;
const S = BL * N;
const SS = S * S;
/** 小ブロック地形で調べる列の幅（ブロック）: セクション + まわり 2 ブロック */
const BW = 20;
const OWN = 16 * N; // 144
const ROWS_ALL = 17 * N; // 153: 自分の高さ + 上のはみ出しの 1 ブロック
const CUBE = BL * BL * BL;
const NB = BLOCK_TYPES.length;

initLooks(BLOCK_TYPES.map((t) => t.id));

/** 面の向きの順: 上, 下, +x, -x, +z, -z（meshChunk の FACES と同じ） */
const DIR: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const FACE_VERTS: readonly (readonly [number, number, number])[][] = [
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const AXIS_OF = [1, 1, 0, 0, 2, 2];
const NEIGHBOR_OFF = [SS, -SS, 1, -1, S, -S];
const GSTRIDE = [1, SS, S];

/** この種類は となりの面をかくすか（形のある種類は look、形のない固いブロック（絵のブロック）は かくす） */
function buildOcc(): Uint8Array {
  const t = new Uint8Array(NB);
  for (let i = 0; i < NB; i++) t[i] = hasLook(i) ? (occludes(i) ? 1 : 0) : isOpaqueIndex(i) ? 1 : 0;
  return t;
}
const OCC = buildOcc();
/** 光を通さない（光の読みを まわりからかりる） */
const OPAQUE_LIGHT = Uint8Array.from(OPACITY, (o) => (o >= 15 ? 1 : 0));

/** 四角を貯める入れもの（大きくなったら 倍にひろげる） */
class QuadBuilder {
  private cap = 8192;
  private pos = new Uint16Array(3 * this.cap);
  private dat = new Uint8Array(4 * this.cap);
  private lit = new Uint8Array(2 * this.cap);
  private idx = new Uint32Array((this.cap / 4) * 6);
  private nv = 0;
  private ni = 0;
  faces = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
    this.faces = 0;
  }

  private grow(): void {
    this.cap *= 2;
    const p = new Uint16Array(3 * this.cap);
    p.set(this.pos);
    this.pos = p;
    const d = new Uint8Array(4 * this.cap);
    d.set(this.dat);
    this.dat = d;
    const l = new Uint8Array(2 * this.cap);
    l.set(this.lit);
    this.lit = l;
    const i = new Uint32Array((this.cap / 4) * 6);
    i.set(this.idx);
    this.idx = i;
  }

  /** 角ごとの光 lights = [空0, ブロック0, 空1, ブロック1, …]（4 つぶん）。lights が null なら 全部 (sky, blk) */
  quad(
    f: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    d0: number,
    d1: number,
    d2: number,
    flag: number,
    sky: number,
    blk: number,
    lights: ArrayLike<number> | null,
  ): void {
    if (this.nv + 4 > this.cap) this.grow();
    const verts = FACE_VERTS[f];
    let p = this.nv * 3;
    let d = this.nv * 4;
    let l = this.nv * 2;
    for (let i = 0; i < 4; i++) {
      const v = verts[i];
      this.pos[p++] = v[0] ? x1 : x0;
      this.pos[p++] = v[1] ? y1 : y0;
      this.pos[p++] = v[2] ? z1 : z0;
      this.dat[d++] = d0;
      this.dat[d++] = d1;
      // 角の印（x, y, z の どちら側か: ビット 0, 1, 2）。シェーダーが 面の中で ごく少し ひろげて 面どうしの つぎ目の 空の色を ふさぐ
      this.dat[d++] = v[0] | (v[1] << 1) | (v[2] << 2) | d2;
      this.dat[d++] = f | flag;
      if (lights) {
        this.lit[l++] = lights[i * 2];
        this.lit[l++] = lights[i * 2 + 1];
      } else {
        this.lit[l++] = sky;
        this.lit[l++] = blk;
      }
    }
    const base = this.nv;
    let q = this.ni;
    const idx = this.idx;
    idx[q++] = base;
    idx[q++] = base + 1;
    idx[q++] = base + 2;
    idx[q++] = base;
    idx[q++] = base + 2;
    idx[q++] = base + 3;
    this.nv += 4;
    this.ni = q;
    this.faces++;
  }

  finish(): VoxelPiece[] {
    if (this.nv === 0) return [];
    const idx = this.nv <= 65535 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    return [
      {
        positions: this.pos.slice(0, this.nv * 3),
        data: this.dat.slice(0, this.nv * 4),
        light: this.lit.slice(0, this.nv * 2),
        indices: idx,
        vertexCount: this.nv,
      },
    ];
  }
}

export interface BuildOptions {
  crops?: CropStageSource;
  hide?: (x: number, y: number, z: number) => boolean;
}

/** 面ごとの層の数（上下 = 17 ブロック、ほかは 16 ブロック。小ブロック数） */
const NBLOCKS = [16, 17, 16];
const LAYERS = [0, 1, 2, 3, 4, 5].map((f) => NBLOCKS[AXIS_OF[f]] * N);
const G_BASE = N + N * S + N * SS;
const perfNow = (): number => performance.now();

// 段（続きから再開できる仕事。PERF-2）と、止めてよい 1 単位の大きさ
const PH_IDLE = 0;
const PH_BOX = 1;
const PH_READ = 2;
const PH_LIGHT2 = 3;
const PH_SCAN = 4;
const PH_SAMPLE = 5;
const PH_EXPOSE = 6;
const PH_FILL = 7;
const PH_TFILL = 8;
const PH_PLANES = 9;
const PH_FINISH = 10;
const PH_OCC = 11;
const READ_ROWS = 3;
const SCAN_ROWS = 2;
const SAMPLE_ROWS = 8;
const EXPOSE_ROWS = 3;
/** 1 行に 地面が集まると 重いので、行では切らず ブロックの数で切る */
const FILL_BLOCKS = 8;
const TFILL_ROWS = 8;
const PLANES_PER_STEP = 4;
const OCC_ROWS = 8;

/** edgeTy の「まだ調べていない」しるし */
const EDGE_UNKNOWN = -2147483648;

export class SectionMesher {
  /** 小ブロックの格子: (y * S + z) * S + x。0 = 空。まわり 1 ブロックの余白つき（余白はとなりのセクションのぶん） */
  private readonly grid = new Uint8Array(S * SS);
  /** 格子と同じ並び: 0 でない = 小ブロック地形のマス。値 = 行の符号 << 6 | ブロックの種類 */
  private readonly tflag = new Uint16Array(S * SS);
  private useMin = 99;
  private useMax = -1;
  private readonly bk = new Int16Array(CUBE);
  private readonly expo = new Uint8Array(CUBE);
  /** 1 = 地形のとなりで 面を作る つまった ブロック（地形のへこみから 横の面が 見える） */
  private readonly gap = new Uint8Array(CUBE);
  /** ブロックごとの光（空 << 4 | ブロック）。光を通さないマスは まわりの光を かりる */
  private readonly lg = new Uint8Array(CUBE);
  private readonly lsky = new Uint8Array(CUBE);
  private readonly lblk = new Uint8Array(CUBE);
  private readonly scratch = new Uint8Array(LOOK_VOLUME);
  /** 自分のブロックの高さ 0〜16（16 = 地形のとび出し）: 面を作る必要があるか／種類 */
  private readonly active = new Uint8Array(17 * 16 * 16);
  private readonly kinds = new Uint8Array(17 * 16 * 16);
  private readonly mask = new Int32Array(OWN * ROWS_ALL);
  private readonly smooth = new Uint8Array(256 * 8);
  private readonly builder = new QuadBuilder();
  private readonly cornerOut = new Uint8Array(8);
  // 小ブロック地形の作業用
  private readonly colTy = new Int16Array(BW * BW);
  private readonly colKind = new Uint8Array(BW * BW);
  private readonly colReach = new Int8Array(BW * BW);
  private readonly colRock = new Uint8Array(BW * BW);
  private readonly colH = new Int16Array(S * S);
  private readonly colG = new Int16Array(S * S);
  private readonly colIsRock = new Uint8Array(S * S);
  private readonly colInfo: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };
  private readonly sample: SurfaceSample = newSample();
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private readonly colSrc: ColumnSource = {
    surfaceY: (bx, bz) => {
      const i = this.colIndex(bx, bz);
      return i < 0 ? -1 : this.colTy[i];
    },
    reach: (bx, bz) => {
      const i = this.colIndex(bx, bz);
      return i < 0 ? -1 : this.colReach[i];
    },
    rockOk: (bx, bz) => {
      const i = this.colIndex(bx, bz);
      return i < 0 ? false : this.colRock[i] === 1;
    },
  };

  // 続きから再開する仕事の状態（PERF-2）。途中の状態は インスタンスの中に持つ
  private phase = PH_IDLE;
  /** 段の中の続きの印（行・ブロックの番号・層・うまりの行） */
  private cur = 0;
  /** planes 段の面（0〜5）。層は cur */
  private pf = 0;
  private jcx = 0;
  private jsy = 0;
  private jcz = 0;
  private jtier: MeshTier = 'micro';
  private jopts: BuildOptions = {};
  /** このセクションの高さに 小ブロック地形があるか（terrainScan で決まる） */
  private terrain = false;
  private scanAny = false;
  /** できあがり（うまりを書いている途中のもの）と、返す前のもの */
  private fin: SectionMeshData | null = null;
  private out: SectionMeshData | null = null;

  constructor(
    private readonly world: ArrayVoxelWorld,
    private readonly light?: WorldLight,
  ) {}

  /** 世界のブロックの (x, z) → 作業用の列の番号（範囲外は -1） */
  private colIndex(bx: number, bz: number): number {
    const i = bx - this.ox + 2;
    const j = bz - this.oz + 2;
    return i < 0 || j < 0 || i >= BW || j >= BW ? -1 : j * BW + i;
  }

  // ------------------------------------------------------------ 続きから再開できる作り方（PERF-2）

  /** 今までどおり（= start のあと 締め切りなしで 最後まで）。作る道は これ 1 本 */
  build(cx: number, sy: number, cz: number, tier: MeshTier, opts: BuildOptions = {}): SectionMeshData {
    this.start(cx, sy, cz, tier, opts);
    return this.resume(Infinity) as SectionMeshData;
  }

  /** 作り直しを始める（前の仕事が残っていれば 捨てる） */
  start(cx: number, sy: number, cz: number, tier: MeshTier, opts: BuildOptions = {}): void {
    this.ox = cx * 16;
    this.oy = sy * 16;
    this.oz = cz * 16;
    this.jcx = cx;
    this.jsy = sy;
    this.jcz = cz;
    this.jtier = tier;
    this.jopts = opts;
    this.builder.reset();
    this.cur = 0;
    this.pf = 0;
    this.terrain = false;
    this.scanAny = false;
    this.out = null;
    this.fin = null;
    this.phase = tier === 'box' ? PH_BOX : PH_READ;
  }

  /** 途中の仕事を捨てる */
  cancel(): void {
    this.phase = PH_IDLE;
    this.out = null;
    this.fin = null;
    this.jopts = {};
  }

  get busy(): boolean {
    return this.phase !== PH_IDLE;
  }

  /**
   * 締め切り（now() の値）まで進める。できたらデータ、まだなら null。少なくとも 1 単位は進める。
   * 止める所は 各段の 数単位ごと（どこで止めても 出力は同じ）。box の段は 分けず 1 回で最後まで進む。deadline が Infinity なら 時計は見ない。
   */
  resume(deadline: number, now: () => number = perfNow): SectionMeshData | null {
    if (this.phase === PH_IDLE) return null;
    const timed = deadline !== Infinity;
    for (;;) {
      this.step();
      if (this.phase === PH_IDLE) {
        const o = this.out as SectionMeshData;
        this.out = null;
        return o;
      }
      if (timed && now() >= deadline) return null;
    }
  }

  private step(): void {
    switch (this.phase) {
      case PH_BOX: {
        for (let r = 0; r < BL; r++) this.readRow(r);
        if (this.light) for (let r = 0; r < BL; r++) this.lightRow2(r);
        else this.lightNone();
        this.meshBox();
        this.stepFinish();
        break;
      }
      case PH_READ: {
        const r1 = Math.min(this.cur + READ_ROWS, BL);
        for (let r = this.cur; r < r1; r++) this.readRow(r);
        this.cur = r1;
        if (r1 < BL) break;
        this.cur = 0;
        if (this.light) this.phase = PH_LIGHT2;
        else {
          this.lightNone();
          this.phase = PH_SCAN;
        }
        break;
      }
      case PH_LIGHT2: {
        const r1 = Math.min(this.cur + READ_ROWS, BL);
        for (let r = this.cur; r < r1; r++) this.lightRow2(r);
        this.cur = r1;
        if (r1 >= BL) {
          this.cur = 0;
          this.phase = PH_SCAN;
        }
        break;
      }
      case PH_SCAN: {
        const j1 = Math.min(this.cur + SCAN_ROWS, BW);
        this.scanRows(this.cur, j1);
        this.cur = j1;
        if (j1 < BW) break;
        this.terrain = this.scanAny;
        if (this.terrain) {
          this.colH.fill(-1);
          this.cur = N - 2;
          this.phase = PH_SAMPLE;
        } else {
          this.beginExpose();
          this.cur = 0;
          this.phase = PH_EXPOSE;
        }
        break;
      }
      case PH_SAMPLE: {
        const end = S - N + 2;
        const g1 = Math.min(this.cur + SAMPLE_ROWS, end);
        this.sampleRows(this.cur, g1);
        this.cur = g1;
        if (g1 >= end) {
          this.beginExpose();
          this.cur = 0;
          this.phase = PH_EXPOSE;
        }
        break;
      }
      case PH_EXPOSE: {
        const r1 = Math.min(this.cur + EXPOSE_ROWS, BL);
        this.exposeRows(this.cur, r1);
        this.cur = r1;
        if (r1 >= BL) {
          this.cur = 0;
          this.phase = PH_FILL;
        }
        break;
      }
      case PH_FILL: {
        const i1 = Math.min(this.cur + FILL_BLOCKS, CUBE);
        this.fillBlocks(this.cur, i1);
        this.cur = i1;
        if (i1 >= CUBE) {
          this.cur = 0;
          this.phase = this.terrain ? PH_TFILL : PH_PLANES;
        }
        break;
      }
      case PH_TFILL: {
        const g1 = Math.min(this.cur + TFILL_ROWS, S);
        this.fillTerrainRows(this.cur, g1);
        this.cur = g1;
        if (g1 >= S) {
          this.cur = 0;
          this.phase = PH_PLANES;
        }
        break;
      }
      case PH_PLANES: {
        for (let n = 0; n < PLANES_PER_STEP && this.pf < 6; n++) {
          this.meshPlane(this.pf, this.cur);
          if (++this.cur >= LAYERS[this.pf]) {
            this.cur = 0;
            this.pf++;
          }
        }
        if (this.pf >= 6) this.phase = PH_FINISH;
        break;
      }
      case PH_FINISH:
        this.stepFinish();
        break;
      case PH_OCC: {
        const t1 = Math.min(this.cur + OCC_ROWS, OCC_NY);
        const fin = this.fin as SectionMeshData;
        packOccupancy(this.grid, S, N, this.useMin * N, (this.useMax + 1) * N, fin.occupancy as Uint8Array, this.cur, t1);
        this.cur = t1;
        if (t1 >= OCC_NY) this.done(fin);
        break;
      }
    }
  }

  private done(d: SectionMeshData): void {
    this.out = d;
    this.fin = null;
    this.phase = PH_IDLE;
  }

  /** 四角を まとめ終え、絵・水を作る。小ブロックで面があれば「うまり」の段へ */
  private stepFinish(): void {
    const b = this.builder;
    const o = this.jopts;
    const micro = this.jtier === 'micro';
    const pieces = b.finish();
    const faces = b.faces;
    const ex = meshSectionExtras(this.world, this.jcx, this.jsy, this.jcz, this.light, o.crops, o.hide, micro);
    let triangles = ex.opaque.indices.length / 3 + ex.water.indices.length / 3;
    for (const p of pieces) triangles += p.indices.length / 3;
    const d: SectionMeshData = { pieces, faces, extras: ex.opaque, water: ex.water, triangles, occupancy: null };
    if (micro && pieces.length > 0 && this.useMax >= 0) {
      d.occupancy = new Uint8Array(OCC_BYTES);
      this.fin = d;
      this.cur = 0;
      this.phase = PH_OCC;
    } else this.done(d);
  }

  /** まわり 1 ブロックをふくむ 18³ のブロックの種類（行 byi。読みこんでいない・世界の底の下 = -1、世界の上 = 空気）と、ブロックごとの光の 1 まわり目 */
  private readRow(byi: number): void {
    const w = this.world;
    const H = w.size.y;
    const bk = this.bk;
    const wy = this.oy + byi - 1;
    const row0 = byi * BL * BL;
    let i = row0;
    for (let bzi = 0; bzi < BL; bzi++) {
      const wz = this.oz + bzi - 1;
      for (let bxi = 0; bxi < BL; bxi++) {
        bk[i++] = wy >= H ? 0 : w.getIndex(this.ox + bxi - 1, wy, wz);
      }
    }
    const { lg, lsky, lblk, light } = this;
    if (!light) return;
    i = row0;
    for (let bzi = 0; bzi < BL; bzi++) {
      const wz = this.oz + bzi - 1;
      for (let bxi = 0; bxi < BL; bxi++, i++) {
        const k = bk[i];
        if (k < 0 || OPAQUE_LIGHT[k] === 1) {
          lsky[i] = 0;
          lblk[i] = 0;
          lg[i] = 0;
          continue;
        }
        const v = light.packedAt(this.ox + bxi - 1, wy, wz);
        lg[i] = v;
        lsky[i] = v >> 4;
        lblk[i] = v & 15;
      }
    }
  }

  /** 光なしは 空 15・ブロック 0 */
  private lightNone(): void {
    this.lg.fill(0xf0);
    this.lsky.fill(15);
    this.lblk.fill(0);
  }

  /** 光を通さないマス（行 byi）: まわり 6 つのうち光のあるマスの 空・ブロックそれぞれの大きいほう（光の 1 まわり目が ぜんぶ終わってから） */
  private lightRow2(byi: number): void {
    const { bk, lg, lsky, lblk } = this;
    let i = byi * BL * BL;
    for (let bzi = 0; bzi < BL; bzi++) {
      for (let bxi = 0; bxi < BL; bxi++, i++) {
        const k = bk[i];
        if (k >= 0 && OPAQUE_LIGHT[k] === 0) continue;
        let s = 0;
        let bl = 0;
        for (let f = 0; f < 6; f++) {
          const nx = bxi + DIR[f][0];
          const ny = byi + DIR[f][1];
          const nz = bzi + DIR[f][2];
          if (nx < 0 || ny < 0 || nz < 0 || nx >= BL || ny >= BL || nz >= BL) continue;
          const j = (ny * BL + nz) * BL + nx;
          const nk = bk[j];
          if (nk < 0 || OPAQUE_LIGHT[nk] === 1) continue;
          if (lsky[j] > s) s = lsky[j];
          if (lblk[j] > bl) bl = lblk[j];
        }
        lg[i] = (s << 4) | bl;
      }
    }
  }

  // ------------------------------------------------------------ 格子

  private markRows(byiLo: number, byiHi: number): void {
    if (byiLo < this.useMin) this.useMin = byiLo;
    if (byiHi > this.useMax) this.useMax = byiHi;
  }

  private clearGrid(): void {
    if (this.useMax >= 0) {
      const a = this.useMin * N * SS;
      const b = (this.useMax + 1) * N * SS;
      this.grid.fill(0, a, b);
      this.tflag.fill(0, a, b);
    }
    this.useMin = 99;
    this.useMax = -1;
    this.active.fill(0);
  }

  private fillSolid(gx: number, gy: number, gz: number): void {
    const g = this.grid;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const s = ((gy + y) * S + gz + z) * S + gx;
        g.fill(1, s, s + N);
      }
    }
  }

  private copyBlock(src: Uint8Array, gx: number, gy: number, gz: number): void {
    const g = this.grid;
    let i = 0;
    for (let y = 0; y < N; y++) {
      for (let z = 0; z < N; z++) {
        const s = ((gy + y) * S + gz + z) * S + gx;
        for (let x = 0; x < N; x++) g[s + x] = src[i++];
      }
    }
  }

  /** ブロックの種類 → となりの種類。18³ の外は 世界から読む */
  private kindNear(bxi: number, byi: number, bzi: number, f: number): number {
    const nx = bxi + DIR[f][0];
    const ny = byi + DIR[f][1];
    const nz = bzi + DIR[f][2];
    if (nx >= 0 && ny >= 0 && nz >= 0 && nx < BL && ny < BL && nz < BL) return this.bk[(ny * BL + nz) * BL + nx];
    const wy = this.oy + ny - 1;
    if (wy >= this.world.size.y) return 0;
    return this.world.getIndex(this.ox + nx - 1, wy, this.oz + nz - 1);
  }

  /** まわり 26 マスのどれかに 見える面のあるブロックが あるか（角の暗がりが となりの となりまで 見るため 斜めも） */
  private adjacentActive(bxi: number, byi: number, bzi: number): boolean {
    const e = this.expo;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = byi + dy;
      if (ny < 0 || ny >= BL) continue;
      for (let dz = -1; dz <= 1; dz++) {
        const nz = bzi + dz;
        if (nz < 0 || nz >= BL) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = bxi + dx;
          if (nx < 0 || nx >= BL || (dx === 0 && dy === 0 && dz === 0)) continue;
          if (e[(ny * BL + nz) * BL + nx] !== 0) return true;
        }
      }
    }
    return false;
  }

  /** ブロック (bxi, byi, bzi)（18³ の中の番号）の 横 4 つのとなりに、地面の表面ブロック（小ブロック地形で描く）があるか */
  private besideSurface(bxi: number, byi: number, bzi: number): boolean {
    const wy = this.oy + byi - 1;
    const ct = this.colTy;
    const c = (bzi + 1) * BW + bxi + 1;
    return ct[c - 1] === wy || ct[c + 1] === wy || ct[c - BW] === wy || ct[c + BW] === wy;
  }

  /**
   * 見える面が 0 の固いブロックを「けずらない平らな箱」として 面を作る対象（active）に入れる。
   * 表面ブロック T は 小ブロック地形の高さ S が 上のへりより最大 6 小ブロック下まで へこむので、
   * となりの固いブロック X の T がわの面（見えない面 = 外がわの層は 9×9 ぜんぶつまっている）は、S と上のへりの間の帯が見える。
   * 1 ブロック単位の判定では ここは「見えない」ので、だれも面を作らず 地面の中ごしに空が見えてしまう（#142）。
   * 面を省くのは 小ブロック単位の判定（meshMicro の g[idx + off] !== 0）がやる: S が へこんでいない所は 面が 1 まいも 増えない。
   * 色は そのブロックの 3D テクスチャ（形のない絵のブロックは 色が決まらないので 対象にしない）。
   */
  private flatActive(bxi: number, byi: number, bzi: number, k: number): void {
    if (bxi < 1 || bxi > 16 || byi < 1 || byi > 16 || bzi < 1 || bzi > 16 || !hasLook(k)) return;
    const ai = ((byi - 1) * 16 + (bzi - 1)) * 16 + (bxi - 1);
    this.active[ai] = 1;
    this.kinds[ai] = k;
  }

  /** 見える面の印（fillGrid の 1.）の はじめ: 前の格子を消す */
  private beginExpose(): void {
    this.clearGrid();
    this.gap.fill(0);
  }

  /** 見える面の印（fillGrid の 1.）: ブロックの行 byi0 〜 byi1 の手前 */
  private exposeRows(byi0: number, byi1: number): void {
    const { bk, expo } = this;
    const terrain = this.terrain;
    let i = byi0 * BL * BL;
    for (let byi = byi0; byi < byi1; byi++) {
      for (let bzi = 0; bzi < BL; bzi++) {
        for (let bxi = 0; bxi < BL; bxi++, i++) {
          const k = bk[i];
          expo[i] = 0;
          if (k <= 0) continue;
          if (terrain && this.colTy[(bzi - 1 + 2) * BW + (bxi - 1 + 2)] === this.oy + byi - 1) {
            expo[i] = 63; // 地面: 小ブロック地形で あとから描く（下の固いブロックにも 面があると知らせる）
            continue;
          }
          if (!hasLook(k)) continue;
          let e = 0;
          for (let f = 0; f < 6; f++) {
            const n = this.kindNear(bxi, byi, bzi, f);
            if (n >= 0 && OCC[n] === 0) e |= 1 << f;
          }
          if (e === 0 && terrain && OCC[k] === 1) {
            // 小ブロック地形の となりの列の てっぺんが 同じ高さ: 地形の へこみから この横の面が 見える（置いた ブロックの下の地面・
            // 崖の下の段。ここが 空くと 空の色が すきまに 見える。TEX-A 基準 9）。形は つまったまま（へこませない）で、
            // 面を作る ブロックに する（面ができるのは となりのマスが 空のところだけ）
            const wy = this.oy + byi - 1;
            for (let f = 2; f < 6; f++) {
              const cx = bxi + DIR[f][0] + 1;
              const cz = bzi + DIR[f][2] + 1;
              if (cx >= 0 && cz >= 0 && cx < BW && cz < BW && this.colTy[cz * BW + cx] === wy) {
                this.gap[i] = 1;
                e = 1 << f;
                break;
              }
            }
          }
          expo[i] = e;
        }
      }
    }
  }

  /** 形をうめる（fillGrid の 2.）: ブロック i0 〜 i1 の手前（番号 = (byi * BL + bzi) * BL + bxi） */
  private fillBlocks(i0: number, i1: number): void {
    const { bk, expo } = this;
    const terrain = this.terrain;
    const scratch = this.scratch;
    for (let i = i0; i < i1; i++) {
      const k = bk[i];
      if (k === 0) continue;
      const bxi = i % BL;
      const bzi = ((i / BL) | 0) % BL;
      const byi = (i / (BL * BL)) | 0;
      const gx = bxi * N;
      const gy = byi * N;
      const gz = bzi * N;
      if (k < 0) {
        if (this.adjacentActive(bxi, byi, bzi)) {
          this.fillSolid(gx, gy, gz);
          this.markRows(byi, byi);
        }
        continue;
      }
      if (terrain && this.colTy[(bzi - 1 + 2) * BW + (bxi - 1 + 2)] === this.oy + byi - 1) continue;
      const e = expo[i];
      if (this.gap[i] === 1) {
        this.fillSolid(gx, gy, gz);
        this.markRows(byi, byi);
        if (bxi >= 1 && bxi <= 16 && byi >= 1 && byi <= 16 && bzi >= 1 && bzi <= 16) {
          const ai = ((byi - 1) * 16 + (bzi - 1)) * 16 + (bxi - 1);
          this.active[ai] = 1;
          this.kinds[ai] = k;
        }
        continue;
      }
      if (!hasLook(k) || e === 0) {
        if (OCC[k] === 1 && this.adjacentActive(bxi, byi, bzi)) {
          this.fillSolid(gx, gy, gz);
          this.markRows(byi, byi);
          if (terrain && this.besideSurface(bxi, byi, bzi)) this.flatActive(bxi, byi, bzi, k);
        }
        continue;
      }
      const wx = this.ox + bxi - 1;
      const wy = this.oy + byi - 1;
      const wz = this.oz + bzi - 1;
      fillBlockLook(k, wx, wy, wz, e, scratch);
      this.copyBlock(scratch, gx, gy, gz);
      this.markRows(byi, byi);
      if (bxi >= 1 && bxi <= 16 && byi >= 1 && byi <= 16 && bzi >= 1 && bzi <= 16) {
        const ai = ((byi - 1) * 16 + (bzi - 1)) * 16 + (bxi - 1);
        this.active[ai] = 1;
        this.kinds[ai] = k;
      }
    }
  }

  // ------------------------------------------------------------ 小ブロック地形

  /** まわりの列を調べる（行 j0 〜 j1 の手前）。このセクションの高さ（上下 1 ブロック）に 地面があれば scanAny が true になる */
  private scanRows(j0: number, j1: number): void {
    const info = this.colInfo;
    const lo = this.oy - 1;
    const hi = this.oy + 16;
    for (let j = j0; j < j1; j++) {
      for (let i = 0; i < BW; i++) {
        scanColumn(this.world, this.ox + i - 2, this.oz + j - 2, info);
        const k = j * BW + i;
        this.colTy[k] = info.ty;
        this.colKind[k] = info.kind;
        this.colReach[k] = info.reach;
        this.colRock[k] = info.rockOk ? 1 : 0;
        if (info.ty >= lo && info.ty <= hi && i >= 1 && i < BW - 1 && j >= 1 && j < BW - 1) this.scanAny = true;
      }
    }
  }

  /** 面を作るのは 自分の 144×144 と、そのまわり 1 マス（となりの有無）。高さの比べは 2 マス先まで読む。行 gz0 〜 gz1 の手前 */
  private sampleRows(gz0: number, gz1: number): void {
    const s = this.sample;
    const mx0 = this.ox * N - N;
    const mz0 = this.oz * N - N;
    for (let gz = gz0; gz < gz1; gz++) {
      for (let gx = N - 2; gx < S - N + 2; gx++) {
        sampleSurface(mx0 + gx, mz0 + gz, this.colSrc, s);
        const gi = gz * S + gx;
        let hh = s.h;
        // 自分の 16×16 の外の列は、地面ブロックの上のへり (ty+1)*9 で上を切る。
        // となりのセクションが 箱の段かもしれない（箱は上が平ら）ので、S がへりより高いと面がぬける（#143）
        if (gx < N || gx >= S - N || gz < N || gz >= S - N) {
          const ty = this.colTy[(Math.floor(gz / N) + 1) * BW + Math.floor(gx / N) + 1];
          if (ty >= 0 && hh > (ty + 1) * N) hh = (ty + 1) * N;
        }
        this.colH[gi] = hh;
        this.colG[gi] = s.ground;
        this.colIsRock[gi] = s.rock ? 1 : 0;
      }
    }
  }

  /** 自分の列 (bxl, bzl) の表面ブロック (ty) の すぐ下の固いブロックを、上の面も作る対象に入れる（flatActive と同じ考え） */
  private exposeBelow(bxl: number, bzl: number, ty: number): void {
    const by = ty - 1 - this.oy;
    if (by < 0 || by > 15) return;
    const k = this.bk[((by + 1) * BL + (bzl + 1)) * BL + (bxl + 1)];
    if (k > 0 && OCC[k] === 1) this.flatActive(bxl + 1, by + 1, bzl + 1, k);
  }

  /** 小ブロック地形を格子に書く。自分の列で 地面が このセクションにあるものだけ 面を作る（flag つき） */
  private fillTerrainRows(gz0: number, gz1: number): void {
    const grid = this.grid;
    const tf = this.tflag;
    const mx0 = this.ox * N - N;
    const mz0 = this.oz * N - N;
    const colH = this.colH;
    const rowBase = (this.oy - 1) * N;
    for (let gz = gz0; gz < gz1; gz++) {
      const bzl = Math.floor(gz / N) - 1;
      for (let gx = 0; gx < S; gx++) {
        const bxl = Math.floor(gx / N) - 1;
        const k = (bzl + 2) * BW + (bxl + 2);
        const ty = this.colTy[k];
        if (ty < 0) continue;
        const gi = gz * S + gx;
        const h = colH[gi];
        // S が ブロックの底まで下がった（アートが minAboveBase を 0 にしたとき）: すぐ下の固いブロックの上の面が 見える
        if (h <= ty * N && bxl >= 0 && bxl < 16 && bzl >= 0 && bzl < 16) this.exposeBelow(bxl, bzl, ty);
        const gy0 = Math.max(ty * N, rowBase) - rowBase;
        const gy1 = Math.min(h, rowBase + S) - rowBase;
        if (gy1 <= gy0) continue;
        this.markRows(Math.floor(gy0 / N), Math.floor((gy1 - 1) / N));
        const own = bxl >= 0 && bxl < 16 && bzl >= 0 && bzl < 16 && ty >= this.oy && ty < this.oy + 16;
        if (!own) {
          for (let y = gy0; y < gy1; y++) grid[(y * S + gz) * S + gx] = 1;
          continue;
        }
        const kindIdx = this.colKind[k];
        const g = this.colG[gi];
        const rockCol = this.colIsRock[gi] === 1;
        const wx = mx0 + gx;
        const wz = mz0 + gz;
        // まわり 2 マスの S の いちばん低い所（これより下のマスは よこから見えない）
        let m2 = h;
        for (let d = 1; d <= 2; d++) {
          for (let q = 0; q < 4; q++) {
            const ni = q === 0 ? gi - d : q === 1 ? gi + d : q === 2 ? gi - d * S : gi + d * S;
            const nh = colH[ni];
            if (nh >= 0 && nh < m2) m2 = nh;
          }
        }
        // 4 つのとなりより ひくい所は ぜんぶ囲まれていて 面ができない: 絵の行は 計算せず つめておく
        let m1 = h;
        for (let q = 0; q < 4; q++) {
          const nh = colH[q === 0 ? gi - 1 : q === 1 ? gi + 1 : q === 2 ? gi - S : gi + S];
          if (nh >= 0 && nh < m1) m1 = nh;
        }
        const gyFill = Math.min(gy1, Math.max(gy0, m1 - 1 - rowBase));
        for (let gy = gy0; gy < gyFill; gy++) {
          const idx = (gy * S + gz) * S + gx;
          grid[idx] = 1;
          tf[idx] = kindIdx;
        }
        for (let gy = gyFill; gy < gy1; gy++) {
          const y = gy + rowBase;
          const fromTop = h - 1 - y;
          const idx = (gy * S + gz) * S + gx;
          grid[idx] = 1;
          tf[idx] = (rowCodeOf(fromTop) << 6) | terrainKindOf(kindIdx, fromTop, rockCol && y >= g, wx, wz);
        }
        const by = ty - this.oy;
        this.active[(by * 16 + bzl) * 16 + bxl] = 1;
        if (h > (ty + 1) * N && by + 1 <= 16) this.active[((by + 1) * 16 + bzl) * 16 + bxl] = 1;
      }
    }
  }

  // ------------------------------------------------------------ micro（greedyShape）

  /** 面 f・層 l の 1 平面を 四角にまとめて builder に足す。mask は 使い切って 0 に戻るので 平面どうしは 独立 */
  private meshPlane(f: number, l: number): void {
    const g = this.grid;
    const tf = this.tflag;
    const b = this.builder;
    const mask = this.mask;
    const lg = this.lg;
    const ax = AXIS_OF[f];
    const plus = (f & 1) === 0;
    const uAx = ax === 0 ? 2 : 0;
    const vAx = ax === 1 ? 2 : 1;
    const nUb = NBLOCKS[uAx];
    const nVb = NBLOCKS[vAx];
    const uStep = GSTRIDE[uAx];
    const vStep = GSTRIDE[vAx];
    const lStep = GSTRIDE[ax];
    const off = NEIGHBOR_OFF[f];
    const widthU = nUb * N;
    const sizeV = nVb * N;
    const dx = DIR[f][0];
    const dy = DIR[f][1];
    const dz = DIR[f][2];
    const lb = (l / N) | 0;
    const li = l - lb * N;
    const edge = plus ? li === N - 1 : li === 0;
    let minU = 99;
    let maxU = -1;
    let minV = 99;
    let maxV = -1;
    for (let vb = 0; vb < nVb; vb++) {
      for (let ub = 0; ub < nUb; ub++) {
        let bX: number;
        let bY: number;
        let bZ: number;
        if (ax === 1) {
          bX = ub;
          bY = lb;
          bZ = vb;
        } else if (ax === 0) {
          bX = lb;
          bY = vb;
          bZ = ub;
        } else {
          bX = ub;
          bY = vb;
          bZ = lb;
        }
        const bi = (bY * 16 + bZ) * 16 + bX;
        if (!this.active[bi]) continue;
        const key = this.kinds[bi];
        const ci = ((bY + 1) * BL + (bZ + 1)) * BL + (bX + 1);
        let lightB = lg[ci];
        if (edge) {
          const nx = bX + 1 + dx;
          const ny = Math.min(bY + 1 + dy, BL - 1);
          const nz = bZ + 1 + dz;
          lightB = lg[(ny * BL + nz) * BL + nx];
        }
        const lk = lightB << 14;
        let touched = false;
        for (let vi = 0; vi < N; vi++) {
          const lv = vb * N + vi;
          for (let ui = 0; ui < N; ui++) {
            const lu = ub * N + ui;
            const idx = G_BASE + lu * uStep + lv * vStep + l * lStep;
            if (g[idx] === 0) continue;
            if (f === 0) {
              if (l + 1 < ROWS_ALL && g[idx + off] !== 0) continue;
            } else if (g[idx + off] !== 0) continue;
            const t = tf[idx];
            // 地形のマス: 種類 + 行の符号（上下の面は 行を使わない）。形のマス: ブロックの種類
            mask[lv * widthU + lu] = (t !== 0 ? (t & 63) | ((f < 2 ? ROW_NONE : t >> 6) << 6) : key | (ROW_NONE << 6)) | lk;
            touched = true;
          }
        }
        if (touched) {
          if (ub < minU) minU = ub;
          if (ub > maxU) maxU = ub;
          if (vb < minV) minV = vb;
          if (vb > maxV) maxV = vb;
        }
      }
    }
    if (maxU < 0) return;
    const uLo = minU * N;
    const uHi = (maxU + 1) * N;
    const vLo = minV * N;
    const vHi = Math.min((maxV + 1) * N, sizeV);
    const plane = l + (plus ? 1 : 0);
    for (let v = vLo; v < vHi; v++) {
      for (let u = uLo; u < uHi; u++) {
        const k = mask[v * widthU + u];
        if (k === 0) continue;
        let w = 1;
        while (u + w < uHi && mask[v * widthU + u + w] === k) w++;
        let h = 1;
        outer: while (v + h < vHi) {
          const row = (v + h) * widthU + u;
          for (let i = 0; i < w; i++) if (mask[row + i] !== k) break outer;
          h++;
        }
        for (let dv = 0; dv < h; dv++) mask.fill(0, (v + dv) * widthU + u, (v + dv) * widthU + u + w);
        const lo = [0, 0, 0];
        const hi = [0, 0, 0];
        lo[ax] = plane;
        hi[ax] = plane;
        lo[uAx] = u;
        hi[uAx] = u + w;
        lo[vAx] = v;
        hi[vAx] = v + h;
        const lbyte = (k >> 14) & 255;
        const sky = (lbyte >> 4) * 17;
        const blk = (lbyte & 15) * 17;
        const base = k & 0x3fff;
        b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], base & 63, base >> 6, 0, 0, sky, blk, null);
      }
    }
  }

  // ------------------------------------------------------------ box（形は 1 マス）

  /** 面の角の光（なめらかな平均）を out[0..1] に（0〜255 の バイト）。面の前のマスと、角のまわりの 3 マスのうち光を通すものの平均 */
  private corner(bxi: number, byi: number, bzi: number, f: number, v: readonly [number, number, number], out: Uint8Array, o: number, dy = 0): void {
    const fx = bxi + DIR[f][0];
    const fy = byi + DIR[f][1] + dy;
    const fz = bzi + DIR[f][2];
    let ax = 0;
    let ay = 0;
    let az = 0;
    let bx = 0;
    let by = 0;
    let bz = 0;
    if (DIR[f][0] !== 0) {
      ay = v[1] ? 1 : -1;
      bz = v[2] ? 1 : -1;
    } else if (DIR[f][1] !== 0) {
      ax = v[0] ? 1 : -1;
      bz = v[2] ? 1 : -1;
    } else {
      ax = v[0] ? 1 : -1;
      by = v[1] ? 1 : -1;
    }
    let s = 0;
    let bl = 0;
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const x = fx + (k & 1 ? ax : 0) + (k & 2 ? bx : 0);
      const y = fy + (k & 1 ? ay : 0) + (k & 2 ? by : 0);
      const z = fz + (k & 1 ? az : 0) + (k & 2 ? bz : 0);
      if (x < 0 || y < 0 || z < 0 || x >= BL || y >= BL || z >= BL) continue;
      const j = (y * BL + z) * BL + x;
      const t = this.bk[j];
      if (t < 0 || OPAQUE_LIGHT[t] === 1) continue;
      s += this.lsky[j];
      bl += this.lblk[j];
      n++;
    }
    if (n === 0) {
      out[o] = 0;
      out[o + 1] = 0;
      return;
    }
    out[o] = Math.round((s / n) * 17);
    out[o + 1] = Math.round((bl / n) * 17);
  }

  private meshBox(): void {
    const b = this.builder;
    const mask = this.mask;
    const bk = this.bk;
    const smooth = this.smooth;
    const co = this.cornerOut;
    this.edgeTy.fill(EDGE_UNKNOWN);
    for (let f = 0; f < 6; f++) {
      const ax = AXIS_OF[f];
      const plus = (f & 1) === 0;
      const uAx = ax === 0 ? 2 : 0;
      const vAx = ax === 1 ? 2 : 1;
      for (let l = 0; l < 16; l++) {
        let any = false;
        for (let v = 0; v < 16; v++) {
          for (let u = 0; u < 16; u++) {
            const bX = ax === 1 ? u : ax === 0 ? l : u;
            const bY = ax === 1 ? l : v;
            const bZ = ax === 1 ? v : ax === 0 ? u : l;
            const bxi = bX + 1;
            const byi = bY + 1;
            const bzi = bZ + 1;
            const kind = bk[(byi * BL + bzi) * BL + bxi];
            if (kind <= 0 || !hasLook(kind)) continue;
            const n = this.kindNear(bxi, byi, bzi, f);
            // となりが 不透明な表面ブロックで 描く面（#143）は、前のマスの光が 0 なので 1 段上（空気）から光を取る
            const edge = OCC[n] === 1;
            if (n < 0 || (edge && !this.edgeSurface(bxi, byi, bzi, f))) continue;
            // 角の光。4 つ同じなら まとめてよい
            let flat = true;
            for (let i = 0; i < 4; i++) {
              this.corner(bxi, byi, bzi, f, FACE_VERTS[f][i], co, i * 2, edge ? 1 : 0);
              if (i > 0 && (co[i * 2] !== co[0] || co[i * 2 + 1] !== co[1])) flat = false;
            }
            const cell = v * 16 + u;
            if (flat) {
              mask[cell] = (kind + 1) | (co[0] << 9) | (co[1] << 17);
            } else {
              mask[cell] = (1 << 30) | cell;
              smooth.set(co, cell * 8);
            }
            any = true;
          }
        }
        if (!any) continue;
        const plane = (l + (plus ? 1 : 0)) * N;
        for (let v = 0; v < 16; v++) {
          for (let u = 0; u < 16; u++) {
            const k = mask[v * 16 + u];
            if (k === 0) continue;
            let w = 1;
            while (u + w < 16 && mask[v * 16 + u + w] === k) w++;
            let h = 1;
            outer: while (v + h < 16) {
              for (let i = 0; i < w; i++) if (mask[(v + h) * 16 + u + i] !== k) break outer;
              h++;
            }
            for (let dv = 0; dv < h; dv++) mask.fill(0, (v + dv) * 16 + u, (v + dv) * 16 + u + w);
            const lo = [0, 0, 0];
            const hi = [0, 0, 0];
            lo[ax] = plane;
            hi[ax] = plane;
            lo[uAx] = u * N;
            hi[uAx] = (u + w) * N;
            lo[vAx] = v * N;
            hi[vAx] = (v + h) * N;
            if (k >= 1 << 30) {
              const cell = k & 0xffff;
              const kindHere = this.kindOfCell(ax, l, u, v);
              b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], kindHere, ROW_NONE, 0, 0, 0, 0, smooth.subarray(cell * 8, cell * 8 + 8));
            } else {
              b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], (k & 511) - 1, ROW_NONE, 0, 0, (k >> 9) & 255, (k >> 17) & 255, null);
            }
          }
        }
      }
    }
  }

  /** box: セクションの外の 1 周の列の 地面の表面ブロックの高さ (ty)。bk と同じ添字 (nz * BL + nx)。1 回の build の中で 列ごとに 1 度だけ調べる */
  private readonly edgeTy = new Int32Array(BL * BL);
  private readonly edgeInfo: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };

  /**
   * box: 横の面の となり（セクションの外）が その列の地面の表面ブロックなら true。
   * となりが 小ブロックの段だと S が 上のへりより下にへこむので、OCC でも横の面を描く。
   * 描かないと S と上のへりの間に穴があく（#143）。となりの列は build の中でキャッシュする
   */
  private edgeSurface(bxi: number, byi: number, bzi: number, f: number): boolean {
    if (f < 2) return false;
    const nx = bxi + DIR[f][0];
    const nz = bzi + DIR[f][2];
    if (nx >= 1 && nx <= 16 && nz >= 1 && nz <= 16) return false;
    const ei = nz * BL + nx;
    let ty = this.edgeTy[ei];
    if (ty === EDGE_UNKNOWN) {
      scanColumn(this.world, this.ox + nx - 1, this.oz + nz - 1, this.edgeInfo);
      ty = this.edgeTy[ei] = this.edgeInfo.ty;
    }
    return ty === this.oy + byi - 1;
  }

  /** box: 層 l の (u, v) のブロックの種類 */
  private kindOfCell(ax: number, l: number, u: number, v: number): number {
    const bX = ax === 1 ? u : ax === 0 ? l : u;
    const bY = ax === 1 ? l : v;
    const bZ = ax === 1 ? v : ax === 0 ? u : l;
    return this.bk[((bY + 1) * BL + (bZ + 1)) * BL + (bX + 1)];
  }
}
