// 建った 家の 形（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §4.8・AC49）。せっけいず → 外の 箱の ぜんぶの マスの ブロック。DOM・three・世界なし（純粋な 計算）。
// 形の 式は エディターの model.ts（windowCells・doorIndex・footprint）を 使う。別の 所に 同じ 計算を 書かない。
import type { BlockId, Vec3 } from '../contracts';
import { FURN_LEN, furnCells, type FurnBlockKind, type FurnRot } from '../world/blocks/houseBlocks';
import { FUTON_FOOT, FUTON_HEAD, type FutonDir } from '../world/blocks/futon';
import { KOTATSU_CELLS } from '../world/blocks/kotatsu';
import { K_FUTON, K_KOTATSU, type FurnKind } from './editor/furniture';
import { doorIndex, windowCells, type Placed } from './editor/model';
import { DOOR_TOP_Y, HEIGHT, ROOF_Y, WINDOW_Y, type Rot } from './editor/tuning';
import type { HouseRec, HouseSpec } from './book';
import type { Blueprint } from './editor/blueprint';
import { isRoofTopDeco, kindBlocks, splitKind } from './recipes/kinds';
import { lookTriangles } from '../world/render/houseLookTriangles';

interface ShapeCell {
  /** 外の 箱の 北西〔−x・−z〕・床の 段から の ずれ */
  x: number;
  y: number;
  z: number;
  id: BlockId;
  /** その マスを 建てた しゅるいの id（案こみ。床・家具・空気には ない） */
  look?: string;
}

export interface HouseShape {
  /** 外の 箱の よこ・たて（中の 大きさ ＋ 2）。高さは ROOF_Y ＋ 1 */
  outerW: number;
  outerD: number;
  cells: ShapeCell[];
  /** 戸の 下の マス（まえの かべの まん中・床の 上の 1 段目） */
  door: { x: number; y: number; z: number };
}

/** ふとんの 向き rot（0 ＝ まくらが うしろ）→ ふとんの FutonDir（頭から 足への 向き）。0 → s・1 → w・2 → n・3 → e */
const FUTON_DIR_OF_ROT: Readonly<Record<Rot, FutonDir>> = { 0: 1, 1: 2, 2: 3, 3: 0 };
/** 頭の マスの 北西の すみからの ずれ（FutonDir ごと。e・s は 頭が 北西、w は 東、n は 南） */
const HEAD_AT: Readonly<Record<FutonDir, readonly [number, number]>> = { 0: [0, 0], 1: [0, 0], 2: [1, 0], 3: [0, 1] };

const isBlockKind = (k: FurnKind): k is FurnBlockKind => k in FURN_LEN;

/** 家具 1 つの マスと ブロック（p.x・p.z ＝ 左上の マス）。x・z は 中の 床の 左上から */
function furnitureCells(p: Placed): Array<{ x: number; z: number; id: BlockId }> {
  const kind: FurnKind = p.kind;
  if (isBlockKind(kind)) return furnCells(kind, p.rot as FurnRot, p.x, p.z);
  if (kind === K_FUTON) {
    const dir = FUTON_DIR_OF_ROT[p.rot];
    const [hx, hz] = HEAD_AT[dir];
    const [fx, fz] = [dir === 0 ? 1 : dir === 2 ? -1 : 0, dir === 1 ? 1 : dir === 3 ? -1 : 0];
    return [
      { x: p.x + hx, z: p.z + hz, id: FUTON_HEAD[dir]! },
      { x: p.x + hx + fx, z: p.z + hz + fz, id: FUTON_FOOT[dir]! },
    ];
  }
  if (kind === K_KOTATSU) return KOTATSU_CELLS.map((c) => ({ x: p.x + c.dx, z: p.z + c.dz, id: c.block }));
  // はにわ・まねきねこ（1 マス）
  return [{ x: p.x, z: p.z, id: kind }];
}

/** 家の せっけいずの うち 形に かかわる 項目（ない 項目は いつもの 物。furniture は 家具だけに つかう） */
export type ShapeBp = Pick<Blueprint, 'w' | 'd' | 'windows' | 'furniture'> & Partial<Pick<Blueprint, 'roof' | 'wall' | 'windowKind' | 'door' | 'deco' | 'light'>>;

/** 家の 箱（外の よこ・たて・高さ。仕様 §4.2）。高さ ＝ やね なし 4／たいら 5／ななめ 7、やねの 上の かざり〔えんとつ・しゃちほこ〕が あれば ＋1（やね なしは つかない）。案では かわらない */
const BOX_H = { none: 4, flat: 5, sloped: 7, roofTop: 1 } as const;
export function houseBox(bp: ShapeBp): { w: number; d: number; h: number } {
  const roof = bp.roof ?? 'flat';
  const top = (bp.deco ?? []).some(isRoofTopDeco);
  const base = roof === 'none' ? BOX_H.none : roof === 'flat' ? BOX_H.flat : BOX_H.sloped;
  return { w: bp.w + 2, d: bp.d + 2, h: roof === 'none' ? base : base + (top ? BOX_H.roofTop : 0) };
}

/** ななめの やねの 1 列（外の たて od の 中での 距離 m）の いちばん 上の 段（やねの 1 段目から。1 段 ＝ 2 列） */
export const roofRowTop = (m: number): number => Math.floor(m / 2);

/** せっけいず → 建った 形（外の 箱の ぜんぶの マス。屋根・床も 空気も ふくむ）。家具は 床の 上の 1 段目 */
export function houseShape(bp: ShapeBp): HouseShape {
  const ow = bp.w + 2;
  const od = bp.d + 2;
  const box = houseBox(bp);
  const roofK = bp.roof ?? 'flat';
  const wallK = bp.wall ?? 'ki';
  const winK = bp.windowKind ?? 'shoji';
  const doorK = bp.door ?? 'ie';
  const lightK = bp.light ?? 'lantern';
  const decos = bp.deco ?? [];
  const doorX = 1 + doorIndex(bp);
  const doorZ = od - 1; // まえ ＝ 南 ＝ いちばん 大きい z
  const win = new Set<string>();
  for (const c of windowCells(bp)) {
    if (c.wall === 'back') win.add(`${1 + c.i},0`);
    else if (c.wall === 'left') win.add(`0,${1 + c.i}`);
    else win.add(`${ow - 1},${1 + c.i}`); // right（まえの かべには 窓が ない）
  }
  const lanternX = 1 + (bp.w - 1) / 2;
  const lanternZ = 1 + (bp.d - 1) / 2;
  const cells: ShapeCell[] = [];
  for (let y = 0; y < box.h; y++) for (let z = 0; z < od; z++) for (let x = 0; x < ow; x++) cells.push({ x, y, z, id: 'air' });
  const at = (x: number, y: number, z: number): ShapeCell => cells[(y * od + z) * ow + x]!;
  const put = (x: number, y: number, z: number, id: BlockId, look: string): void => {
    const c = at(x, y, z);
    c.id = id;
    c.look = look;
  };
  const one = (part: 'roof' | 'wall' | 'window' | 'door' | 'deco' | 'light', kind: string, n = 0): BlockId => kindBlocks(part, kind)[n]!;
  // 床
  for (let z = 0; z < od; z++) for (let x = 0; x < ow; x++) at(x, 0, z).id = 'house_floor';
  // かべ（外まわり。かべ なしは 4 すみの 柱 と 戸 だけ）・窓・戸・天井の あかり
  const decoOf = (form: string): string | undefined => decos.find((k) => splitKind(k).form === form);
  const hanadan = decoOf('hanadan');
  const noren = decoOf('noren');
  for (let y = HEIGHT.floor; y < ROOF_Y; y++) {
    for (let z = 0; z < od; z++) {
      for (let x = 0; x < ow; x++) {
        const ring = x === 0 || z === 0 || x === ow - 1 || z === od - 1;
        if (ring) {
          const corner = (x === 0 || x === ow - 1) && (z === 0 || z === od - 1);
          if (x === doorX && z === doorZ && y <= HEIGHT.doorLevels) put(x, y, z, one('door', doorK, y > HEIGHT.floor ? 1 : 0), doorK);
          else if (wallK === 'none') {
            if (corner) put(x, y, z, one('wall', 'none'), 'none');
          } else if (y === WINDOW_Y && win.has(`${x},${z}`)) {
            if (winK !== 'none') put(x, y, z, one('window', winK), winK);
          } else if (hanadan && y === WINDOW_Y - 1 && winK !== 'none' && win.has(`${x},${z}`)) {
            put(x, y, z, one('deco', hanadan), hanadan);
          } else if (noren && y === DOOR_TOP_Y + 1 && x === doorX && z === doorZ) {
            put(x, y, z, one('deco', noren), noren);
          } else put(x, y, z, one('wall', wallK), wallK);
        } else if (y === ROOF_Y - 1 && x === lanternX && z === lanternZ) put(x, y, z, one('light', lightK), lightK);
      }
    }
  }
  // やね（ななめは 外の たての 列ごとに 2 列で 1 段。むねは よこ向き）と やねの 上の かざり
  const c = (od - 1) / 2;
  const topY = (z: number): number => ROOF_Y + (roofK === 'flat' ? 0 : roofRowTop(Math.min(z, od - 1 - z)));
  if (roofK !== 'none') {
    for (let z = 0; z < od; z++) {
      for (let x = 0; x < ow; x++) {
        if (roofK === 'flat') put(x, ROOF_Y, z, one('roof', roofK), roofK);
        else for (let y = ROOF_Y; y <= topY(z); y++) put(x, y, z, one('roof', roofK), roofK);
      }
    }
    const entotsu = decoOf('entotsu');
    const shachi = decoOf('shachi');
    if (entotsu) put(ow - 3, topY(roofK === 'flat' ? 1 : 2) + 1, roofK === 'flat' ? 1 : 2, one('deco', entotsu), entotsu);
    if (shachi) for (const x of [1, ow - 2]) put(x, topY(c) + 1, c, one('deco', shachi), shachi);
  }
  for (const p of bp.furniture) {
    for (const f of furnitureCells(p)) {
      const cell = at(1 + f.x, HEIGHT.floor, 1 + f.z);
      cell.id = f.id;
      delete cell.look;
    }
  }
  return { outerW: ow, outerD: od, cells, door: { x: doorX, y: HEIGHT.floor, z: doorZ } };
}

/** 家の 三角形（家具を のぞく。実際に 区の メッシュに 描く 三角形。数え方は world/render/houseLookTriangles.ts） */
export function houseTriangles(bp: ShapeBp): number {
  const s = houseShape({ ...bp, furniture: [] });
  return lookTriangles(s.cells, s.outerW, s.outerD);
}

/** 家の 形を 外の 箱ぜんぶに 書く（足場は 空気で きえる）。at ＝ 外の 箱の 北西の すみの 床の 高さ */
export function writeShape(world: { setBlock(x: number, y: number, z: number, id: BlockId): boolean }, bp: ShapeBp, at: Vec3): void {
  for (const c of houseShape(bp).cells) world.setBlock(at.x + c.x, at.y + c.y, at.z + c.z, c.id);
}

/** 家の 記録に のこす 形（recordHouse が 作る。book.ts の HouseRec.spec。場所ごとの しゅるいは ここから 引く） */
export function specOf(bp: ShapeBp, at: Vec3): HouseSpec {
  return { at: { ...at }, w: bp.w, d: bp.d, windows: bp.windows, roof: bp.roof ?? 'flat', wall: bp.wall ?? 'ki', windowKind: bp.windowKind ?? 'shoji', door: bp.door ?? 'ie', deco: [...(bp.deco ?? [])], light: bp.light ?? 'lantern' };
}

/** 家の 記録（戸の 場所は 形から。場所ごとの しゅるいは spec から）を book に 足す */
export function recordHouse(book: { add(r: Omit<HouseRec, 'id'>): HouseRec }, bp: ShapeBp & Pick<Blueprint, 'name'>, number: number, at: Vec3): HouseRec {
  const shape = houseShape(bp);
  const box = houseBox(bp);
  return book.add({
    name: bp.name.front + bp.name.back,
    front: bp.name.front,
    back: bp.name.back,
    number,
    outer: { w: box.w, d: box.d },
    door: { x: at.x + shape.door.x, y: at.y + shape.door.y, z: at.z + shape.door.z },
    doorOpen: false,
    spec: specOf(bp, at),
  });
}
