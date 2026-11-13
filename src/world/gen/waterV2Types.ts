import type { Basin, Dir } from './waterV2Kit';

/** 滝の 計画の 型（waterV2Fall と waterV2Tier が 同じ 型を 使う ために ここに おく） */

/** ひな段の たな（台地を ほった 浅い たまり）: 水の 列・水面・ふかさ */
export interface Shelf {
  cells: [number, number][];
  level: number;
  depth: number;
  /** 水面より 低い まわりの 列（岩で かさ上げして 水を うける） */
  rim: [number, number][];
}

/** 滝の 1 段: へりの 列（わきどころ）・落ちる 先の 列・わきどころの 高さ・うける たまり（いちばん 下は 滝つぼ pool、上の 段は たな shelf） */
export interface Stage {
  lip: [number, number][];
  front: [number, number][];
  top: number;
  pool: Basin | null;
  shelf: Shelf | null;
}

export interface FallPlan {
  /** 段（上から。1 段なら 1 つ）。いちばん 下の たまりが pool（滝つぼ） */
  stages: Stage[];
  /** 落ちる 向き（かべから はなれる 方） */
  d: Dir;
  /** へりの 列（わきどころを 置く） */
  lip: [number, number][];
  /** 落ちる 先の 列（へりの すぐ 前） */
  front: [number, number][];
  /** わきどころの 高さ・滝つぼの 水面（いちばん 上の 水の マス） */
  top: number;
  level: number;
  pool: Basin;
  /** 水源の 池の 列（うしろ）と まわり */
  source: [number, number][];
  sourceRing: [number, number][];
}

