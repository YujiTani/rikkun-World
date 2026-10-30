import { CHUNK_SIZE, WORLD_HEIGHT } from '../../contracts';

/**
 * 列（16×WORLD_HEIGHT×16）を作る ときの 並び方。chunk.ts（地形）と mineOres.ts（鉱石）が 同じ 並びを 使う。
 * ブロックの並び: (y * 16 + lz) * 16 + lx（y 方向の 1 まい = LAYER）
 */

/** 1 まい（y が 同じ 16×16）の マスの 数（こ） */
export const LAYER = CHUNK_SIZE * CHUNK_SIZE;
/** 列 1 つの マスの 数（こ） */
export const COL_VOLUME = LAYER * WORLD_HEIGHT;
/** 高さの地図は まわり 1 列ぶん広い（18×18）。そのよこの はば（こ）。(lz+1)*HW + (lx+1) */
export const HW = CHUNK_SIZE + 2;
