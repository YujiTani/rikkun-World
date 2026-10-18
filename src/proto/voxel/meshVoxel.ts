import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isTorchIndex } from '../../world/blocks/blockTypes';
import type { TileName } from '../../world/blocks/textures';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../../world/VoxelWorld';
import { crossTileName, pushCross, type MeshData } from '../../world/render/meshChunk';
import {
  LOOK_N,
  LOOK_VOLUME,
  baseColorOf,
  currentLook,
  fillBlockLook,
  hasLook,
  initLooks,
  lookIdOf,
  occludes,
  paletteRgb,
} from './looks';
import { newSample, sampleSurface, type ColumnSource, type SurfaceSample } from '../../world/micro/microSurface';
import { scanColumn, type ColumnInfo } from '../../world/micro/worldColumns';

/**
 * 9×9×9 の小ブロックのメッシュ作り（three に依存しない。型付き配列で作る）。
 * - 小ブロックの面は、となりの小ブロックが空のときだけ出す。
 * - naive: 小面 1 つ = 四角 1 枚 / greedyColor: 同じ向き・同じ高さ・同じ色をまとめる /
 *   greedyShape: 色を見ず、同じ種類のブロックどうしを形だけでまとめる（色はシェーダーが 3D テクスチャから引く）。
 */
/** box: 形は 1 マスの箱のまま、色だけ 9×9 の模様（greedyShape と同じ 3D テクスチャ）。hybrid の中くらいの距離で使う */
export type VoxelMode = 'naive' | 'greedyColor' | 'greedyShape' | 'box';

const C = CHUNK_SIZE;
const N = LOOK_N;
/** チャンクの横の小ブロック数 */
const CV = C * N;
/** まわり 1 ブロックぶんをふくむ横の大きさ（小ブロック） */
const S = (C + 2) * N;
const SS = S * S;
/** 小ブロック地形で調べる列の幅（ブロック）: チャンク + まわり 2 ブロック */
const BW = C + 4;

initLooks(BLOCK_TYPES.map((t) => t.id));

/**
 * 頂点データ（1 つのメッシュ = 頂点 65535 個以下）。
 * - positions: チャンクの中の小ブロック座標（Uint16 ×3。チャンクの位置と 1/9 倍は mesh.position / mesh.scale で）
 * - data: aData = [r, g, b, 面の番号]。shape のとき r = ブロックの番号
 */
export interface QuadPiece {
  positions: Uint16Array;
  data: Uint8Array;
  indices: Uint16Array;
  vertexCount: number;
}

export interface QuadMesh {
  pieces: QuadPiece[];
  /** 四角の数 */
  faces: number;
  /** 四角の広さの合計（小ブロックの面 1 つ = 1） */
  areaSmall: number;
}

export interface VoxelChunkMesh {
  solid: QuadMesh;
  /** 小ブロック地形（VOX-2）の面。色は頂点に入れる（地形の色は 位置ではなく 深さで決まるため）。無ければ空 */
  solidColor: QuadMesh;
  /** 十字の板・たいまつ（今の描き方。atlas の絵） */
  cross: MeshData;
  /** 水の上の面（平らな半透明） */
  water: MeshData;
}

/** meshChunk の FACES と同じ向き・同じ角の並び */
const FACE_VERTS: readonly (readonly [number, number, number])[][] = [
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];

const PIECE_VERTS = 65532;

class QuadBuilder {
  private pos = new Uint16Array(3 * PIECE_VERTS);
  private dat = new Uint8Array(4 * PIECE_VERTS);
  private idx = new Uint16Array((PIECE_VERTS / 4) * 6);
  private nv = 0;
  private ni = 0;
  private pieces: QuadPiece[] = [];
  faces = 0;
  area = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
    this.pieces = [];
    this.faces = 0;
    this.area = 0;
  }

  private flush(): void {
    if (this.nv === 0) return;
    this.pieces.push({
      positions: this.pos.slice(0, this.nv * 3),
      data: this.dat.slice(0, this.nv * 4),
      indices: this.idx.slice(0, this.ni),
      vertexCount: this.nv,
    });
    this.nv = 0;
    this.ni = 0;
  }

  /** 座標はチャンクの中の小ブロック（整数）。面は f の向き */
  quad(
    f: number,
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    r: number,
    g: number,
    b: number,
    area: number,
  ): void {
    if (this.nv + 4 > PIECE_VERTS) this.flush();
    const verts = FACE_VERTS[f];
    const pos = this.pos;
    const dat = this.dat;
    let p = this.nv * 3;
    let d = this.nv * 4;
    for (let i = 0; i < 4; i++) {
      const v = verts[i];
      pos[p++] = v[0] ? x1 : x0;
      pos[p++] = v[1] ? y1 : y0;
      pos[p++] = v[2] ? z1 : z0;
      dat[d++] = r;
      dat[d++] = g;
      dat[d++] = b;
      dat[d++] = f;
    }
    const base = this.nv;
    const idx = this.idx;
    let q = this.ni;
    idx[q++] = base;
    idx[q++] = base + 1;
    idx[q++] = base + 2;
    idx[q++] = base;
    idx[q++] = base + 2;
    idx[q++] = base + 3;
    this.nv += 4;
    this.ni = q;
    this.faces++;
    this.area += area;
  }

  finish(): QuadMesh {
    this.flush();
    return { pieces: this.pieces, faces: this.faces, areaSmall: this.area };
  }
}

function emptyQuadMesh(): QuadMesh {
  return { pieces: [], faces: 0, areaSmall: 0 };
}

function emptyData(): MeshData {
  return { positions: [], uvs: [], colors: [], lights: [], darks: [], indices: [], faceCount: 0 };
}

function pushWaterTop(mesh: MeshData, x: number, y: number, z: number): void {
  const base = mesh.positions.length / 3;
  mesh.positions.push(x, y + 1, z + 1, x + 1, y + 1, z + 1, x + 1, y + 1, z, x, y + 1, z);
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}

/** 面の向きごとの、小ブロック格子での となりへの足し算（上, 下, +x, -x, +z, -z） */
const NEIGHBOR_OFF = [SS, -SS, 1, -1, S, -S];

export class VoxelChunkMesher {
  /** 小ブロックの格子: (y * S + z) * S + x。0 = 空。x, z はまわり 1 ブロックぶん（9 小ブロック）の余白つき */
  private readonly grid: Uint8Array;
  private readonly builder = new QuadBuilder();
  private readonly scratch = new Uint8Array(LOOK_VOLUME);
  /** チャンクの中のブロック: 面を作る必要があるか（1）／種類 */
  private readonly active: Uint8Array;
  private readonly kinds: Uint8Array;
  private readonly maskV: Uint16Array;
  private readonly boxMask: Uint8Array;
  /** 小ブロック地形の色つき面用（形の方式の中で 色を頂点に持つ面） */
  private readonly builderColor = new QuadBuilder();
  /** 格子と同じ並び: 1 = 小ブロック地形のマス（色は 格子の色番号を そのまま使う） */
  private readonly tflag: Uint8Array;
  // 小ブロック地形の作業用（チャンク + まわり 2 ブロックの列）
  private readonly colTy = new Int16Array(BW * BW);
  private readonly colKind = new Uint8Array(BW * BW);
  private readonly colReach = new Int8Array(BW * BW);
  private readonly colRock = new Uint8Array(BW * BW);
  private readonly colH = new Int16Array(SS);
  private readonly colG = new Int16Array(SS);
  private readonly colIsRock = new Uint8Array(SS);
  private readonly colInfo: ColumnInfo = { ty: -1, kind: 0, reach: 0, rockOk: false };
  private readonly sample: SurfaceSample = newSample();
  private ox = 0;
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
    forest: (bx, bz) => (this.world.microForest === null ? 0 : this.world.microForest(bx, bz)),
  };

  constructor(private readonly world: ArrayVoxelWorld) {
    this.grid = new Uint8Array(SS * world.size.y * N);
    this.active = new Uint8Array(C * C * world.size.y);
    this.kinds = new Uint8Array(C * C * world.size.y);
    this.boxMask = new Uint8Array(C * Math.max(C, world.size.y));
    this.maskV = new Uint16Array(CV * world.size.y * N);
    this.tflag = new Uint8Array(SS * world.size.y * N);
  }

  /** 世界のブロック座標 → 作業用の列の番号（範囲外は -1） */
  private colIndex(bx: number, bz: number): number {
    const i = bx - this.ox + 2;
    const j = bz - this.oz + 2;
    return i < 0 || j < 0 || i >= BW || j >= BW ? -1 : j * BW + i;
  }

  /** 小ブロック地形: チャンクのまわりの列を調べ、S（つまっている高さ）を格子の列ごとに決める */
  private prepareMicro(cx: number, cz: number): void {
    const x0 = cx * C;
    const z0 = cz * C;
    this.ox = x0;
    this.oz = z0;
    const info = this.colInfo;
    for (let j = 0; j < BW; j++) {
      for (let i = 0; i < BW; i++) {
        scanColumn(this.world, x0 + i - 2, z0 + j - 2, info);
        const k = j * BW + i;
        this.colTy[k] = info.ty;
        this.colKind[k] = info.kind;
        this.colReach[k] = info.reach;
        this.colRock[k] = info.rockOk ? 1 : 0;
      }
    }
    const s = this.sample;
    const mx0 = x0 * N - N;
    const mz0 = z0 * N - N;
    for (let gz = 0; gz < S; gz++) {
      for (let gx = 0; gx < S; gx++) {
        sampleSurface(mx0 + gx, mz0 + gz, this.colSrc, s);
        const gi = gz * S + gx;
        this.colH[gi] = s.h;
        this.colG[gi] = s.ground;
        this.colIsRock[gi] = s.rock ? 1 : 0;
      }
    }
  }

  /** 小ブロック地形を 格子に書く（地面ブロックと、そのすぐ上の空気ブロックのぶん） */
  private fillMicro(cx: number, cz: number, yTop: number, H: number): void {
    const grid = this.grid;
    const tf = this.tflag;
    const look = currentLook();
    const colorFn = look.terrainColor;
    const mx0 = cx * CV - N;
    const mz0 = cz * CV - N;
    const colH = this.colH;
    for (let gz = 0; gz < S; gz++) {
      const bzl = Math.floor(gz / N) - 1;
      for (let gx = 0; gx < S; gx++) {
        const bxl = Math.floor(gx / N) - 1;
        const k = (bzl + 2) * BW + (bxl + 2);
        const ty = this.colTy[k];
        if (ty < 0) continue;
        const gi = gz * S + gx;
        const h = colH[gi];
        const own = bxl >= 0 && bxl < C && bzl >= 0 && bzl < C;
        const yEnd = Math.min(h, H);
        const y0 = ty * N;
        if (!own) {
          for (let y = y0; y < yEnd; y++) grid[(y * S + gz) * S + gx] = 1;
          continue;
        }
        const kindId = lookIdOf(this.colKind[k]);
        const fallback = baseColorOf(this.colKind[k]);
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
        // てっぺんのマスは、となりが 高いほど くぼみ（ほりかげ）: 1 マス高い = 1 段内の色、2 マス以上 = 2 段内の色
        let rise = 0;
        for (let q = 0; q < 4; q++) {
          const nh = colH[q === 0 ? gi - 1 : q === 1 ? gi + 1 : q === 2 ? gi - S : gi + S];
          if (nh - h > rise) rise = nh - h;
        }
        const topDepth = rise >= 2 ? 2 : rise;
        for (let y = y0; y < yEnd; y++) {
          const fromTop = h - 1 - y;
          let depth = fromTop === 0 ? topDepth : fromTop < 2 ? fromTop : 2;
          if (depth > 0 && y >= m2) {
            // よこの となり（1 マス・2 マス先）が 空いていれば、そのぶん外がわに近い
            for (let d = 1; d <= 2 && d - 1 < depth; d++) {
              let open = false;
              for (let q = 0; q < 4; q++) {
                const ni = q === 0 ? gi - d : q === 1 ? gi + d : q === 2 ? gi - d * S : gi + d * S;
                const nh = colH[ni];
                if (nh >= 0 && y >= nh) open = true;
              }
              if (open) {
                depth = d - 1;
                break;
              }
            }
          }
          const idx = (y * S + gz) * S + gx;
          grid[idx] = colorFn ? colorFn(kindId, depth, fromTop, rockCol && y >= g, wx, y, wz) : fallback;
          tf[idx] = 1;
        }
        this.active[(ty * C + bzl) * C + bxl] = 1;
        if (h > (ty + 1) * N && ty + 1 <= yTop) this.active[((ty + 1) * C + bzl) * C + bxl] = 1;
      }
    }
  }

  /** チャンクのいちばん高い（空気でない）ブロックの y。無ければ -1 */
  private topOf(cx: number, cz: number): number {
    const world = this.world;
    for (let y = world.size.y - 1; y >= 0; y--) {
      for (let z = 0; z < C; z++) {
        for (let x = 0; x < C; x++) {
          if (world.getIndex(cx * C + x, y, cz * C + z) > AIR) return y;
        }
      }
    }
    return -1;
  }

  /** 箱の方式（形は 1 マス）。十字の板・水は micro と同じ */
  private buildBox(cx: number, cz: number): VoxelChunkMesh {
    const world = this.world;
    const x0 = cx * C;
    const z0 = cz * C;
    const cross = emptyData();
    const water = emptyData();
    const b = this.builder;
    b.reset();
    const yTop = this.topOf(cx, cz);
    if (yTop < 0) return { solid: b.finish(), solidColor: emptyQuadMesh(), cross, water };
    for (let by = 0; by <= yTop; by++) {
      for (let bz = 0; bz < C; bz++) {
        for (let bx = 0; bx < C; bx++) {
          const wx = x0 + bx;
          const wz = z0 + bz;
          const kind = world.getIndex(wx, by, wz);
          if (kind === WATER) {
            if (world.getIndex(wx, by + 1, wz) === AIR) pushWaterTop(water, wx, by, wz);
          } else if (isTorchIndex(kind)) {
            pushCross(cross, wx, by, wz, BLOCK_TYPES[kind].id as TileName, 1, 0);
          } else if (isCrossIndex(kind)) {
            pushCross(cross, wx, by, wz, crossTileName(kind, 3), 1, 0);
          }
        }
      }
    }
    const mask = this.boxMask;
    const nb = yTop + 1;
    for (let f = 0; f < 6; f++) {
      const ax = AXIS_OF[f];
      const plus = (f & 1) === 0;
      const nU = C;
      const nV = ax === 1 ? C : nb;
      const L = ax === 1 ? nb : C;
      const d = DIR[f];
      for (let l = 0; l < L; l++) {
        let any = false;
        for (let v = 0; v < nV; v++) {
          for (let u = 0; u < nU; u++) {
            const bX = ax === 1 ? u : ax === 0 ? l : u;
            const bY = ax === 1 ? l : v;
            const bZ = ax === 1 ? v : ax === 0 ? u : l;
            const kind = world.getIndex(x0 + bX, bY, z0 + bZ);
            if (kind <= AIR || !hasLook(kind)) continue;
            const n = world.getIndex(x0 + bX + d[0], bY + d[1], z0 + bZ + d[2]);
            if (n < 0 || hasLook(n)) continue;
            mask[v * nU + u] = kind + 1;
            any = true;
          }
        }
        if (!any) continue;
        const plane = (l + (plus ? 1 : 0)) * N;
        for (let v = 0; v < nV; v++) {
          for (let u = 0; u < nU; u++) {
            const k = mask[v * nU + u];
            if (k === 0) continue;
            let w = 1;
            while (u + w < nU && mask[v * nU + u + w] === k) w++;
            let h = 1;
            outer: while (v + h < nV) {
              for (let i = 0; i < w; i++) if (mask[(v + h) * nU + u + i] !== k) break outer;
              h++;
            }
            for (let dv = 0; dv < h; dv++) mask.fill(0, (v + dv) * nU + u, (v + dv) * nU + u + w);
            const lo = [0, 0, 0];
            const hi = [0, 0, 0];
            const uAx = ax === 0 ? 2 : 0;
            const vAx = ax === 1 ? 2 : 1;
            lo[ax] = plane;
            hi[ax] = plane;
            lo[uAx] = u * N;
            hi[uAx] = (u + w) * N;
            lo[vAx] = v * N;
            hi[vAx] = (v + h) * N;
            b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], k - 1, 0, 0, w * h * N * N);
          }
        }
      }
    }
    return { solid: b.finish(), solidColor: emptyQuadMesh(), cross, water };
  }

  /** terrain = true: 地面を 小ブロック単位の形にする（VOX-2。box には効かない） */
  build(cx: number, cz: number, mode: VoxelMode, terrain = false): VoxelChunkMesh {
    if (mode === 'box') return this.buildBox(cx, cz);
    const micro = terrain;
    const world = this.world;
    const x0 = cx * C;
    const z0 = cz * C;
    const cross = emptyData();
    const water = emptyData();

    let yTop = this.topOf(cx, cz);
    if (yTop < 0) {
      this.builder.reset();
      return { solid: this.builder.finish(), solidColor: emptyQuadMesh(), cross, water };
    }
    // 小ブロック地形は 地面ブロックの上の空気ブロックにも はみ出す
    if (micro) yTop = Math.min(yTop + 1, this.world.size.y - 1);
    const H = (yTop + 1) * N;
    const grid = this.grid;
    grid.fill(0, 0, H * SS);
    this.tflag.fill(0, 0, H * SS);
    this.active.fill(0, 0, C * C * (yTop + 1));
    const scratch = this.scratch;
    if (micro) this.prepareMicro(cx, cz);

    for (let by = 0; by <= yTop; by++) {
      for (let bz = -1; bz <= C; bz++) {
        for (let bx = -1; bx <= C; bx++) {
          const wx = x0 + bx;
          const wz = z0 + bz;
          const kind = world.getIndex(wx, by, wz);
          const own = bx >= 0 && bx < C && bz >= 0 && bz < C;
          const gx = (bx + 1) * N;
          const gz = (bz + 1) * N;
          const gy = by * N;
          if (kind < 0) {
            // 世界の外: つまっているものとして あつかう（外へ向く面は出さない）
            fillSolid(grid, gx, gy, gz);
            continue;
          }
          if (kind === AIR) continue;
          // 小ブロック地形の地面ブロックは あとで（fillMicro）
          if (micro && this.colTy[(bz + 2) * BW + bx + 2] === by) continue;
          if (own) {
            if (kind === WATER) {
              if (world.getIndex(wx, by + 1, wz) === AIR) pushWaterTop(water, wx, by, wz);
              continue;
            }
            if (isTorchIndex(kind)) {
              pushCross(cross, wx, by, wz, BLOCK_TYPES[kind].id as TileName, 1, 0);
              continue;
            }
            if (isCrossIndex(kind)) {
              pushCross(cross, wx, by, wz, crossTileName(kind, 3), 1, 0);
              continue;
            }
          }
          if (!hasLook(kind)) continue;
          // 見える面（となりが かくさないブロックの面）
          let exposed = 0;
          for (let f = 0; f < 6; f++) {
            const n = world.getIndex(wx + DIR[f][0], by + DIR[f][1], wz + DIR[f][2]);
            if (n >= 0 && !occludes(n)) exposed |= 1 << f;
          }
          if (exposed === 0 && occludes(kind)) {
            fillSolid(grid, gx, gy, gz);
            continue;
          }
          fillBlockLook(kind, wx, by, wz, exposed, scratch);
          copyBlock(grid, scratch, gx, gy, gz);
          if (own) {
            const bi = (by * C + bz) * C + bx;
            this.active[bi] = 1;
            this.kinds[bi] = kind;
          }
        }
      }
    }

    if (micro) this.fillMicro(cx, cz, yTop, H);

    const b = this.builder;
    b.reset();
    this.builderColor.reset();
    if (mode === 'naive') this.meshNaive(yTop, H);
    else this.meshGreedy(yTop, H, mode === 'greedyShape');
    return { solid: b.finish(), solidColor: this.builderColor.finish(), cross, water };
  }

  private meshNaive(yTop: number, H: number): void {
    const PAL = paletteRgb();
    const g = this.grid;
    const b = this.builder;
    const inv = 1; // 座標は小ブロックのまま
    for (let by = 0; by <= yTop; by++) {
      for (let bz = 0; bz < C; bz++) {
        for (let bx = 0; bx < C; bx++) {
          if (!this.active[(by * C + bz) * C + bx]) continue;
          for (let iy = 0; iy < N; iy++) {
            const ly = by * N + iy;
            for (let iz = 0; iz < N; iz++) {
              const lz = bz * N + iz;
              for (let ix = 0; ix < N; ix++) {
                const lx = bx * N + ix;
                const idx = (ly * S + lz + N) * S + lx + N;
                const c = g[idx];
                if (c === 0) continue;
                const wx = lx;
                const wz = lz;
                const wy = ly;
                const r = PAL[c * 3];
                const gg = PAL[c * 3 + 1];
                const bb = PAL[c * 3 + 2];
                for (let f = 0; f < 6; f++) {
                  if (!faceVisible(g, idx, f, ly, H)) continue;
                  const xa = f === 2 ? wx + inv : wx;
                  const xb = f === 3 ? wx : wx + inv;
                  const ya = f === 0 ? wy + inv : wy;
                  const yb = f === 1 ? wy : wy + inv;
                  const za = f === 4 ? wz + inv : wz;
                  const zb = f === 5 ? wz : wz + inv;
                  b.quad(f, xa, xb, ya, yb, za, zb, r, gg, bb, 1);
                }
              }
            }
          }
        }
      }
    }
  }

  private meshGreedy(yTop: number, H: number, shape: boolean): void {
    const PAL = paletteRgb();
    const g = this.grid;
    const b = this.builder;
    const mask = this.maskV;
    const inv = 1;
    const origin = [0, 0, 0];
    const gStride = [1, SS, S]; // 格子の足し算（x, y, z）
    const nb = yTop + 1;
    for (let f = 0; f < 6; f++) {
      const ax = AXIS_OF[f];
      const plus = (f & 1) === 0;
      const uAx = ax === 0 ? 2 : 0;
      const vAx = ax === 1 ? 2 : 1;
      const nUb = C;
      const nVb = ax === 1 ? C : nb;
      const L = ax === 1 ? H : CV;
      const uStep = gStride[uAx];
      const vStep = gStride[vAx];
      const lStep = gStride[ax];
      const off = NEIGHBOR_OFF[f];
      const gBase = N * 1 + N * S; // x, z の余白
      const widthU = CV;
      const sizeV = ax === 1 ? CV : H;
      for (let l = 0; l < L; l++) {
        const lb = (l / N) | 0;
        let minU = 99;
        let maxU = -1;
        let minV = 99;
        let maxV = -1;
        for (let vb = 0; vb < nVb; vb++) {
          for (let ub = 0; ub < nUb; ub++) {
            // ブロックの (bx, by, bz)
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
            const bi = (bY * C + bZ) * C + bX;
            if (!this.active[bi]) continue;
            const key = shape ? this.kinds[bi] : 0;
            let touched = false;
            for (let vi = 0; vi < N; vi++) {
              const lv = vb * N + vi;
              for (let ui = 0; ui < N; ui++) {
                const lu = ub * N + ui;
                const idx = gBase + lu * uStep + lv * vStep + l * lStep;
                const c = g[idx];
                if (c === 0) continue;
                if (f === 0) {
                  if (l + 1 < H && g[idx + off] !== 0) continue;
                } else if (f === 1) {
                  if (l === 0 || g[idx + off] !== 0) continue;
                } else if (g[idx + off] !== 0) continue;
                // 小ブロック地形のマスは 色を頂点に持つ（256 + 色番号）
                mask[lv * widthU + lu] = this.tflag[idx] ? 256 + c : shape ? key + 1 : c;
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
        if (maxU < 0) continue;
        const uLo = minU * N;
        const uHi = (maxU + 1) * N;
        const vLo = minV * N;
        const vHi = Math.min((maxV + 1) * N, sizeV);
        const plane = origin[ax] + (l + (plus ? 1 : 0)) * inv;
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
            // 四角の外側の角（ワールドの座標）
            const lo = [0, 0, 0];
            const hi = [0, 0, 0];
            lo[ax] = plane;
            hi[ax] = plane;
            lo[uAx] = origin[uAx] + u * inv;
            hi[uAx] = origin[uAx] + (u + w) * inv;
            lo[vAx] = origin[vAx] + v * inv;
            hi[vAx] = origin[vAx] + (v + h) * inv;
            if (k >= 256) {
              const c = k - 256;
              this.builderColor.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], PAL[c * 3], PAL[c * 3 + 1], PAL[c * 3 + 2], w * h);
            } else if (shape) b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], k - 1, 0, 0, w * h);
            else b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], PAL[k * 3], PAL[k * 3 + 1], PAL[k * 3 + 2], w * h);
          }
        }
      }
    }
  }
}

/** 面の番号 → 軸（0 = x, 1 = y, 2 = z） */
const AXIS_OF = [1, 1, 0, 0, 2, 2];

const DIR: readonly (readonly [number, number, number])[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];

function faceVisible(g: Uint8Array, idx: number, f: number, ly: number, H: number): boolean {
  if (f === 0) return ly + 1 >= H || g[idx + SS] === 0;
  if (f === 1) return ly > 0 && g[idx - SS] === 0;
  return g[idx + NEIGHBOR_OFF[f]] === 0;
}

function fillSolid(grid: Uint8Array, gx: number, gy: number, gz: number): void {
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      const s = ((gy + y) * S + gz + z) * S + gx;
      grid.fill(1, s, s + N);
    }
  }
}

function copyBlock(grid: Uint8Array, src: Uint8Array, gx: number, gy: number, gz: number): void {
  let i = 0;
  for (let y = 0; y < N; y++) {
    for (let z = 0; z < N; z++) {
      const s = ((gy + y) * S + gz + z) * S + gx;
      for (let x = 0; x < N; x++) grid[s + x] = src[i++];
    }
  }
}
