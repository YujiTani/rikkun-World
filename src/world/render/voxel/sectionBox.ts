import { scanColumn, type ColumnInfo } from '../../micro/worldColumns';
import type { ArrayVoxelWorld } from '../../VoxelWorld';
import { hasLook } from '../looks';
import type { BlockCube } from './sectionCube';
import * as K from './sectionConsts';
import type { QuadBuilder } from './sectionQuads';
import { ROW_NONE } from './projection';

// vitest の import は 読むたびに getter を通って 遅い。内側のループが読む定数は このファイルの const に写す（本番のビルドでは同じ）
const { AXIS_OF, BL, DIR, EDGE_UNKNOWN, FACE_VERTS, N, OCC } = K;

/**
 * box の段（形は 1 マスの箱）のメッシュ作り（SectionMesher から分けた。4-7）。
 * 18³ の種類・光は BlockCube から読み、四角は builder に足す。mask は SectionMesher と共有する作業用（使い切って 0 に戻る）。
 */
export class BoxMesher {
  private readonly smooth = new Uint8Array(256 * 8);
  private readonly cornerOut = new Uint8Array(8);
  /** box: セクションの外の 1 周の列の 地面の表面ブロックの高さ (ty)。bk と同じ添字 (nz * BL + nx)。1 回の build の中で 列ごとに 1 度だけ調べる */
  private readonly edgeTy = new Int32Array(BL * BL);
  private readonly edgeInfo: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };

  constructor(
    private readonly world: ArrayVoxelWorld,
    private readonly cube: BlockCube,
    private readonly builder: QuadBuilder,
    private readonly mask: Int32Array,
  ) {}

  mesh(): void {
    const b = this.builder;
    const mask = this.mask;
    const cube = this.cube;
    const bk = cube.bk;
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
            const n = cube.kindNear(bxi, byi, bzi, f);
            // となりが 不透明な表面ブロックで 描く面（#143）は、前のマスの光が 0 なので 1 段上（空気）から光を取る
            const edge = OCC[n] === 1;
            if (n < 0 || (edge && !this.edgeSurface(bxi, byi, bzi, f))) continue;
            // 角の光。4 つ同じなら まとめてよい
            let flat = true;
            for (let i = 0; i < 4; i++) {
              cube.corner(bxi, byi, bzi, f, FACE_VERTS[f][i], co, i * 2, edge ? 1 : 0);
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
      scanColumn(this.world, this.cube.ox + nx - 1, this.cube.oz + nz - 1, this.edgeInfo);
      ty = this.edgeTy[ei] = this.edgeInfo.ty;
    }
    return ty === this.cube.oy + byi - 1;
  }

  /** box: 層 l の (u, v) のブロックの種類 */
  private kindOfCell(ax: number, l: number, u: number, v: number): number {
    const bX = ax === 1 ? u : ax === 0 ? l : u;
    const bY = ax === 1 ? l : v;
    const bZ = ax === 1 ? v : ax === 0 ? u : l;
    return this.cube.bk[((bY + 1) * BL + (bZ + 1)) * BL + (bX + 1)];
  }
}
