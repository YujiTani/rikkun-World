import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isTorchIndex } from '../../world/blocks/blockTypes';
import type { TileName } from '../../world/blocks/textures';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../../world/VoxelWorld';
import { crossTileName, pushCross, type MeshData } from '../../world/render/meshChunk';
import {
  LOOK_N,
  LOOK_VOLUME,
  fillBlockLook,
  hasLook,
  initLooks,
  occludes,
  PALETTE_RGB as PAL,
} from './looks/placeholder';

/**
 * 9×9×9 の小ブロックのメッシュ作り（three に依存しない。型付き配列で作る）。
 * - 小ブロックの面は、となりの小ブロックが空のときだけ出す。
 * - naive: 小面 1 つ = 四角 1 枚 / greedyColor: 同じ向き・同じ高さ・同じ色をまとめる /
 *   greedyShape: 色を見ず、同じ種類のブロックどうしを形だけでまとめる（色はシェーダーが 3D テクスチャから引く）。
 */
export type VoxelMode = 'naive' | 'greedyColor' | 'greedyShape';

const C = CHUNK_SIZE;
const N = LOOK_N;
/** チャンクの横の小ブロック数 */
const CV = C * N;
/** まわり 1 ブロックぶんをふくむ横の大きさ（小ブロック） */
const S = (C + 2) * N;
const SS = S * S;

initLooks(BLOCK_TYPES.map((t) => t.id));

/** 頂点データ: attribute `aData` = [r, g, b, 面の番号]。shape のときは r = ブロックの番号 */
export interface QuadMesh {
  positions: Float32Array;
  data: Uint8Array;
  indices: Uint32Array;
  /** 四角の数 */
  faces: number;
  /** 四角の広さの合計（小ブロックの面 1 つ = 1） */
  areaSmall: number;
}

export interface VoxelChunkMesh {
  solid: QuadMesh;
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

class QuadBuilder {
  private pos = new Float32Array(3 * 4 * 4096);
  private dat = new Uint8Array(4 * 4 * 4096);
  private idx = new Uint32Array(6 * 4096);
  private nv = 0;
  private ni = 0;
  faces = 0;
  area = 0;

  reset(): void {
    this.nv = 0;
    this.ni = 0;
    this.faces = 0;
    this.area = 0;
  }

  private grow(): void {
    const pos = new Float32Array(this.pos.length * 2);
    pos.set(this.pos);
    this.pos = pos;
    const dat = new Uint8Array(this.dat.length * 2);
    dat.set(this.dat);
    this.dat = dat;
    const idx = new Uint32Array(this.idx.length * 2);
    idx.set(this.idx);
    this.idx = idx;
  }

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
    if ((this.nv + 4) * 3 > this.pos.length || this.ni + 6 > this.idx.length) this.grow();
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
    return {
      positions: this.pos.slice(0, this.nv * 3),
      data: this.dat.slice(0, this.nv * 4),
      indices: this.idx.slice(0, this.ni),
      faces: this.faces,
      areaSmall: this.area,
    };
  }
}

function emptyData(): MeshData {
  return { positions: [], uvs: [], colors: [], lights: [], indices: [], faceCount: 0 };
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
  private readonly maskV: Uint8Array;

  constructor(private readonly world: ArrayVoxelWorld) {
    this.grid = new Uint8Array(SS * world.size.y * N);
    this.active = new Uint8Array(C * C * world.size.y);
    this.kinds = new Uint8Array(C * C * world.size.y);
    this.maskV = new Uint8Array(CV * world.size.y * N);
  }

  build(cx: number, cz: number, mode: VoxelMode): VoxelChunkMesh {
    const world = this.world;
    const sy = world.size.y;
    const x0 = cx * C;
    const z0 = cz * C;
    const cross = emptyData();
    const water = emptyData();

    // いちばん高いブロック
    let yTop = -1;
    for (let y = sy - 1; y >= 0 && yTop < 0; y--) {
      for (let z = 0; z < C && yTop < 0; z++) {
        for (let x = 0; x < C; x++) {
          if (world.getIndex(x0 + x, y, z0 + z) > AIR) {
            yTop = y;
            break;
          }
        }
      }
    }
    if (yTop < 0) {
      this.builder.reset();
      return { solid: this.builder.finish(), cross, water };
    }
    const H = (yTop + 1) * N;
    const grid = this.grid;
    grid.fill(0, 0, H * SS);
    this.active.fill(0, 0, C * C * (yTop + 1));
    const scratch = this.scratch;

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

    const b = this.builder;
    b.reset();
    if (mode === 'naive') this.meshNaive(x0, z0, yTop, H);
    else this.meshGreedy(x0, z0, yTop, H, mode === 'greedyShape');
    return { solid: b.finish(), cross, water };
  }

  private meshNaive(x0: number, z0: number, yTop: number, H: number): void {
    const g = this.grid;
    const b = this.builder;
    const inv = 1 / N;
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
                const wx = x0 + lx * inv;
                const wz = z0 + lz * inv;
                const wy = ly * inv;
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

  private meshGreedy(x0: number, z0: number, yTop: number, H: number, shape: boolean): void {
    const g = this.grid;
    const b = this.builder;
    const mask = this.maskV;
    const inv = 1 / N;
    const origin = [x0, 0, z0];
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
                mask[lv * widthU + lu] = shape ? key + 1 : c;
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
            if (shape) b.quad(f, lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], k - 1, 0, 0, w * h);
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
