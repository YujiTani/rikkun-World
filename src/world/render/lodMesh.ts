import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isPropIndex, isTorchIndex } from '../blocks/blockTypes';
import { BLOCK_TILES } from '../blocks/textures';
import type { WorldLight } from '../light/WorldLight';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../VoxelWorld';
import { FACE_SHADE_BY_INDEX } from './config';
import { emptyMesh, type MeshData } from './meshChunk';
import { tileAverage } from './voxel/projection';

/**
 * 遠いチャンク用の かんたんメッシュ（LOD）。
 * - 見えるのは「上の面」と「となりの列より高い所の横の面」だけ。
 * - テクスチャなし。ブロックごとの平均の色（頂点の色）。
 * - 同じ高さ・同じ色・同じ光の面は 1 まいにまとめる（greedy meshing）。
 * - 光は近くのメッシュと同じ aLight（空の光・ブロックの光）。時刻の暗さはシェーダーが毎コマかける。
 * - 水は 水面 1 まい（半透明）。水の下の地面もふつうに描く。
 */

export interface LodChunkMeshData {
  opaque: MeshData;
  water: MeshData;
}

const LIGHT_MAX = 15;
/** 面の明るさ（config.ts の FACE_SHADE_BY_INDEX）: 上 / 東西（±x） / 南北（±z） */
const SHADE_TOP = FACE_SHADE_BY_INDEX[0];
const SHADE_EW = FACE_SHADE_BY_INDEX[2];
const SHADE_NS = FACE_SHADE_BY_INDEX[4];
const C = CHUNK_SIZE;

type Rgb = [number, number, number];
let AVG: { top: Rgb[]; side: Rgb[]; water: Rgb } | null = null;

function averages(): { top: Rgb[]; side: Rgb[]; water: Rgb } {
  if (!AVG) {
    const top: Rgb[] = [];
    const side: Rgb[] = [];
    BLOCK_TYPES.forEach((t, i) => {
      const tiles = BLOCK_TILES[t.id];
      top[i] = tiles ? tileAverage(tiles[0]) : [1, 0, 1];
      side[i] = tiles ? tileAverage(tiles[2]) : [1, 0, 1];
    });
    AVG = { top, side, water: tileAverage('water') };
  }
  return AVG;
}

// 4 つの横向き。dx,dz = となりの向き（頂点の並びは meshChunk と同じ）
const SIDES = [
  { dx: 1, dz: 0, verts: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dx: -1, dz: 0, verts: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dx: 0, dz: 1, verts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dx: 0, dz: -1, verts: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
] as const;
const TOP_VERTS = [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] as const;

function pushQuad(
  mesh: MeshData,
  verts: readonly (readonly number[])[],
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  rgb: readonly number[],
  b: number,
  sky: number,
  blk: number,
): void {
  const base = mesh.positions.length / 3;
  for (const v of verts) {
    mesh.positions.push(v[0] ? x1 : x0, v[1] ? y1 : y0, v[2] ? z1 : z0);
    mesh.colors.push(rgb[0] * b, rgb[1] * b, rgb[2] * b);
    mesh.lights.push(sky / LIGHT_MAX, blk / LIGHT_MAX);
    mesh.darks.push(0);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}

interface Col {
  /** いちばん上の色つきブロックの y（無ければ -1。世界の外は -2） */
  gy: number;
  /** そのブロックの番号 */
  gb: number;
  /** 水面のブロックの y（地面より上に水があるとき。無ければ -1） */
  wy: number;
}

const OUTSIDE: Col = { gy: -2, gb: AIR, wy: -1 };

function scanColumn(world: ArrayVoxelWorld, x: number, z: number): Col {
  let wy = -1;
  for (let y = Math.max(world.topY(x, z), -1); y >= 0; y--) {
    const b = world.getIndex(x, y, z);
    if (b === AIR || isTorchIndex(b) || isCrossIndex(b) || isPropIndex(b)) continue;
    if (b === WATER) {
      if (wy < 0) wy = y;
      continue;
    }
    return { gy: y, gb: b, wy };
  }
  return { gy: -1, gb: AIR, wy };
}

/** 同じ値の四角をまとめる（keys: C×C。-1 は何もなし） */
function greedy(keys: Int32Array, emit: (x: number, z: number, w: number, d: number, key: number) => void): void {
  const used = new Uint8Array(C * C);
  for (let z = 0; z < C; z++) {
    for (let x = 0; x < C; x++) {
      const i = z * C + x;
      const k = keys[i];
      if (k < 0 || used[i]) continue;
      let w = 1;
      while (x + w < C && keys[i + w] === k && !used[i + w]) w++;
      let d = 1;
      outer: while (z + d < C) {
        for (let xx = 0; xx < w; xx++) {
          const j = (z + d) * C + x + xx;
          if (keys[j] !== k || used[j]) break outer;
        }
        d++;
      }
      for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) used[(z + dz) * C + x + dx] = 1;
      emit(x, z, w, d, k);
    }
  }
}

/** key に 高さ・ブロック・空の光・ブロックの光 を詰める */
const pack = (y: number, b: number, s: number, l: number): number => ((y * 32 + b) * 16 + s) * 16 + l;
const unpack = (k: number): { y: number; b: number; s: number; l: number } => ({
  l: k & 15,
  s: (k >> 4) & 15,
  b: (k >> 8) & 31,
  y: k >> 13,
});

export function meshChunkLod(world: ArrayVoxelWorld, cx: number, cz: number, light?: WorldLight): LodChunkMeshData {
  const opaque = emptyMesh();
  const water = emptyMesh();
  const avg = averages();
  const x0 = cx * C;
  const z0 = cz * C;

  // まわり 1 列ぶんをふくめた列の情報
  const W = C + 2;
  const cols: Col[] = new Array<Col>(W * W);
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) {
      const x = x0 + i - 1;
      const z = z0 + j - 1;
      cols[j * W + i] = world.isLoaded(x, z) ? scanColumn(world, x, z) : OUTSIDE;
    }
  }
  const at = (i: number, j: number): Col => cols[(j + 1) * W + (i + 1)];

  const sky = (x: number, y: number, z: number): number => (light ? light.skyAt(x, y, z) : LIGHT_MAX);
  const blk = (x: number, y: number, z: number): number => (light ? light.blockAt(x, y, z) : 0);

  const topKeys = new Int32Array(C * C).fill(-1);
  const waterKeys = new Int32Array(C * C).fill(-1);
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < C; i++) {
      const col = at(i, j);
      const x = x0 + i;
      const z = z0 + j;
      if (col.gy >= 0) {
        topKeys[j * C + i] = pack(col.gy, col.gb, sky(x, col.gy + 1, z), blk(x, col.gy + 1, z));
      }
      if (col.wy >= 0) {
        waterKeys[j * C + i] = pack(col.wy, WATER, sky(x, col.wy + 1, z), blk(x, col.wy + 1, z));
      }
    }
  }

  greedy(topKeys, (x, z, w, d, k) => {
    const t = unpack(k);
    pushQuad(opaque, TOP_VERTS, x0 + x, x0 + x + w, t.y + 1, t.y + 1, z0 + z, z0 + z + d, avg.top[t.b], SHADE_TOP, t.s, t.l);
  });
  greedy(waterKeys, (x, z, w, d, k) => {
    const t = unpack(k);
    pushQuad(water, TOP_VERTS, x0 + x, x0 + x + w, t.y + 1, t.y + 1, z0 + z, z0 + z + d, avg.water, SHADE_TOP, t.s, t.l);
  });

  // 横の面: となりの列より高い所だけ。縁にそって同じものを 1 まいにまとめる
  for (const side of SIDES) {
    const alongX = side.dx === 0;
    for (let a = 0; a < C; a++) {
      let runStart = 0;
      let runKey = -1;
      let top = 0;
      let bottom = 0;
      let rb = 0;
      let rs = 0;
      let rl = 0;
      const flush = (end: number): void => {
        if (runKey < 0) return;
        const base = alongX ? z0 : x0;
        const plane = base + a + (side.dx > 0 || side.dz > 0 ? 1 : 0);
        const lo = (alongX ? x0 : z0) + runStart;
        const hi = (alongX ? x0 : z0) + end;
        if (alongX) {
          pushQuad(opaque, side.verts, lo, hi, bottom, top, plane, plane, avg.side[rb], SHADE_NS, rs, rl);
        } else {
          pushQuad(opaque, side.verts, plane, plane, bottom, top, lo, hi, avg.side[rb], SHADE_EW, rs, rl);
        }
      };
      for (let m = 0; m <= C; m++) {
        let key = -1;
        let nTop = 0;
        let nBottom = 0;
        let nb = 0;
        let ns = 0;
        let nl = 0;
        if (m < C) {
          const i = alongX ? m : a;
          const j = alongX ? a : m;
          const col = at(i, j);
          const nc = at(i + side.dx, j + side.dz);
          if (col.gy >= 0 && nc.gy !== -2 && nc.gy < col.gy) {
            const x = x0 + i + side.dx;
            const z = z0 + j + side.dz;
            nTop = col.gy + 1;
            nBottom = nc.gy + 1;
            nb = col.gb;
            ns = sky(x, col.gy, z);
            nl = blk(x, col.gy, z);
            key = pack(nTop * 64 + nBottom, nb, ns, nl);
          }
        }
        if (key !== runKey) {
          flush(m);
          runKey = key;
          runStart = m;
          top = nTop;
          bottom = nBottom;
          rb = nb;
          rs = ns;
          rl = nl;
        }
      }
    }
  }
  return { opaque, water };
}
