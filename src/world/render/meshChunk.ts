import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isOpaqueIndex, isTorchIndex, isWildIndex } from '../blocks/blockTypes';
import { BLOCK_TILES, TORCH_PX, tileSubUv, tileUv, type TileName } from '../blocks/textures';
import type { CropStageSource } from '../../contracts';
import { cropKindOfBlock } from '../../contracts';
import { OPACITY } from '../light/opacity';
import type { WorldLight } from '../light/WorldLight';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../VoxelWorld';
import { AO_LEVELS, FACE_SHADE_BY_INDEX } from './config';

/** メッシュの材料（three に依存しない。テストしやすい） */
export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  /** 頂点ごとの [空の光, ブロックの光]（0〜1 = 明るさ / 15）。時刻による空の暗さはシェーダーで毎コマかける */
  lights: number[];
  /** 頂点ごとの 角の暗がり（AO）の暗さ（0 = なし 〜 0.45）。AO は 平らな箱の面にだけ（ブロック単位）。シェーダーが 1 - 暗さ を かける */
  darks: number[];
  indices: number[];
  faceCount: number;
}

export interface ChunkMeshData {
  opaque: MeshData;
  water: MeshData;
}

export function emptyMesh(): MeshData {
  return { positions: [], uvs: [], colors: [], lights: [], darks: [], indices: [], faceCount: 0 };
}

export interface FaceDef {
  /** 面の向きの番号: 0 上, 1 下, 2 +x, 3 -x, 4 +z, 5 -z */
  index: number;
  /** となりのブロックの向き */
  dir: [number, number, number];
  /** 0 = 上, 1 = 下, 2 = 横（タイルの選び方と明るさ） */
  kind: 0 | 1 | 2;
  /** 4 つの角（外から見て反時計回り） */
  verts: [number, number, number][];
}

export const FACES: FaceDef[] = [
  { index: 0, dir: [0, 1, 0], kind: 0, verts: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { index: 1, dir: [0, -1, 0], kind: 1, verts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { index: 2, dir: [1, 0, 0], kind: 2, verts: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { index: 3, dir: [-1, 0, 0], kind: 2, verts: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { index: 4, dir: [0, 0, 1], kind: 2, verts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { index: 5, dir: [0, 0, -1], kind: 2, verts: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const CORNER_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

// ブロックの番号ごとの [上, 下, 横] の UV を先に作っておく
export const TILE_UV: ([number, number, number, number][] | undefined)[] = BLOCK_TYPES.map((t) => {
  const tiles = BLOCK_TILES[t.id];
  return tiles ? tiles.map((n) => tileUv(n)) : undefined;
});

export const LIGHT_MAX = 15;

/**
 * 面の角の光。面の前のマスと、その角のまわりの 3 マス（全部 面と同じ向きの層）のうち、光を通すマスの平均（なめらかな光）。
 * light が無いときは 空 15・ブロック 0（昼と同じ見た目）。
 */
function cornerLight(
  world: ArrayVoxelWorld,
  light: WorldLight | undefined,
  x: number,
  y: number,
  z: number,
  face: FaceDef,
  v: [number, number, number],
  out: [number, number],
): void {
  if (!light) {
    out[0] = 1;
    out[1] = 0;
    return;
  }
  const nx = x + face.dir[0];
  const ny = y + face.dir[1];
  const nz = z + face.dir[2];
  // 面にそった 2 つの軸の、この角が向く側（+1 か -1）
  let ax = 0;
  let ay = 0;
  let az = 0;
  let bx = 0;
  let by = 0;
  let bz = 0;
  if (face.dir[0] !== 0) {
    ay = v[1] ? 1 : -1;
    bz = v[2] ? 1 : -1;
  } else if (face.dir[1] !== 0) {
    ax = v[0] ? 1 : -1;
    bz = v[2] ? 1 : -1;
  } else {
    ax = v[0] ? 1 : -1;
    by = v[1] ? 1 : -1;
  }
  let sky = 0;
  let blk = 0;
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const cx = nx + (k & 1 ? ax : 0) + (k & 2 ? bx : 0);
    const cy = ny + (k & 1 ? ay : 0) + (k & 2 ? by : 0);
    const cz = nz + (k & 1 ? az : 0) + (k & 2 ? bz : 0);
    const t = world.getIndex(cx, cy, cz);
    if (t < 0 || OPACITY[t] >= 15) continue;
    sky += light.skyAt(cx, cy, cz);
    blk += light.blockAt(cx, cy, cz);
    n++;
  }
  if (n === 0) {
    // 前のマスだけは必ず光を通す（面を描くのは前が通すとき）。念のため
    out[0] = 0;
    out[1] = 0;
    return;
  }
  out[0] = sky / n / LIGHT_MAX;
  out[1] = blk / n / LIGHT_MAX;
}

const LIGHT_TMP: [number, number] = [1, 0];

/** 面の角 v が向く 2 つの軸の 向き（+1 か -1）。a = 1 つめの軸、b = 2 つめの軸（cornerLight と同じ） */
function cornerAxes(face: FaceDef, v: readonly number[]): [number, number, number, number, number, number] {
  if (face.dir[0] !== 0) return [0, v[1] ? 1 : -1, 0, 0, 0, v[2] ? 1 : -1];
  if (face.dir[1] !== 0) return [v[0] ? 1 : -1, 0, 0, 0, 0, v[2] ? 1 : -1];
  return [v[0] ? 1 : -1, 0, 0, 0, v[1] ? 1 : -1, 0];
}

/**
 * 平らな箱の面の 4 つの角の AO の段（0〜3。ブロック単位。マイクラと同じ）。となりの ブロック（面の前の層）で見る:
 * 横の 2 つ（s1, s2）が どちらも 不透明なら 3。ほかは s1 + s2 + c。out[i] = 角 i（face.verts の順）。
 */
export function flatAoLevels(world: ArrayVoxelWorld, x: number, y: number, z: number, face: FaceDef, out: number[]): void {
  const fx = x + face.dir[0];
  const fy = y + face.dir[1];
  const fz = z + face.dir[2];
  const solid = (a: number, b: number, c: number): number => {
    const t = world.getIndex(a, b, c);
    return t > 0 && isOpaqueIndex(t) ? 1 : 0;
  };
  for (let i = 0; i < 4; i++) {
    const [ax, ay, az, bx, by, bz] = cornerAxes(face, face.verts[i]);
    const s1 = solid(fx + ax, fy + ay, fz + az);
    const s2 = solid(fx + bx, fy + by, fz + bz);
    const c = solid(fx + ax + bx, fy + ay + by, fz + az + bz);
    out[i] = s1 && s2 ? 3 : s1 + s2 + c;
  }
}

/** 四角の 2 まいの三角形を どの対角線で切るか（暗い角どうしを つなぐ。true = 1-3 の対角線） */
export function flatAoFlip(l: readonly number[]): boolean {
  return l[0] + l[2] > l[1] + l[3];
}

/** 角の値 v[0..3]（CORNER_UV の順）を、三角形の補間で (s, t)（0〜1、s = 絵の u、t = 絵の v（上））に */
export function flatInterp(v: readonly number[], flip: boolean, s: number, t: number): number {
  if (!flip) {
    // 三角形 (0,1,2) と (0,2,3)
    return s >= t ? (1 - s) * v[0] + (s - t) * v[1] + t * v[2] : (1 - t) * v[0] + s * v[2] + (t - s) * v[3];
  }
  // 三角形 (1,2,3) と (1,3,0)
  return s + t >= 1 ? (1 - t) * v[1] + (s + t - 1) * v[2] + (1 - s) * v[3] : s * v[1] + (1 - s - t) * v[0] + t * v[3];
}

export function pushFace(
  mesh: MeshData,
  world: ArrayVoxelWorld,
  light: WorldLight | undefined,
  x: number,
  y: number,
  z: number,
  face: FaceDef,
  uvRect: [number, number, number, number],
  /** true: 角の暗がり（AO）を 頂点に入れる（平らな箱の面） */
  ao = false,
): void {
  const base = mesh.positions.length / 3;
  const b = FACE_SHADE_BY_INDEX[face.index];
  if (ao) flatAoLevels(world, x, y, z, face, AO_TMP);
  for (let i = 0; i < 4; i++) {
    const v = face.verts[i];
    mesh.positions.push(x + v[0], y + v[1], z + v[2]);
    const c = CORNER_UV[i];
    mesh.uvs.push(c[0] === 0 ? uvRect[0] : uvRect[2], c[1] === 0 ? uvRect[1] : uvRect[3]);
    mesh.colors.push(b, b, b);
    cornerLight(world, light, x, y, z, face, v, LIGHT_TMP);
    mesh.lights.push(LIGHT_TMP[0], LIGHT_TMP[1]);
    mesh.darks.push(ao ? 1 - AO_LEVELS[AO_TMP[i]] : 0);
  }
  if (ao && flatAoFlip(AO_TMP)) mesh.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  else mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}
const AO_TMP: number[] = [0, 0, 0, 0];

/**
 * 1 チャンク（横 16x16、高さは世界ぜんぶ）のメッシュの材料を作る。
 * - 色のあるブロック: となりが色のあるブロックなら面を描かない。世界の外へ向く面も描かない。
 * - 水: となりが くうき の面だけ描く（上の面が主）。
 */
/** たいまつの形: 細い箱（はば 2 ドット、高さ 12 ドット）。自分で光るので、ブロックの光は最大 */
const TORCH_BOX = {
  x0: TORCH_PX.x0 / 16,
  x1: TORCH_PX.x1 / 16,
  z0: TORCH_PX.x0 / 16,
  z1: TORCH_PX.x1 / 16,
  y1: (16 - TORCH_PX.y0) / 16,
};

export function pushTorch(mesh: MeshData, x: number, y: number, z: number, tile: TileName, sky: number): void {
  const side = tileSubUv(tile, TORCH_PX.x0, TORCH_PX.y0, TORCH_PX.x1, 16);
  const top = tileSubUv(tile, TORCH_PX.x0, TORCH_PX.y0, TORCH_PX.x1, TORCH_PX.y0 + 1);
  for (const face of FACES) {
    if (face.dir[1] === -1) continue; // 下の面は見えない
    const base = mesh.positions.length / 3;
    const uvRect = face.kind === 0 ? top : side;
    for (let i = 0; i < 4; i++) {
      const v = face.verts[i];
      const px = x + (v[0] ? TORCH_BOX.x1 : TORCH_BOX.x0);
      const py = y + (v[1] ? TORCH_BOX.y1 : 0);
      const pz = z + (v[2] ? TORCH_BOX.z1 : TORCH_BOX.z0);
      mesh.positions.push(px, py, pz);
      const c = CORNER_UV[i];
      mesh.uvs.push(c[0] === 0 ? uvRect[0] : uvRect[2], c[1] === 0 ? uvRect[1] : uvRect[3]);
      // 炎は面の向きで暗くしない
      mesh.colors.push(1, 1, 1);
      mesh.lights.push(sky, 1);
      mesh.darks.push(0);
    }
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    mesh.faceCount++;
  }
}

/** みのった作物の印: ブロックの光の値に足す（シェーダーが 1.5 以上を見て、明るさの下限をかける） */
export const RIPE_FLAG = 2;

/** 十字の板に使う絵の名前（作物は段階で、ほかは id そのまま） */
export function crossTileName(b: number, stage: number): TileName {
  const id = BLOCK_TYPES[b].id;
  const k = cropKindOfBlock(id);
  if (k && !k.wild) return `crop_${k.kind}_${stage}` as TileName;
  return id as TileName;
}

// 十字の板: 2 まいの対角の板。それぞれ表と裏を描く（4 面）
const CROSS_QUADS: [number, number][][] = [
  [[0, 0], [1, 1]],
  [[1, 0], [0, 1]],
];

export function pushCross(mesh: MeshData, x: number, y: number, z: number, tile: TileName, sky: number, blk: number): void {
  const uv = tileUv(tile);
  for (const [a, b] of CROSS_QUADS) {
    for (let side = 0; side < 2; side++) {
      const base = mesh.positions.length / 3;
      // 左下 → 右下 → 右上 → 左上（裏は左右を入れかえる）
      const p0 = side === 0 ? a : b;
      const p1 = side === 0 ? b : a;
      const corners: [number[], number][] = [
        [p0, 0], [p1, 0], [p1, 1], [p0, 1],
      ];
      for (let i = 0; i < 4; i++) {
        const [pt, vy] = corners[i];
        mesh.positions.push(x + pt[0], y + vy, z + pt[1]);
        const c = CORNER_UV[i];
        mesh.uvs.push(c[0] === 0 ? uv[0] : uv[2], c[1] === 0 ? uv[1] : uv[3]);
        mesh.colors.push(1, 1, 1);
        mesh.lights.push(sky, blk);
        mesh.darks.push(0);
      }
      mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      mesh.faceCount++;
    }
  }
}

/**
 * `hide`: true を 返した マス の 十字の板 は 描かない（なでた ゆれ の 間、専用メッシュ で 描くため）。
 */
export function meshChunk(
  world: ArrayVoxelWorld,
  cx: number,
  cz: number,
  light?: WorldLight,
  crops?: CropStageSource,
  hide?: (x: number, y: number, z: number) => boolean,
): ChunkMeshData {
  const opaque = emptyMesh();
  const water = emptyMesh();
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const x1 = x0 + CHUNK_SIZE; // 読みこんでいないマスは getIndex が -1 を返す
  const z1 = z0 + CHUNK_SIZE;
  for (let y = 0; y < world.size.y; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const b = world.getIndex(x, y, z);
        if (b === AIR) continue;
        if (isTorchIndex(b)) {
          pushTorch(opaque, x, y, z, BLOCK_TYPES[b].id as TileName, light ? light.skyAt(x, y, z) / LIGHT_MAX : 1);
          continue;
        }
        if (isCrossIndex(b)) {
          if (hide && hide(x, y, z)) continue;
          const stage = crops?.stageAt(x, y, z) ?? 3;
          const ripe = isWildIndex(b) || (cropKindOfBlock(BLOCK_TYPES[b].id) !== null && stage === 3);
          pushCross(
            opaque, x, y, z, crossTileName(b, stage),
            light ? light.skyAt(x, y, z) / LIGHT_MAX : 1,
            (light ? light.blockAt(x, y, z) / LIGHT_MAX : 0) + (ripe ? RIPE_FLAG : 0),
          );
          continue;
        }
        const uv = TILE_UV[b];
        if (!uv) continue;
        const isWater = b === WATER;
        for (const face of FACES) {
          const n = world.getIndex(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
          if (n < 0) continue; // 世界の外へ向く面は見えない
          if (isWater ? n !== AIR : isOpaqueIndex(n)) continue;
          pushFace(isWater ? water : opaque, world, light, x, y, z, face, uv[face.kind]);
        }
      }
    }
  }
  return { opaque, water };
}

