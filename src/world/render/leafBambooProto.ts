/**
 * はっぱ・たけの 試し描き（既定の `?leaf` `?bamboo` が 無いときは 何もしない）。
 * - shell: 1 ブロック 1 枚の 外側の 面だけ。となりが 不透明（ほかの はっぱも）なら 面を 省く。alphaTest の ぬき絵。
 * - cross: 草と 同じ 十字の 板（8 三角形）。並べかえは しない（不透明の alphaTest）。
 * - voxel: 稈を 3 小ブロック幅、節の 輪、てっぺんに 小さな 葉。遠くの 箱の 段は 細い 柱。
 * - sprite: 2/9 幅の 柱＋節＋上 3 マスに 葉の 板。近くも 遠くも 同じ。
 * 当たり判定は 変えない（見た目だけ）。
 */

import { BLOCK_INDEX, BLOCK_TYPES, isLeafIndex, isOpaqueIndex } from '../blocks/blockTypes';
import { tileSubUv, type TileName } from '../blocks/textures';
import type { WorldLight } from '../light/WorldLight';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { BAMBOO_LEAF_PX, BAMBOO_STALK_PX } from './leafBambooArt';
import { bambooMode, leafMode, type BambooMode } from './leafBambooMode';
import { FACE_SHADE_BY_INDEX } from './config';
import { FACES, LIGHT_MAX, TILE_UV, pushCross, pushFace, type MeshData } from './meshChunk';

const N = 9;

export function skipBoxProto(kind: number): boolean {
  if (kind === BLOCK_INDEX.bamboo) return bambooMode() !== 'current';
  if (isLeafIndex(kind)) return leafMode() !== 'current';
  return false;
}

function lightAt(light: WorldLight | undefined, x: number, y: number, z: number): [number, number] {
  if (!light) return [1, 0];
  // たけは 光を 通さないので、マスの 中は 暗い。まわりの 空気の 明るさを 使う
  let sky = 0;
  let blk = 0;
  for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] as const) {
    sky = Math.max(sky, light.skyAt(x + dx, y + dy, z + dz));
    blk = Math.max(blk, light.blockAt(x + dx, y + dy, z + dz));
  }
  return [sky / LIGHT_MAX, blk / LIGHT_MAX];
}

const CORNER: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

function pushQuad(mesh: MeshData, p: readonly (readonly [number, number, number])[], uv: readonly [number, number, number, number], shade: number, sky: number, blk: number): void {
  const base = mesh.positions.length / 3;
  for (let i = 0; i < 4; i++) {
    const c = CORNER[i]!;
    mesh.positions.push(p[i]![0], p[i]![1], p[i]![2]);
    mesh.uvs.push(c[0] === 0 ? uv[0] : uv[2], c[1] === 0 ? uv[1] : uv[3]);
    mesh.colors.push(shade, shade, shade);
    mesh.lights.push(sky, blk);
    mesh.darks.push(0);
  }
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  mesh.faceCount++;
}

/** 外から見て 反時計回りの 箱。上下は となりが 不透明なら 省く（草の 上面と 重ならない） */
function pushInsetBox(
  mesh: MeshData,
  world: ArrayVoxelWorld,
  x: number,
  y: number,
  z: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  uv: readonly [number, number, number, number],
  sky: number,
  blk: number,
): void {
  const above = world.getIndex(x, y + 1, z);
  const below = world.getIndex(x, y - 1, z);
  const drawTop = !(above >= 0 && isOpaqueIndex(above));
  const drawBot = !(below >= 0 && isOpaqueIndex(below));
  if (drawTop) pushQuad(mesh, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uv, FACE_SHADE_BY_INDEX[0]!, sky, blk);
  if (drawBot) pushQuad(mesh, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], uv, FACE_SHADE_BY_INDEX[1]!, sky, blk);
  pushQuad(mesh, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], uv, FACE_SHADE_BY_INDEX[2]!, sky, blk);
  pushQuad(mesh, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], uv, FACE_SHADE_BY_INDEX[3]!, sky, blk);
  pushQuad(mesh, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], uv, FACE_SHADE_BY_INDEX[4]!, sky, blk);
  pushQuad(mesh, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], uv, FACE_SHADE_BY_INDEX[5]!, sky, blk);
}

function pushLeafTuft(mesh: MeshData, x: number, y: number, z: number, kind: 0 | 1 | 2, uv: readonly [number, number, number, number], sky: number, blk: number): void {
  const y0 = y + (kind === 0 ? 0.35 : kind === 1 ? 0.55 : 0.72);
  const y1 = y + 1;
  const a = kind === 2 ? 0.28 : 0.16;
  const b = 1 - a;
  const quads: (readonly [number, number, number])[][] = [
    [[x + a, y0, z + a], [x + b, y0, z + b], [x + b, y1, z + b], [x + a, y1, z + a]],
    [[x + b, y0, z + a], [x + a, y0, z + b], [x + a, y1, z + b], [x + b, y1, z + a]],
  ];
  for (const q of quads) {
    pushQuad(mesh, q, uv, 1, sky, blk);
    pushQuad(mesh, [q[1]!, q[0]!, q[3]!, q[2]!], uv, 1, sky, blk);
  }
}

function bambooAbove(world: ArrayVoxelWorld, x: number, y: number, z: number, n: number): boolean {
  for (let i = 1; i <= n; i++) if (world.getIndex(x, y + i, z) !== BLOCK_INDEX.bamboo) return false;
  return true;
}

function emitBambooPrism(mesh: MeshData, world: ArrayVoxelWorld, light: WorldLight | undefined, x: number, y: number, z: number, wide: 2 | 3): void {
  const [sky, blk] = lightAt(light, x, y, z);
  const stalkUv = tileSubUv('bamboo', BAMBOO_STALK_PX.x0, BAMBOO_STALK_PX.y0, BAMBOO_STALK_PX.x1, BAMBOO_STALK_PX.y1);
  const leafUv = tileSubUv('bamboo', BAMBOO_LEAF_PX.x0, BAMBOO_LEAF_PX.y0, BAMBOO_LEAF_PX.x1, BAMBOO_LEAF_PX.y1);
  const w = wide / N;
  const inset = (1 - w) / 2;
  pushInsetBox(mesh, world, x, y, z, x + inset, y, z + inset, x + 1 - inset, y + 1, z + 1 - inset, stalkUv, sky, blk);
  const nw = (wide + 2) / N;
  const ni = (1 - nw) / 2;
  const band = 1.2 / N;
  for (const yb of [0, 4 / N]) {
    pushInsetBox(mesh, world, x, y, z, x + ni, y + yb, z + ni, x + 1 - ni, y + yb + band, z + 1 - ni, stalkUv, sky, blk);
  }
  // 上から 3 マスだけ 葉（てっぺんが 大きい）。マイクラの「上に 葉」という 特ちょうだけ
  let crown: 0 | 1 | 2 | null = null;
  if (!bambooAbove(world, x, y, z, 1)) crown = 0;
  else if (!bambooAbove(world, x, y, z, 2)) crown = 1;
  else if (!bambooAbove(world, x, y, z, 3)) crown = 2;
  if (crown !== null) pushLeafTuft(mesh, x, y, z, crown, leafUv, sky, blk);
}

function emitLeafShell(mesh: MeshData, world: ArrayVoxelWorld, light: WorldLight | undefined, x: number, y: number, z: number, b: number, micro: boolean): void {
  const uv = TILE_UV[b];
  if (!uv) return;
  for (const face of FACES) {
    const n = world.getIndex(x + face.dir[0], y + face.dir[1], z + face.dir[2]);
    if (n >= 0 && isOpaqueIndex(n)) continue;
    pushFace(mesh, world, light, x, y, z, face, uv[face.kind]!, micro);
  }
}

/**
 * この マスを 試しの 描き方で 描いたら true（ふつうの 小ブロック／箱には 渡さない）。
 * micro = 小ブロックの 段（sectionMesher が 角の 暗がりと同じ フラグで 渡す）。
 */
export function emitProtoPlant(
  mesh: MeshData,
  world: ArrayVoxelWorld,
  x: number,
  y: number,
  z: number,
  b: number,
  light: WorldLight | undefined,
  micro: boolean,
): boolean {
  if (isLeafIndex(b)) {
    const mode = leafMode();
    if (mode === 'current') return false;
    if (mode === 'none') return true;
    if (mode === 'cross') {
      const [sky, blk] = lightAt(light, x, y, z);
      pushCross(mesh, x, y, z, BLOCK_TYPES[b]!.id as TileName, sky, blk);
      return true;
    }
    emitLeafShell(mesh, world, light, x, y, z, b, micro);
    return true;
  }
  if (b !== BLOCK_INDEX.bamboo) return false;
  const mode: BambooMode = bambooMode();
  if (mode === 'current') return false;
  if (mode === 'voxel' && micro) return false;
  emitBambooPrism(mesh, world, light, x, y, z, mode === 'voxel' ? 3 : 2);
  return true;
}
