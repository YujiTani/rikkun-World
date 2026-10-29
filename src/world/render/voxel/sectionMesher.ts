import type { CropStageSource } from '../../../contracts';
import { LOOK_VOLUME, fillBlockLookKata, hasLook, kataOf } from '../looks';
import { newSample, sampleSurface, type ColumnSource, type SurfaceSample } from '../../micro/microSurface';
import { scanColumn, type ColumnInfo } from '../../micro/worldColumns';
import { WATER } from '../../blocks/blockTypes';
import { OCC_BYTES, OCC_NY, packOccupancy } from './ao';
import { ROW_NONE, rowCodeOf, terrainKindOf } from './projection';
import type { WorldLight } from '../../light/WorldLight';
import type { ArrayVoxelWorld } from '../../VoxelWorld';
import { meshSectionExtras } from './sectionExtras';
import type { MeshData } from '../meshChunk';
import { BlockCube } from './sectionCube';
import { BoxMesher } from './sectionBox';
import * as K from './sectionConsts';
import { QuadBuilder, type VoxelPiece } from './sectionQuads';

// vitest の import は 読むたびに getter を通って 遅い。内側のループが読む定数は このファイルの const に写す（本番のビルドでは同じ）
const {
  AXIS_OF, BL, BW, CUBE, DIR, EXPOSE_ROWS, FILL_BLOCKS, G_BASE, GSTRIDE, LAYERS, LEAF, N, NBLOCKS, NEIGHBOR_OFF,
  OCC, OCC_ROWS, OWN, PH_BOX, PH_EXPOSE, PH_FILL, PH_FINISH, PH_IDLE, PH_LIGHT2, PH_OCC, PH_PLANES, PH_READ,
  PH_SAMPLE, PH_SCAN, PH_TFILL, PLANES_PER_STEP, READ_ROWS, ROWS_ALL, S, SAMPLE_ROWS, SCAN_ROWS, SS, TFILL_ROWS,
} = K;

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

export type { VoxelPiece };

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

export interface BuildOptions {
  crops?: CropStageSource;
  hide?: (x: number, y: number, z: number) => boolean;
}

const perfNow = (): number => performance.now();

export class SectionMesher {
  /** 小ブロックの格子: (y * S + z) * S + x。0 = 空。まわり 1 ブロックの余白つき（余白はとなりのセクションのぶん） */
  private readonly grid = new Uint8Array(S * SS);
  /** 格子と同じ並び: 0 でない = 小ブロック地形のマス。値 = 行の符号 << 6 | ブロックの種類 */
  private readonly tflag = new Uint16Array(S * SS);
  private useMin = 99;
  private useMax = -1;
  private readonly expo = new Uint8Array(CUBE);
  /** 1 = 地形のとなりで 面を作る つまった ブロック（地形のへこみから 横の面が 見える） */
  private readonly gap = new Uint8Array(CUBE);
  /** #202: 1 = 水のそば（型を使わず 毎回計算）、2 = 地下・ほらあな（表の @under） */
  private readonly uniq = new Uint8Array(CUBE);
  private readonly scratch = new Uint8Array(LOOK_VOLUME);
  /** 自分のブロックの高さ 0〜16（16 = 地形のとび出し）: 面を作る必要があるか／種類 */
  private readonly active = new Uint8Array(17 * 16 * 16);
  private readonly kinds = new Uint8Array(17 * 16 * 16);
  private readonly mask = new Int32Array(OWN * ROWS_ALL);
  private readonly builder = new QuadBuilder();
  /** まわり 1 ブロックをふくむ 18³ の種類と光 */
  private readonly cube: BlockCube;
  private readonly boxer: BoxMesher;
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
  ) {
    this.cube = new BlockCube(world, light);
    this.boxer = new BoxMesher(world, this.cube, this.builder, this.mask);
  }

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
    this.cube.setOrigin(this.ox, this.oy, this.oz);
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
        const cube = this.cube;
        for (let r = 0; r < BL; r++) cube.readRow(r);
        if (this.light) for (let r = 0; r < BL; r++) cube.lightRow2(r);
        else cube.lightNone();
        this.boxer.mesh();
        this.stepFinish();
        break;
      }
      case PH_READ: {
        const r1 = Math.min(this.cur + READ_ROWS, BL);
        for (let r = this.cur; r < r1; r++) this.cube.readRow(r);
        this.cur = r1;
        if (r1 < BL) break;
        this.cur = 0;
        if (this.light) this.phase = PH_LIGHT2;
        else {
          this.cube.lightNone();
          this.phase = PH_SCAN;
        }
        break;
      }
      case PH_LIGHT2: {
        const r1 = Math.min(this.cur + READ_ROWS, BL);
        for (let r = this.cur; r < r1; r++) this.cube.lightRow2(r);
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
    this.uniq.fill(0);
  }

  /** 見える面の印（fillGrid の 1.）: ブロックの行 byi0 〜 byi1 の手前 */
  private exposeRows(byi0: number, byi1: number): void {
    const { expo } = this;
    const cube = this.cube;
    const bk = cube.bk;
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
          let wet = false;
          for (let f = 0; f < 6; f++) {
            const n = cube.kindNear(bxi, byi, bzi, f);
            if (n >= 0 && OCC[n] === 0) e |= 1 << f;
            if (n === WATER) wet = true;
          }
          this.uniq[i] = e === 0 ? 0 : wet ? 1 : LEAF[k] === 0 && kataOf(k) > 0 && this.underground(bxi, byi, bzi, e) ? 2 : 0;
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

  /**
   * 見える面の前の 空気が 地面の下か（#202 ほらあな・地下）: その列の地面（小ブロック地形の列は colTy、ほかは topY）が
   * 空気より上にあれば、空から見えない 地下の面。崖の横の面は となりの列の地面が低いので ちがう。
   */
  private underground(bxi: number, byi: number, bzi: number, e: number): boolean {
    const wy = this.oy + byi - 1;
    for (let f = 0; f < 6; f++) {
      if (!(e & (1 << f))) continue;
      const nx = bxi + DIR[f][0];
      const nz = bzi + DIR[f][2];
      const ay = wy + DIR[f][1];
      let top: number;
      if (this.terrain) top = this.colTy[(nz - 1 + 2) * BW + (nx - 1 + 2)];
      else top = this.world.topY(this.ox + nx - 1, this.oz + nz - 1);
      if (top > ay) return true;
    }
    return false;
  }

  /** 形をうめる（fillGrid の 2.）: ブロック i0 〜 i1 の手前（番号 = (byi * BL + bzi) * BL + bxi） */
  private fillBlocks(i0: number, i1: number): void {
    const { expo } = this;
    const cube = this.cube;
    const bk = cube.bk;
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
      fillBlockLookKata(k, wx, wy, wz, e, this.uniq[i] !== 0, scratch, this.uniq[i] === 2);
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
    const k = this.cube.bk[((by + 1) * BL + (bzl + 1)) * BL + (bxl + 1)];
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
    const lg = this.cube.lg;
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
}
