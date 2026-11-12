import type { BlockId } from '../../../contracts';

/**
 * 建物を組む しくみ（structure kit）の 型。1 つの 建物 = 1 ファイル 1 レコード（`StructureShape`）。
 * 図は 下から 上へ 段ごとに 文字の 図（layers[y][z][x]。図の 上 = 北 = z が 小さい 方、左 = 西 = x が 小さい 方）。
 * 空気は '.'（空気を 書く）、' '（空白）は「地形を そのまま 残す」（何も 書かない）。
 */

/** 凡例の 1 文字ぶん。BlockId だけなら ふつうの ブロック。ゆらぎ（任意）: skip = そのマスを 抜く 確率、moss = こけいしに 置きかえる 確率（0〜1） */
export type LegendEntry = BlockId | { readonly id: BlockId; readonly skip?: number; readonly moss?: number };

/** 土台: 建物の 下が あいて いたら この ブロックで 地面まで うめる。うめる 高さの 上限（マス）を こえる 列が あれば 置けない */
interface BaseRule {
  readonly id: BlockId;
  readonly maxFill: number;
}

export interface StructureShape {
  readonly id: string;
  /** 下から 上へ。layers[y][z][x] */
  readonly layers: readonly (readonly string[])[];
  /** 文字 → ブロック（'.' と ' ' は 予約。書かない） */
  readonly legend: Readonly<Record<string, LegendEntry>>;
  /** 基準の 点（図の 中の x, z。向きを かえる ときの 回転の まん中。みちびく 正面は 向き 0 で 図の 下 = 南 = z が 大きい 方） */
  readonly anchor: { readonly x: number; readonly z: number };
  readonly base: BaseRule;
  /** 足もとの 地面の 高さの 差（最大 − 最小）の 上限。これより 大きい 所には 置かない */
  readonly maxSlope: number;
}

/** 向き: 0 = 図の まま、1・2・3 = 時計まわりに 90°・180°・270° */
export type Rot = 0 | 1 | 2 | 3;
export const ROTS: readonly Rot[] = [0, 1, 2, 3];

export interface PlacedCell {
  x: number;
  y: number;
  z: number;
  id: BlockId;
}

/** 置いた 結果。blocks は 書く ブロック（空気も 入る）、foot は 足もとの 四角（x0, z0, x1, z1。両はし ふくむ）、baseY は いちばん 下の 段の y */
export interface Placed {
  readonly blocks: PlacedCell[];
  readonly foot: readonly [number, number, number, number];
  readonly baseY: number;
}

/** (x, z) の 地面の 高さ（いちばん 上の 固い ブロックの y）。置けない 列は -1 */
export type GroundFn = (x: number, z: number) => number;
