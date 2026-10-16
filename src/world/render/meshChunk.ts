import { AIR, BLOCK_TYPES, WATER, isCrossIndex, isOpaqueIndex, isTorchIndex, isWildIndex } from '../blocks/blockTypes';
import { BLOCK_TILES, TORCH_PX, tileSubUv, tileUv, type TileName } from '../blocks/textures';
import type { CropStageSource } from '../../contracts';
import { cropKindOfBlock } from '../../contracts';
import { OPACITY } from '../light/opacity';
import type { WorldLight } from '../light/WorldLight';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../VoxelWorld';
import { RENDER_CONFIG } from './config';

/** メッシュの材料（three に依存しない。テストしやすい） */
export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  /** 頂点ごとの [空の光, ブロックの光]（0〜1 = 明るさ / 15）。時刻による空の暗さはシェーダーで毎コマかける */
  lights: number[];
  indices: number[];
  faceCount: number;
}

export interface ChunkMeshData {
  opaque: MeshData;
  water: MeshData;
}

export function emptyMesh(): MeshData {
  return { positions: [], uvs: [], colors: [], lights: [], indices: [], faceCount: 0 };
}

export interface FaceDef {
  /** となりのブロックの向き */
  dir: [number, number, number];
  /** 0 = 上, 1 = 下, 2 = 横（タイルの選び方と明るさ） */
  kind: 0 | 1 | 2;
  /** 4 つの角（外から見て反時計回り） */
  verts: [number, number, number][];
}

export const FACES: FaceDef[] = [
  { dir: [0, 1, 0], kind: 0, verts: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], kind: 1, verts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [1, 0, 0], kind: 2, verts: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], kind: 2, verts: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 0, 1], kind: 2, verts: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], kind: 2, verts: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];
const CORNER_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const BRIGHTNESS = [RENDER_CONFIG.brightnessTop, RENDER_CONFIG.brightnessBottom, RENDER_CONFIG.brightnessSide];

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

export function pushFace(
  mesh: MeshData,
  world: ArrayVoxelWorld,
  light: WorldLight | undefined,
  x: number,
  y: number,
  z: number,
  face: FaceDef,
  uvRect: [number, number, number, number],
): void {
  const base = mesh.positions.length / 3;
  const b = BRIGHTNESS[face.kind];
  for (let i = 0; i < 4; i++) {
    const v = face.verts[i];
    mesh.positions.push(x + v[0], y + v[1], z + v[2]);
    const c = CORNER_UV[i];
    mesh.uvs.push(c[0] === 0 ? uvRect[0] : uvRect[2], c[1] === 0 ? uvRect[1] : uvRect[3]);
    mesh.colors.push(b, b, b);
    cornerLight(world, light, x, y, z, face, v, LIGHT_TMP);
    mesh.lights.push(LIGHT_TMP[0], LIGHT_TMP[1]);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}

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

