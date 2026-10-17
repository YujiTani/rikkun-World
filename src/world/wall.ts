import { WORLD_LIMIT } from '../contracts';

/** そのマス (x, z) は 見えない壁の中（遊べる）か。x, z = -WORLD_LIMIT 〜 WORLD_LIMIT - 1（VOX-D W1） */
export function cellInWall(x: number, z: number): boolean {
  return x >= -WORLD_LIMIT && x < WORLD_LIMIT && z >= -WORLD_LIMIT && z < WORLD_LIMIT;
}

/** 中心 (x, z)・半径 r の体の箱が 壁の中か（W2。margin は妖怪のはしの余白） */
export function bodyInWall(x: number, z: number, r: number, margin = 0): boolean {
  const lim = WORLD_LIMIT - r - margin;
  return x >= -lim && x <= lim && z >= -lim && z <= lim;
}
