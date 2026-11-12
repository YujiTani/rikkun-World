import type { Look } from './mineYakataConfig';
import type { Rect, Zone } from './mineYakataGeom';
import type { Compass, PathCell, Pt, Tier } from './mineShaftTypes';

/** やかた 1 つの 計画〔窓口 `Shaft.yakata`。MINE-1F §6.1〕 */
export interface Yakata {
  id: string;
  hit: boolean;
  look: Look;
  passage: Pt[];
  gate: Rect;
  hall: Rect;
  altar: Rect;
  chest: { x: number; y: number; z: number; cells: Pt[]; front: Compass; tier: Tier };
  spawns: { at: Pt; zone: Zone }[];
}

/** 出す 妖怪の 二つ名の 位 */
export type Rank = 'oyabun' | 'taisho';
export interface Foe {
  kind: string;
  rank: Rank;
  at: Pt;
}

/** 世界の 座標の 箱〔両はし ふくむ〕 */
export interface Box3 {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

/** 計画に ついて 持つ やかた〔`ShaftPlan.yakata`〕 */
export interface YakataBuilt {
  yakata: Yakata;
  /** やかたの 外の ふち〔大広間の まわり ＋ 横穴〕 */
  box: Box3;
  /** 空気の マス〔横穴・門・大広間の 中。ふさぐ 前〕 */
  air: ReadonlySet<number>;
  /** 足の マス〔横穴・大広間の 床・祭壇の 上。`part: 'yakata'`〕 */
  path: readonly PathCell[];
}
