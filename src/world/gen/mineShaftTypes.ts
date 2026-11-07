/**
 * 坑道（MINE-1C。docs/design/MINE-1.md §6.1）の 窓口の 型。テストの 道具〔mineShaftKit.ts〕が 持つ 型と 同じ 形。
 * 実装が 型を 持ち、テストの 道具は 同じ 形を 自分でも 書いて いる〔向きや 形が ちがうと テストの 型が 通らない〕。
 */
import type { ItemId, Rarity } from '../../contracts';

export interface Pt {
  x: number;
  y: number;
  z: number;
}
export type Compass = 'n' | 'e' | 's' | 'w';
export type PathPart = 'entrance' | 'ramp' | 'landing' | 'side' | 'joint' | 'koheya' | 'room' | 'hiroba' | 'main' | 'eda' | 'end' | 'hibi' | 'kakushi' | 'maze' | 'camp';
export interface PathCell extends Pt {
  part: PathPart;
}
export type Tier = 1 | 2 | 3 | 4;
export type ShaftLayer = 'asai' | 'nakahodo' | 'fukai';

export interface ShaftSide {
  layer: ShaftLayer;
  from: Pt;
  to: Pt;
  end: 'cave' | 'joint' | 'koheya' | 'heya';
  /** 計画の 長さ〔12〜40〕 */
  length: number;
  /** 計画の 曲がり〔0〜2〕 */
  bends: number;
  /** 1D: 坑道の へやの くじに 当たったか〔部屋が 入らず はずれに した 横穴も true。はじまりの 坑道は ほたるの 1 本だけ〕 */
  heyaHit: boolean;
  /** 1D: くじに 当たった 部屋の 種類〔部屋が 入らず はずれに した 横穴も。当たりでなければ null。はじまりの ほたるは 'hotaru'〕。end が 'heya' の とき 部屋の kind と 同じ */
  heyaKind: string | null;
  /** 1D: end が 'heya'〔と はじまりの ほたる〕の とき その 部屋の id */
  cave?: string;
  /** 1E: 横穴が 出る 階の 番号〔いちばん 下の へやからは −1〕 */
  floor?: number;
}
interface ShaftChest {
  x: number;
  y: number;
  z: number;
  cells: Pt[];
  front: Compass;
  tier: Tier;
}
export interface Shaft {
  id: string;
  start: boolean;
  entrance: Pt & { dir: 0 | 1 | 2 | 3; kind: 'slope' | 'mound' };
  mound: { x: number; z: number; top: number; width: number } | null;
  room: { x0: number; y: number; z0: number; x1: number; z1: number };
  chest: ShaftChest | null;
  sides: ShaftSide[];
  box: { x0: number; z0: number; x1: number; z1: number };
  /** 1E: 坑道の 作り〔1C・1D の 坑道は 'c'〕 */
  gen: 'c' | 'e';
  /** 1E: 性格〔1C・1D は null〕 */
  style: ShaftStyle | null;
  floors: ShaftFloor[];
  branches: ShaftBranch[];
  maze: ShaftMaze | null;
  camp: ShaftCamp | null;
  /** 1E: 計画の 仕事〔ためした 回数〕 */
  work?: { entrance: number; floors: number; sides: number; eda: number; maze: number };
}
interface ShaftStyle {
  depth: ShaftLayer;
  floors: number;
  size: 64 | 96 | 128;
  level: 'yasashii' | 'futsu' | 'fukuzatsu';
  camp: boolean;
  maze: boolean;
}
interface ShaftFloor {
  y: number;
  up: Pt;
  down: Pt | null;
  main: Pt[];
  bends: number;
}
type DeadEndKindT = 'oo' | 'naka' | 'atari' | 'hazure' | 'hibi_naka' | 'hibi_oo';
interface ShaftRoom {
  x0: number;
  y: number;
  z0: number;
  x1: number;
  z1: number;
}
interface ShaftDeadEnd {
  at: Pt;
  kind: DeadEndKindT;
  hibi: Pt[];
  room: ShaftRoom | null;
  chest: ShaftChest | null;
  ores: Record<string, number>;
}
interface ShaftBranch {
  side: number;
  from: Pt;
  to: Pt;
  length: number;
  bends: number;
  old: boolean;
  rubble: Pt[];
  end: ShaftDeadEnd;
}
interface ShaftMaze {
  box: { x0: number; z0: number; x1: number; z1: number };
  y: number;
  grid: 4 | 5;
  entrance: Pt;
  deadEnds: ShaftDeadEnd[];
  farthest: number;
}
interface ShaftCamp {
  room: ShaftRoom;
  tansu: Pt;
  lantern: Pt;
  futon: Pt[];
  takibi: Pt;
}
export interface ShaftRoll {
  rx: number;
  rz: number;
  hit: boolean;
  land: number;
  placed: boolean;
}

interface ChestTierRow {
  tier: Tier;
  chance: number;
  slots: number;
  rarity: Partial<Record<Rarity, number>>;
  sure: Rarity | null;
}
export interface ChestTable {
  placeChance: number;
  tiers: ChestTierRow[];
  legendary: number;
  lots: { id: string; chance: number }[];
}
export interface ChestRoll {
  tier: Tier;
  items: { item: ItemId; count: number }[];
}
