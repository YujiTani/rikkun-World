import { AIR, BLOCK_TYPES, WATER, isOpaqueIndex } from '../blocks/blockTypes';
import { BLOCK_TILES, tileUv } from '../blocks/textures';
import { CHUNK_SIZE, type ArrayVoxelWorld } from '../VoxelWorld';
import { RENDER_CONFIG } from './config';

/** メッシュの材料（three に依存しない。テストしやすい） */
export interface MeshData {
  positions: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
  faceCount: number;
}

export interface ChunkMeshData {
  opaque: MeshData;
  water: MeshData;
}

function emptyMesh(): MeshData {
  return { positions: [], uvs: [], colors: [], indices: [], faceCount: 0 };
}

interface FaceDef {
  /** となりのブロックの向き */
  dir: [number, number, number];
  /** 0 = 上, 1 = 下, 2 = 横（タイルの選び方と明るさ） */
  kind: 0 | 1 | 2;
  /** 4 つの角（外から見て反時計回り） */
  verts: [number, number, number][];
}

const FACES: FaceDef[] = [
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
const TILE_UV: ([number, number, number, number][] | undefined)[] = BLOCK_TYPES.map((t) => {
  const tiles = BLOCK_TILES[t.id];
  return tiles ? tiles.map((n) => tileUv(n)) : undefined;
});

function pushFace(mesh: MeshData, x: number, y: number, z: number, face: FaceDef, uvRect: [number, number, number, number]): void {
  const base = mesh.positions.length / 3;
  const b = BRIGHTNESS[face.kind];
  for (let i = 0; i < 4; i++) {
    const v = face.verts[i];
    mesh.positions.push(x + v[0], y + v[1], z + v[2]);
    const c = CORNER_UV[i];
    mesh.uvs.push(c[0] === 0 ? uvRect[0] : uvRect[2], c[1] === 0 ? uvRect[1] : uvRect[3]);
    mesh.colors.push(b, b, b);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}

/**
 * 1 チャンク（横 16x16、高さは世界ぜんぶ）のメッシュの材料を作る。
 * - 色のあるブロック: となりが色のあるブロックなら面を描かない。世界の外へ向く面も描かない。
 * - 水: となりが くうき の面だけ描く（上の面が主）。
 */
export function meshChunk(world: ArrayVoxelWorld, cx: number, cz: number): ChunkMeshData {
  const opaque = emptyMesh();
  const water = emptyMesh();
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  const x1 = Math.min(x0 + CHUNK_SIZE, world.size.x);
  const z1 = Math.min(z0 + CHUNK_SIZE, world.size.z);
  for (let y = 0; y < world.size.y; y++) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const b = world.getIndex(x, y, z);
        if (b === AIR) continue;
        const uv = TILE_UV[b];
        if (!uv) continue;
        const isWater = b === WATER;
        for (const face of FACES) {
          const n = world.getIndex(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
          if (n < 0) continue; // 世界の外へ向く面は見えない
          if (isWater ? n !== AIR : isOpaqueIndex(n)) continue;
          pushFace(isWater ? water : opaque, x, y, z, face, uv[face.kind]);
        }
      }
    }
  }
  return { opaque, water };
}

