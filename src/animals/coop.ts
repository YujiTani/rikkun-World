import type { BlockId } from '../contracts';
import { planFlatten, type FlattenPlan, type FlattenWorld } from '../world/flatten';
import type { AnimalWorld } from './terrain';

/**
 * とりごや の 形 と 置く 判定（LIVE-2 §2.3）。世界 に ブロック を 置く／消す の は つなぎ込み（`src/world/`）。
 * そこ は この `coopBlocks()` の 答え の とおり に 置く（A と 同じ 形 に なる）。
 */
export type CoopDir = 0 | 1 | 2 | 3;

/** もん の むき（0 北(-z)・1 東(+x)・2 南(+z)・3 西(-x)）の 向き ベクトル（x, z） */
export const DIR_VEC: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/** そと の 一辺 の はんぶん（5×5 → 2）・置く の に いる 高さ・中 の はんぶん（3×3 → 1.5 の 手前） */
export const COOP_HALF = 2;
export const COOP_HEIGHT = 4;
/** 中 3×3 の まん中 から の はんい（マス の 中心 から ±1.5）。小屋 の ブロック の 座標 は 整数、体 の 座標 は 小数 */
export const INTERIOR_HALF = 1.5;
export const FOOTPRINT_HALF = 2.5;

export type CoopBlockId = Extract<BlockId, 'toriya_fence' | 'toriya_gate' | 'toriya_nest' | 'toriya_box'>;
export interface CoopBlock {
  x: number;
  y: number;
  z: number;
  block: CoopBlockId;
}

/** その 位置（5×5 の まん中 x・z、いちばん 下 の 空気 の 高さ y）に 置く 小屋 の ブロック ぜんぶ */
export function coopBlocks(x: number, y: number, z: number, dir: CoopDir): CoopBlock[] {
  const [fx, fz] = DIR_VEC[dir]!;
  // 横 の むき（前 を 向いて 右）
  const px = -fz;
  const pz = fx;
  const out: CoopBlock[] = [];
  const add = (cx: number, cy: number, cz: number, block: CoopBlockId) => out.push({ x: cx, y: cy, z: cz, block });
  for (let a = -COOP_HALF; a <= COOP_HALF; a++) {
    for (let b = -COOP_HALF; b <= COOP_HALF; b++) {
      // a = 前後（+ が もん の がわ）、b = 横
      if (Math.abs(a) !== COOP_HALF && Math.abs(b) !== COOP_HALF) continue;
      const cx = x + fx * a + px * b;
      const cz = z + fz * a + pz * b;
      if (a === COOP_HALF && b === 0) {
        // もん（はば 1・高さ 2）
        add(cx, y, cz, 'toriya_gate');
        add(cx, y + 1, cz, 'toriya_gate');
      } else if (a === -COOP_HALF && Math.abs(b) <= 1) {
        // ねぐら（うしろ の 列 の まん中 3 マス）。まん中 の ゆか が すばこ
        add(cx, y, cz, b === 0 ? 'toriya_box' : 'toriya_nest');
        // すばこ の 上 は あける（たまご が 見える。両がわ の ねぐら と 上 の やね で かこむ ので 入れない）
        if (b !== 0) add(cx, y + 1, cz, 'toriya_nest');
        add(cx, y + 2, cz, 'toriya_nest');
      } else {
        add(cx, y, cz, 'toriya_fence');
      }
    }
  }
  return out;
}

/** もん の マス */
export function gateCell(x: number, z: number, dir: CoopDir): { x: number; z: number } {
  const [fx, fz] = DIR_VEC[dir]!;
  return { x: x + fx * COOP_HALF, z: z + fz * COOP_HALF };
}

/** 小屋 から 見て (dx, dz) の 方向 に いちばん 近い 4 方向（置く とき「プレイヤー の 方」に もん を 向ける） */
export function coopDirToward(dx: number, dz: number): CoopDir {
  if (Math.abs(dx) > Math.abs(dz)) return dx >= 0 ? 1 : 3;
  return dz >= 0 ? 2 : 0;
}

/** 体 の 座標 (px, pz) が 小屋 の 5×5 の 中 か（c = 5×5 の まん中 の マス） */
export function inFootprint(c: { x: number; z: number }, px: number, pz: number, margin = 0): boolean {
  return Math.abs(px - (c.x + 0.5)) < FOOTPRINT_HALF + margin && Math.abs(pz - (c.z + 0.5)) < FOOTPRINT_HALF + margin;
}

/** 体 の 座標 が 中 3×3 の 中 か */
export function inInterior(c: { x: number; z: number }, px: number, pz: number, margin = 0): boolean {
  return Math.abs(px - (c.x + 0.5)) < INTERIOR_HALF - margin && Math.abs(pz - (c.z + 0.5)) < INTERIOR_HALF - margin;
}

/**
 * 5×5×4 の たいら の 計画（LIVE-2.1 §2.1）。置けない なら null。
 * 変える マス（消す・うめる）は `plan.edits`。置く 側 が `applyFlatten(plan, setBlock)` を してから `coopBlocks()` を 置く。
 * 世界 は 変えない（すけた 形・`previewCoop` からも 呼べる）
 */
export function coopPlan(w: FlattenWorld, x: number, y: number, z: number): FlattenPlan | null {
  return planFlatten(w, { x0: x - COOP_HALF, z0: z - COOP_HALF, w: 2 * COOP_HALF + 1, d: 2 * COOP_HALF + 1, y, h: COOP_HEIGHT });
}

/** 置ける か（`coopPlan` が ある か） */
export function coopFits(w: AnimalWorld, x: number, y: number, z: number): boolean {
  return coopPlan(w, x, y, z) !== null;
}

/** ずらし の 順（ねらった 所 → まわり 8 か所。§2.3） */
export const COOP_SHIFTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** 二つ の 小屋 の 5×5×4 が かさなる か（まん中 の マス と いちばん 下 の 高さ） */
export function coopsOverlap(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): boolean {
  return Math.abs(a.x - b.x) <= 2 * COOP_HALF && Math.abs(a.z - b.z) <= 2 * COOP_HALF && Math.abs(a.y - b.y) < COOP_HEIGHT;
}
