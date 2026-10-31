// 建った 家の 形（HOUSE-1C PR-1 #340。仕様 docs/design/HOUSE-1.md §4.8・AC49）。せっけいず → 外の 箱の ぜんぶの マスの ブロック。DOM・three・世界なし（純粋な 計算）。
// 形の 式は エディターの model.ts（windowCells・doorIndex・footprint）を 使う。別の 所に 同じ 計算を 書かない。
import type { BlockId } from '../contracts';
import { FURN_LEN, doorId, furnCells, type FurnBlockKind, type FurnRot } from '../world/blocks/houseBlocks';
import { FUTON_FOOT, FUTON_HEAD, type FutonDir } from '../world/blocks/futon';
import { KOTATSU_CELLS } from '../world/blocks/kotatsu';
import { K_FUTON, K_KOTATSU, type FurnKind } from './editor/furniture';
import { doorIndex, windowCells, type Placed } from './editor/model';
import { HEIGHT, ROOF_Y, WINDOW_Y, type Rot } from './editor/tuning';
import type { Blueprint } from './editor/blueprint';

interface ShapeCell {
  /** 外の 箱の 北西〔−x・−z〕・床の 段から の ずれ */
  x: number;
  y: number;
  z: number;
  id: BlockId;
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
  // はにわ（1 マス）
  return [{ x: p.x, z: p.z, id: kind }];
}

/** せっけいず → 建った 形（外の 箱の ぜんぶの マス。屋根・床も 空気も ふくむ）。家具は 床の 上の 1 段目 */
export function houseShape(bp: Pick<Blueprint, 'w' | 'd' | 'windows' | 'furniture'>): HouseShape {
  const ow = bp.w + 2;
  const od = bp.d + 2;
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
  for (let y = 0; y <= ROOF_Y; y++) {
    for (let z = 0; z < od; z++) {
      for (let x = 0; x < ow; x++) {
        const ring = x === 0 || z === 0 || x === ow - 1 || z === od - 1;
        let id: BlockId = 'air';
        if (y === 0) id = 'house_floor';
        else if (y === ROOF_Y) id = 'house_roof';
        else if (ring) {
          if (x === doorX && z === doorZ && y <= HEIGHT.doorLevels) id = doorId(y > 1, false);
          else if (y === WINDOW_Y && win.has(`${x},${z}`)) id = 'shoji';
          else id = 'house_wall';
        } else if (y === ROOF_Y - 1 && x === lanternX && z === lanternZ) id = 'lantern';
        cells.push({ x, y, z, id });
      }
    }
  }
  const at = (x: number, y: number, z: number): ShapeCell => cells[(y * od + z) * ow + x]!;
  for (const p of bp.furniture) {
    for (const c of furnitureCells(p)) at(1 + c.x, HEIGHT.floor, 1 + c.z).id = c.id;
  }
  return { outerW: ow, outerD: od, cells, door: { x: doorX, y: HEIGHT.floor, z: doorZ } };
}
