import { surfaceY, type AnimalWorld } from '../animals/terrain';
import { cellInWall } from '../world/wall';

/**
 * 建築士さんが 立てる 地面の しらべ方（読みこんだ 世界の 実際の ブロックを 見る）。
 * 木の みき・たけの 上、水の 中、はっぱ・木の 下（頭が つかえる）には 立てない。
 */

/** 建築士さんの 体（ブロック）: 半径・高さ・登れる 段差・おりられる 段差 */
export const ARCHITECT_BODY = { radius: 0.3, height: 1.7, stepUp: 1, stepDown: 2 } as const;
/** 頭の 上まで あける マス数（足もとを ふくむ） */
const ROOM_CELLS = 2;
/** 立つ 地面に しない ブロック */
const NOT_GROUND = new Set<string>(['log', 'bamboo', 'water']);

/** 世界の 窓口（`AnimalWorld` が 合う） */
export type HouseWorld = AnimalWorld;

/**
 * 列 (ix, iz) で 立てる 足もとの y（地面の 上面）。立てない（読みこみ前・世界の 外・水・木・上が つまる）なら null。
 */
export function standY(world: HouseWorld, ix: number, iz: number): number | null {
  if (!cellInWall(ix, iz) || !world.isLoaded(ix, iz)) return null;
  const top = surfaceY(world, ix, iz);
  if (top === null) return null;
  if (NOT_GROUND.has(String(world.getBlock(ix, top, iz)))) return null;
  const y = top + 1;
  for (let k = 0; k < ROOM_CELLS; k++) {
    if (world.isSolid(ix, y + k, iz) || String(world.getBlock(ix, y + k, iz)) === 'water') return null;
  }
  return y;
}

/**
 * (x, z) に 足を おけるか。体の 四すみの 列が ぜんぶ 立てて、いまの 高さ fromY から 登れる・おりられる 段差 なら、足もとの y を 返す（四すみの いちばん 高い 地面）。
 * だめなら null
 */
export function canStand(world: HouseWorld, x: number, z: number, fromY: number): number | null {
  const r = ARCHITECT_BODY.radius;
  let top = -Infinity;
  for (let i = 0; i < 4; i++) {
    const y = standY(world, Math.floor(x + (i & 1 ? r : -r)), Math.floor(z + (i & 2 ? r : -r)));
    if (y === null) return null;
    if (y - fromY > ARCHITECT_BODY.stepUp + 1e-6 || fromY - y > ARCHITECT_BODY.stepDown + 1e-6) return null;
    if (y > top) top = y;
  }
  return top;
}
