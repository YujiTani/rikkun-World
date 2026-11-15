import { ALL_WATER_IDS, isWater } from '../world/blocks/water';
import { cellInWall } from '../world/wall';

/**
 * 街の だいくさんが 歩ける 足もと。建築士さんの 地面の しらべ（house/ground.ts）は 列の いちばん 上を 見る ので、
 * 屋根の ある 所では 屋根の 上に なって しまう。街では 屋根の 下・橋の 上・みぞの 底 でも 歩く ので、いまの 高さ fromY の 近くだけ を 見る。
 */
export interface WalkWorld {
  isLoaded(x: number, z: number): boolean;
  isSolid(x: number, y: number, z: number): boolean;
  getBlock(x: number, y: number, z: number): string;
}

/** 立つ 地面に しない ブロック（建築士さんと 同じ） */
const NOT_GROUND = new Set<string>(['log', 'bamboo', ...ALL_WATER_IDS]);
/** 上へ（段）・下へ（おりる）見る マスの 数 */
const UP = 1;
const DOWN = 2;
/** 体の 高さ（マス）: 足もとと その 上の 1 マス */
const ROOM = 2;

/** 列 (x, z) で、いまの 高さ fromY から 見て 立てる いちばん 高い 足もとの y。なければ null */
export function walkY(world: WalkWorld, x: number, z: number, fromY: number): number | null {
  if (!cellInWall(x, z) || !world.isLoaded(x, z)) return null;
  for (let y = fromY + UP; y >= fromY - DOWN; y--) {
    const below = world.getBlock(x, y - 1, z);
    if (!world.isSolid(x, y - 1, z) || NOT_GROUND.has(String(below))) continue;
    let free = true;
    for (let k = 0; k < ROOM; k++) {
      if (world.isSolid(x, y + k, z) || isWater(String(world.getBlock(x, y + k, z)))) {
        free = false;
        break;
      }
    }
    if (free) return y;
  }
  return null;
}

/** 足場を 立てる 地面: 列 (x, z) の aroundY の 近く（上 2 マス 〜 下 6 マス）で、足の 下が かたく 上の 2 マスが 空気の いちばん 高い 足もとの y。なければ null */
export function groundNear(world: WalkWorld, x: number, z: number, aroundY: number): number | null {
  if (!world.isLoaded(x, z)) return null;
  for (let y = aroundY + 2; y >= aroundY - 6; y--) {
    if (!world.isSolid(x, y - 1, z) || world.isSolid(x, y, z) || world.isSolid(x, y + 1, z)) continue;
    return y;
  }
  return null;
}
