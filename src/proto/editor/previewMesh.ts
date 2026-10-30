// HOUSE-1B 試作: 見本（そと ＝ 屋根つき、なか ＝ 屋根なし）の 形を 面で 作る。ゲームの 区の メッシュと 同じ 材料（MeshData）。
// 座標: 中の 床の 左上（うしろ・ひだり）が x=0・z=0、まえ ＝ +z、みぎ ＝ +x。床の 上の 面が y=1（地面と 同じ 高さ）。
//   かべ ＝ y 1〜3 の 外まわり 1 周、やね ＝ y=4（上の 面 y=5）。窓 ＝ y=2 の かべ、戸 ＝ 戸の 壁の まん中の y=1〜2。段の 数は tuning.ts の HEIGHT。
import { pushProp, FACES, emptyMesh, type FaceDef, type MeshData } from '../../world/render/meshChunk';
import { pushKotatsuCell } from '../../world/render/kotatsuMesh';
import { KOTATSU_CELLS } from '../../world/blocks/kotatsu';
import { FACE_SHADE_BY_INDEX } from '../../world/render/config';
import type { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { MAIN_V_SCALE, tileOf, tileRect, type PreviewTile } from './atlas';
import { furnitureBoxes, type BoxKind, type FurnBox } from './furnitureArt';
import { footprint, windowCells, wallLength, type EditorState, type Placed } from './model';
import { DOOR_TOP_Y, FURNITURE, HEIGHT, K_FUTON, K_KOTATSU, OPENING, PREVIEW, ROOF_Y, WALLS, WINDOW_Y, type Wall } from './tuning';

export type PreviewMode = 'outside' | 'inside';

export interface PreviewParts {
  /** 地面・ゆか・家具・ちょうちん（いつも 出す） */
  base: MeshData;
  /** かべ 4 まい（なかの 見本では カメラ に 近い かべを かくす ため 分けて 作る） */
  walls: Record<Wall, MeshData>;
  /** 平らな やね（そとの 見本だけ） */
  roof: MeshData;
  /** 家の 大きさ（中の 床の よこ・たて）。決まって いない ときは 地面だけ の 目安 */
  w: number;
  d: number;
  hasHouse: boolean;
}

const CORNER_UV: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** 1 ブロックの 面 1 まいを 足す（光は 昼と 同じ ＝ 空 1・ブロック 0。明るさは 面の 向き）。shift ＝ 面を ずらす 量（うすい 板を ブロックの 中に 置く ため） */
function pushFaceAt(
  m: MeshData, x: number, y: number, z: number, face: FaceDef, tile: PreviewTile, shade = FACE_SHADE_BY_INDEX[face.index]!,
  shift: readonly [number, number, number] = [0, 0, 0],
): void {
  const r = tileRect(tile);
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

/** ゲームの helper（pushProp・pushKotatsuCell）が 作った 面を、写しの atlas の UV に 直して 足す */
function appendMain(dst: MeshData, src: MeshData): void {
  const base = dst.positions.length / 3;
  dst.positions.push(...src.positions);
  for (let i = 0; i < src.uvs.length; i += 2) dst.uvs.push(src.uvs[i]!, src.uvs[i + 1]! * MAIN_V_SCALE);
  dst.colors.push(...src.colors);
  dst.lights.push(...src.lights);
  dst.darks.push(...src.darks);
  for (const i of src.indices) dst.indices.push(base + i);
  dst.faceCount += src.faceCount;
}

// ------------------------------------------------------------ 地面・ゆか

function buildBase(s: EditorState, w: number, d: number, hasHouse: boolean, mode: PreviewMode): MeshData {
  const m = emptyMesh();
  const M = PREVIEW.groundMargin[mode];
  const x0 = -1 - M;
  const x1 = w + M; // ふくむ
  const z0 = -1 - M;
  const z1 = d + M;
  const inFoot = (x: number, z: number): boolean => hasHouse && x >= -1 && x <= w && z >= -1 && z <= d;
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
  if (hasHouse && mode === 'inside') {
    for (const p of s.furniture) pushFurniture(m, p);
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
function openingAt(s: EditorState, w: number, d: number): (wall: Wall, i: number, level: number) => OpenKind | null {
  const wins: Record<Wall, Set<number>> = { front: new Set(), right: new Set(), back: new Set(), left: new Set() };
  for (const c of windowCells(s)) wins[c.wall].add(c.i);
  const doorI = (wallLength(w, d, s.door) - 1) / 2;
  return (wall, i, level) => (wall === s.door && i === doorI && level <= DOOR_TOP_Y ? 'door' : level === WINDOW_Y && wins[wall].has(i) ? 'window' : null);
}

/**
 * うすい 板の 面 1 まい。side ＝ 外向き（out）か 内向き（in）。t ＝ ブロックの 外がわの 面から 板の 面までの きょり（1 ＝ ブロック 1 つ ぶん）。
 * 面の もとの 場所は out ＝ 外がわの 面・in ＝ 内がわの 面 なので、out は −t、in は 1−t だけ 外向きに ずらす。
 */
function pushPlate(m: MeshData, c: WallCell, level: number, side: 'out' | 'in', t: number, tile: PreviewTile): void {
  const [ox, oz] = OUT_DIR[c.wall];
  const sign = side === 'out' ? 1 : -1;
  const face = FACES.find((f) => f.dir[0] === ox * sign && f.dir[1] === 0 && f.dir[2] === oz * sign)!;
  const k = side === 'out' ? -t : 1 - t;
  pushFaceAt(m, c.x, level, c.z, face, tile, undefined, [ox * k, 0, oz * k]);
}

/** 戸（外がわの 面に そろえた あつい 板）・しょうじ（あつみの まん中の 紙の 板）。そとの 見本では 外がわの 面だけ 出す */
function pushOpening(m: MeshData, c: WallCell, level: number, kind: OpenKind, mode: PreviewMode): void {
  if (kind === 'door') {
    const tile: PreviewTile = level === HEIGHT.floor ? 'house_door_lo' : 'house_door_hi';
    pushPlate(m, c, level, 'out', 0, tile);
    if (mode === 'inside') pushPlate(m, c, level, 'in', OPENING.doorThick, tile);
    return;
  }
  pushPlate(m, c, level, 'out', OPENING.shojiAt - OPENING.shojiThick / 2, 'house_shoji');
  if (mode === 'inside') pushPlate(m, c, level, 'in', OPENING.shojiAt + OPENING.shojiThick / 2, 'house_shoji');
}

function buildWall(s: EditorState, wall: Wall, w: number, d: number, mode: PreviewMode): MeshData {
  const m = emptyMesh();
  const open = openingAt(s, w, d);
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

let boxCache: ReturnType<typeof furnitureBoxes> | null = null;

type Ax = 0 | 1 | 2;
interface BoxFaceDef {
  n: readonly [number, number, number];
  fixed: Ax;
  s: Ax;
  t: Ax;
  index: number;
}
/** s × t ＝ n（外から 見て 反時計まわり）。houseA の 面の 定義と 同じ */
const BOX_FACES: readonly BoxFaceDef[] = [
  { n: [0, 1, 0], fixed: 1, s: 2, t: 0, index: 0 },
  { n: [0, -1, 0], fixed: 1, s: 0, t: 2, index: 1 },
  { n: [1, 0, 0], fixed: 0, s: 1, t: 2, index: 2 },
  { n: [-1, 0, 0], fixed: 0, s: 2, t: 1, index: 3 },
  { n: [0, 0, 1], fixed: 2, s: 0, t: 1, index: 4 },
  { n: [0, 0, -1], fixed: 2, s: 1, t: 0, index: 5 },
];

/** 区切り（整数）で 分けた 区間の ならび（絵は 1 ブロックごとに くり返す） */
function splits(a: number, b: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur = a;
  const eps = 1e-6;
  for (let k = Math.floor(a + eps) + 1; k < b - eps; k++) {
    out.push([cur, k]);
    cur = k;
  }
  out.push([cur, b]);
  return out;
}

/** 箱で 作る 家具 1 つ。前（−z）が まえ（+z）を 向く のが 向き 0。みぎに まわすと 時計まわり */
function pushBoxFurniture(m: MeshData, kind: BoxKind, rot: number, ox: number, oy: number, oz: number): void {
  boxCache ??= furnitureBoxes();
  const [lw, ld] = FURNITURE[kind].cells;
  const turns = (rot + 2) % 4; // 時計まわりの 4 分の 1 回転の 数
  const [fw, fd] = rot % 2 === 0 ? [lw, ld] : [ld, lw];
  const rotate = (dx: number, dz: number): [number, number] => {
    let a = dx;
    let b = dz;
    for (let i = 0; i < turns; i++) [a, b] = [-b, a];
    return [a, b];
  };
  const toWorld = (p: readonly number[]): [number, number, number] => {
    const [rx, rz] = rotate(p[0]! - lw / 2, p[2]! - ld / 2);
    return [ox + fw / 2 + rx, oy + p[1]!, oz + fd / 2 + rz];
  };
  for (const bx of boxCache[kind] as FurnBox[]) {
    const a = bx.a.map((v) => v / 9);
    const b = bx.b.map((v) => v / 9);
    for (const f of BOX_FACES) {
      const plane = f.n[f.fixed] > 0 ? b[f.fixed]! : a[f.fixed]!;
      if (f.index === 1 && plane < 1e-6) continue; // 床に つく 面は 見えない
      const tile = tileOf(f.index <= 1 ? bx.top : bx.side);
      const r = tileRect(tile);
      // 面の 向き（まわした あと）→ 明るさ
      const [wx, wz] = rotate(f.n[0], f.n[2]);
      const wIndex = f.n[1] > 0 ? 0 : f.n[1] < 0 ? 1 : Math.abs(wx) > 0.5 ? (wx > 0 ? 2 : 3) : wz > 0 ? 4 : 5;
      const shade = bx.glow ? 1 : FACE_SHADE_BY_INDEX[wIndex]!;
      for (const [s0, s1] of splits(a[f.s]!, b[f.s]!)) {
        for (const [t0, t1] of splits(a[f.t]!, b[f.t]!)) {
          const corners: Array<[number, number]> = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
          const local = corners.map(([sv, tv]) => {
            const p = [0, 0, 0];
            p[f.fixed] = plane;
            p[f.s] = sv;
            p[f.t] = tv;
            return p;
          });
          // 絵の うつし方（ローカル）: 上下 (x, −z)・−z (x, y)・+z (−x, y)・+x (z, y)・−x (−z, y)
          const uvOf = (p: number[]): [number, number] =>
            f.index <= 1 ? [p[0]!, -p[2]!] : f.n[2] !== 0 ? [f.n[2] < 0 ? p[0]! : -p[0]!, p[1]!] : [f.n[0] > 0 ? p[2]! : -p[2]!, p[1]!];
          const raw = local.map(uvOf);
          const cu = Math.floor(raw.reduce((q, v) => q + v[0], 0) / 4);
          const cv = Math.floor(raw.reduce((q, v) => q + v[1], 0) / 4);
          const base = m.positions.length / 3;
          for (let i = 0; i < 4; i++) {
            const p = toWorld(local[i]!);
            m.positions.push(p[0], p[1], p[2]);
            m.uvs.push(r[0] + (raw[i]![0] - cu) * (r[2] - r[0]), r[1] + (raw[i]![1] - cv) * (r[3] - r[1]));
            m.colors.push(shade, shade, shade);
            m.lights.push(1, 0);
            m.darks.push(0);
          }
          m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          m.faceCount++;
        }
      }
    }
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
  const hasHouse = s.w !== null && s.d !== null;
  const w = s.w ?? PREVIEW.groundOnlyCells;
  const d = s.d ?? PREVIEW.groundOnlyCells;
  const empty = (): Record<Wall, MeshData> => ({ front: emptyMesh(), right: emptyMesh(), back: emptyMesh(), left: emptyMesh() });
  const walls = empty();
  const roof = emptyMesh();
  if (hasHouse) {
    for (const wall of WALLS) walls[wall] = buildWall(s, wall, w, d, mode);
    if (mode === 'outside') Object.assign(roof, buildRoof(w, d));
  }
  return { base: buildBase(s, w, d, hasHouse, mode), walls, roof, w, d, hasHouse };
}
