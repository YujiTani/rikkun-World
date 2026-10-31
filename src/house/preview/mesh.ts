// HOUSE-1B 試作: 見本（そと ＝ 屋根つき、なか ＝ 屋根なし）の 形を 面で 作る。ゲームの 区の メッシュと 同じ 材料（MeshData）。
// 座標: 中の 床の 左上（うしろ・ひだり）が x=0・z=0、まえ ＝ +z、みぎ ＝ +x。床の 上の 面が y=1（地面と 同じ 高さ）。
//   かべ ＝ y 1〜3 の 外まわり 1 周、やね ＝ y=4（上の 面 y=5）。窓 ＝ y=2 の かべ、戸 ＝ 戸の 壁の まん中の y=1〜2。段の 数は tuning.ts の HEIGHT。
import { pushProp, FACES, emptyMesh, type FaceDef, type MeshData } from '../../world/render/meshChunk';
import { pushKotatsuCell } from '../../world/render/kotatsuMesh';
import { KOTATSU_CELLS } from '../../world/blocks/kotatsu';
import { FACE_SHADE_BY_INDEX } from '../../world/render/config';
import type { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { tileUv, type TileName } from '../../world/blocks/textures';
import type { BoxKind } from '../../world/blocks/furnitureArt';
import { furnitureQuads } from '../../world/blocks/furnitureQuads';
import type { FurnRot } from '../../world/blocks/houseBlocks';
import { doorIndex, footprint, plainFurniture, windowCells, type EditorState, type Placed } from '../editor/model';
import { K_FUTON, K_KOTATSU } from '../editor/furniture';
import { DOOR_TOP_Y, DOOR_WALL, HEIGHT, ROOF_Y, WALLS, WINDOW_Y, type Wall } from '../editor/tuning';
import { OPENING, PREVIEW } from './tuning';

export type PreviewMode = 'outside' | 'inside';

export interface PreviewParts {
  /** 地面・ゆか・家具・ちょうちん（いつも 出す） */
  base: MeshData;
  /** かべ 4 まい（なかの 見本では カメラ に 近い かべを かくす ため 分けて 作る） */
  walls: Record<Wall, MeshData>;
  /** 平らな やね（そとの 見本だけ） */
  roof: MeshData;
  /** 家の 大きさ（中の 床の よこ・たて） */
  w: number;
  d: number;
}

const CORNER_UV: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** 1 ブロックの 面 1 まいを 足す（光は 昼と 同じ ＝ 空 1・ブロック 0。明るさは 面の 向き）。shift ＝ 面を ずらす 量（うすい 板を ブロックの 中に 置く ため） */
function pushFaceAt(
  m: MeshData, x: number, y: number, z: number, face: FaceDef, tile: TileName, shade = FACE_SHADE_BY_INDEX[face.index]!,
  shift: readonly [number, number, number] = [0, 0, 0],
): void {
  const r = tileUv(tile);
  const base = m.positions.length / 3;
  for (let i = 0; i < 4; i++) {
    const v = face.verts[i]!;
    const c = CORNER_UV[i]!;
    m.positions.push(x + v[0] + shift[0], y + v[1] + shift[1], z + v[2] + shift[2]);
    m.uvs.push(c[0] === 0 ? r[0] : r[2], c[1] === 0 ? r[1] : r[3]);
    m.colors.push(shade, shade, shade);
    m.lights.push(1, 0);
    m.darks.push(0);
  }
  m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  m.faceCount++;
}

/** ゲームの helper（pushProp・pushKotatsuCell）が 作った 面を そのまま 足す */
function appendMain(dst: MeshData, src: MeshData): void {
  const base = dst.positions.length / 3;
  dst.positions.push(...src.positions);
  for (let i = 0; i < src.uvs.length; i += 2) dst.uvs.push(src.uvs[i]!, src.uvs[i + 1]!);
  dst.colors.push(...src.colors);
  dst.lights.push(...src.lights);
  dst.darks.push(...src.darks);
  for (const i of src.indices) dst.indices.push(base + i);
  dst.faceCount += src.faceCount;
}

// ------------------------------------------------------------ 地面・ゆか

function buildBase(s: EditorState, w: number, d: number, mode: PreviewMode): MeshData {
  const m = emptyMesh();
  const M = PREVIEW.groundMargin[mode];
  const x0 = -1 - M;
  const x1 = w + M; // ふくむ
  const z0 = -1 - M;
  const z1 = d + M;
  const inFoot = (x: number, z: number): boolean => x >= -1 && x <= w && z >= -1 && z <= d;
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const foot = inFoot(x, z);
      const inside = x >= 0 && x < w && z >= 0 && z < d;
      // 上の 面 ＝ 地面（家の 外）。家の 中・かべの 下は ゆか（なかの 見本の ときだけ。かべを かくした 側の 土台に なる）
      if (!foot) pushFaceAt(m, x, 0, z, FACES[0]!, 'grass_top');
      else if (mode === 'inside' || !inside) pushFaceAt(m, x, 0, z, FACES[0]!, 'house_floor');
      // 板の ふち（外がわの 2 段: 草 ＋ 土）
      const edge: Array<[number, FaceDef]> = [];
      if (x === x0) edge.push([x, FACES[3]!]);
      if (x === x1) edge.push([x, FACES[2]!]);
      if (z === z0) edge.push([z, FACES[5]!]);
      if (z === z1) edge.push([z, FACES[4]!]);
      for (const [, face] of edge) {
        pushFaceAt(m, x, 0, z, face, 'grass_side');
        pushFaceAt(m, x, -1, z, face, 'dirt');
      }
    }
  }
  if (mode === 'inside') {
    for (const p of plainFurniture(s)) pushFurniture(m, p); // 赤い 家具は 見本に 出さない（建つ 形 だけ。1E）
    // 天井の まん中の ちょうちん（1 つ。はずせない）
    const tmp = emptyMesh();
    pushProp(tmp, (w - 1) / 2, ROOF_Y - 1, (d - 1) / 2, 'lantern', 1, 1);
    appendMain(m, tmp);
  }
  return m;
}

// ------------------------------------------------------------ かべ・やね

interface WallCell {
  wall: Wall;
  x: number;
  z: number;
  /** その かべの 中での 場所（0 から。窓・戸の 判定用。かどの 柱は −1 と 長さ） */
  i: number;
}

/** かべ 1 まいの マス（まえ・うしろは かども ふくむ。ひだり・みぎは かどを のぞく） */
function ringCells(wall: Wall, w: number, d: number): WallCell[] {
  const out: WallCell[] = [];
  if (wall === 'front' || wall === 'back') {
    const z = wall === 'front' ? d : -1;
    for (let x = -1; x <= w; x++) out.push({ wall, x, z, i: x });
  } else {
    const x = wall === 'right' ? w : -1;
    for (let z = 0; z < d; z++) out.push({ wall, x, z, i: z });
  }
  return out;
}

/** (x, z) が どの かべの マスか（かべの マスで なければ null） */
function ringWall(x: number, z: number, w: number, d: number): Wall | null {
  if (x < -1 || x > w || z < -1 || z > d) return null;
  if (z === d) return 'front';
  if (z === -1) return 'back';
  if (x === -1) return 'left';
  if (x === w) return 'right';
  return null;
}
const isInside = (x: number, z: number, w: number, d: number): boolean => x >= 0 && x < w && z >= 0 && z < d;

/** かべの 外向きの 向き（x, z） */
const OUT_DIR: Readonly<Record<Wall, readonly [number, number]>> = { front: [0, 1], right: [1, 0], back: [0, -1], left: [-1, 0] };
type OpenKind = 'door' | 'window';

/** 窓・戸の あなの 場所を 答える 関数（wall の i 番めの 段 level が あなか）。しょうじ・戸は かべの 箱では なく うすい 板で 作る（案 C しあげ） */
function openingAt(s: EditorState): (wall: Wall, i: number, level: number) => OpenKind | null {
  const wins: Record<Wall, Set<number>> = { front: new Set(), right: new Set(), back: new Set(), left: new Set() };
  for (const c of windowCells(s)) wins[c.wall].add(c.i);
  const doorI = doorIndex(s);
  return (wall, i, level) => (wall === DOOR_WALL && i === doorI && level <= DOOR_TOP_Y ? 'door' : level === WINDOW_Y && wins[wall].has(i) ? 'window' : null);
}

/**
 * うすい 板の 面 1 まい。side ＝ 外向き（out）か 内向き（in）。t ＝ ブロックの 外がわの 面から 板の 面までの きょり（1 ＝ ブロック 1 つ ぶん）。
 * 面の もとの 場所は out ＝ 外がわの 面・in ＝ 内がわの 面 なので、out は −t、in は 1−t だけ 外向きに ずらす。
 */
function pushPlate(m: MeshData, c: WallCell, level: number, side: 'out' | 'in', t: number, tile: TileName): void {
  const [ox, oz] = OUT_DIR[c.wall];
  const sign = side === 'out' ? 1 : -1;
  const face = FACES.find((f) => f.dir[0] === ox * sign && f.dir[1] === 0 && f.dir[2] === oz * sign)!;
  const k = side === 'out' ? -t : 1 - t;
  pushFaceAt(m, c.x, level, c.z, face, tile, undefined, [ox * k, 0, oz * k]);
}

/** 戸（外がわの 面に そろえた あつい 板）・しょうじ（あつみの まん中の 紙の 板）。そとの 見本では 外がわの 面だけ 出す */
function pushOpening(m: MeshData, c: WallCell, level: number, kind: OpenKind, mode: PreviewMode): void {
  if (kind === 'door') {
    const tile: TileName = level === HEIGHT.floor ? 'house_door_lo' : 'house_door_hi';
    pushPlate(m, c, level, 'out', 0, tile);
    if (mode === 'inside') pushPlate(m, c, level, 'in', OPENING.doorThick, tile);
    return;
  }
  pushPlate(m, c, level, 'out', OPENING.shojiAt - OPENING.shojiThick / 2, 'house_shoji');
  if (mode === 'inside') pushPlate(m, c, level, 'in', OPENING.shojiAt + OPENING.shojiThick / 2, 'house_shoji');
}

function buildWall(s: EditorState, wall: Wall, w: number, d: number, mode: PreviewMode): MeshData {
  const m = emptyMesh();
  const open = openingAt(s);
  const indexOf = (wl: Wall, x: number, z: number): number => (wl === 'front' || wl === 'back' ? x : z);
  for (const c of ringCells(wall, w, d)) {
    for (let level = HEIGHT.floor; level < ROOF_Y; level++) {
      const kind = open(wall, c.i, level);
      if (kind) {
        pushOpening(m, c, level, kind, mode);
        continue;
      }
      for (const face of FACES) {
        if (face.index === 1) continue; // 下は 見えない
        if (face.index === 0) {
          if (level === ROOF_Y - 1 && mode === 'inside') pushFaceAt(m, c.x, level, c.z, face, 'house_wall_top'); // やねを はずした へり（木の はり）
          else if (level < ROOF_Y - 1 && open(wall, c.i, level + 1) === 'window') pushFaceAt(m, c.x, level, c.z, face, 'house_wall'); // 窓の 下の でっぱり
          continue;
        }
        const nx = c.x + face.dir[0];
        const nz = c.z + face.dir[2];
        const next = ringWall(nx, nz, w, d);
        // となりが 窓・戸の あな ならば 切り口（あなの よこの 面）を 出す（へこみが 見える）
        const toHole = next !== null && open(next, indexOf(next, nx, nz), level) !== null;
        if (!toHole) {
          if (next === wall) continue; // 同じ かべの となり ＝ かくれる
          // べつの かべの となり: そとの 見本では かくれる。なかの 見本では その かべが さがる ことが あるので 切り口を 出す
          if (next !== null && mode === 'outside') continue;
          if (isInside(nx, nz, w, d) && mode === 'outside') continue; // 中がわは そとの 見本では 見えない
        }
        pushFaceAt(m, c.x, level, c.z, face, 'house_wall');
      }
    }
  }
  return m;
}

function buildRoof(w: number, d: number): MeshData {
  const m = emptyMesh();
  for (let z = -1; z <= d; z++) {
    for (let x = -1; x <= w; x++) {
      pushFaceAt(m, x, ROOF_Y, z, FACES[0]!, 'house_roof_top');
      for (const face of FACES) {
        if (face.index <= 1) continue;
        if (x + face.dir[0] >= -1 && x + face.dir[0] <= w && z + face.dir[2] >= -1 && z + face.dir[2] <= d) continue;
        pushFaceAt(m, x, ROOF_Y, z, face, 'house_roof_side');
      }
    }
  }
  return m;
}

// ------------------------------------------------------------ 家具

/** 箱で 作る 家具 1 つ。前（−z）が まえ（+z）を 向く のが 向き 0。みぎに まわすと 時計まわり（面の 計算は ゲームの 世界と 同じ world/blocks/furnitureQuads.ts） */
function pushBoxFurniture(m: MeshData, kind: BoxKind, rot: number, ox: number, oy: number, oz: number): void {
  for (const q of furnitureQuads(kind, rot as FurnRot)) {
    const r = tileUv(q.tile as TileName);
    const shade = q.glow ? 1 : FACE_SHADE_BY_INDEX[q.face]!;
    const base = m.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      m.positions.push(ox + q.pos[i * 3]!, oy + q.pos[i * 3 + 1]!, oz + q.pos[i * 3 + 2]!);
      m.uvs.push(r[0] + q.uv[i * 2]! * (r[2] - r[0]), r[1] + q.uv[i * 2 + 1]! * (r[3] - r[1]));
      m.colors.push(shade, shade, shade);
      m.lights.push(1, 0);
      m.darks.push(0);
    }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    m.faceCount++;
  }
}

/** ふとん: 向きごとの（頭の マス → 足の マス）の ずれと、ゲームの ブロックの 名前 */
const FUTON_BY_ROT = [
  { head: [0, 0], foot: [0, 1], headId: 'futon_s', footId: 'futon_foot_s' },
  { head: [1, 0], foot: [0, 0], headId: 'futon_w', footId: 'futon_foot_w' },
  { head: [0, 1], foot: [0, 0], headId: 'futon_n', footId: 'futon_foot_n' },
  { head: [0, 0], foot: [1, 0], headId: 'futon', footId: 'futon_foot_e' },
] as const;

function pushFurniture(m: MeshData, p: Placed): void {
  const tmp = emptyMesh();
  if (p.kind === K_KOTATSU) {
    const fake = {
      size: { y: 64 },
      getBlock: (bx: number, by: number, bz: number): string => {
        const c = KOTATSU_CELLS.find((k) => by === 1 && bx === p.x + k.dx && bz === p.z + k.dz);
        return c ? c.block : 'air';
      },
    } as unknown as ArrayVoxelWorld;
    for (const c of KOTATSU_CELLS) pushKotatsuCell(tmp, fake, undefined, p.x + c.dx, 1, p.z + c.dz, c.block);
    appendMain(m, tmp);
  } else if (p.kind === K_FUTON) {
    const f = FUTON_BY_ROT[p.rot];
    pushProp(tmp, p.x + f.head[0], 1, p.z + f.head[1], f.headId, 1, 0);
    pushProp(tmp, p.x + f.foot[0], 1, p.z + f.foot[1], f.footId, 1, 0);
    appendMain(m, tmp);
  } else {
    pushBoxFurniture(m, p.kind, p.rot, p.x, 1, p.z);
  }
}

/** 家具 1 つだけの 形（アイコン用。左上の マスが 原点） */
export function furnitureOnly(kind: Placed['kind'], rot: Placed['rot']): { mesh: MeshData; w: number; d: number } {
  const m = emptyMesh();
  pushFurniture(m, { kind, x: 0, z: 0, rot });
  const [fw, fd] = footprint(kind, rot);
  return { mesh: m, w: fw, d: fd };
}

/** ちょうちん 1 つだけの 形（アイコン用。原点 ＝ 下の かど） */
export function lanternOnly(): MeshData {
  const tmp = emptyMesh();
  const m = emptyMesh();
  pushProp(tmp, 0, 0, 0, 'lantern', 1, 1);
  appendMain(m, tmp);
  return m;
}

// ------------------------------------------------------------ まとめ

export function buildPreview(s: EditorState, mode: PreviewMode): PreviewParts {
  const { w, d } = s;
  const walls = {} as Record<Wall, MeshData>;
  for (const wall of WALLS) walls[wall] = buildWall(s, wall, w, d, mode);
  const roof = mode === 'outside' ? buildRoof(w, d) : emptyMesh();
  return { base: buildBase(s, w, d, mode), walls, roof, w, d };
}
