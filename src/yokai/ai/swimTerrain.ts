import type { VoxelWorld } from '../../contracts';
import { YOKAI_DEFS } from '../../content/yokai/registry';
import type { YokaiSwim } from '../../content/yokai/types';
import { bodyInWall } from '../../world/wall';
import { KIND_TRAITS } from '../traits';
import { AI_CONST, type KindAi } from './config';
import type { Ent } from './entity';

/**
 * およぐ 妖怪（TAKO-1）の 水の 見方。体の 箱が ぜんぶ 水の マスの ときだけ 動ける。
 * 水面 = その 列の いちばん 上の 水の マスの 上の 面（y の 数）。
 */

const isWater = (world: VoxelWorld, x: number, y: number, z: number): boolean => world.getBlock(x, y, z) === 'water';

/** 体の 箱（足もと x, y, z・半径 r・高さ h）が ぜんぶ 水の マスの 中か。見えない 壁の 外・読みこんでいない 列は だめ */
function bodyInWater(world: VoxelWorld, ai: KindAi, x: number, y: number, z: number): boolean {
  const r = ai.radius;
  if (!bodyInWall(x, z, r, AI_CONST.edgeMargin)) return false;
  if (!world.isLoaded(Math.floor(x), Math.floor(z))) return false;
  const e = 1e-6;
  for (let yy = Math.floor(y + e); yy <= Math.floor(y + ai.height - e); yy++) {
    for (let xx = Math.floor(x - r + e); xx <= Math.floor(x + r - e); xx++) {
      for (let zz = Math.floor(z - r + e); zz <= Math.floor(z + r - e); zz++) {
        if (!isWater(world, xx, yy, zz)) return false;
      }
    }
  }
  return true;
}

/** (x, z) の 列の 水面（高さ y の マスから 上へ 水が つづく 限り のぼった 上の 面）。y の マスが 水で なければ null */
function waterSurface(world: VoxelWorld, x: number, z: number, y: number): number | null {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let yy = Math.floor(y);
  if (!isWater(world, ix, yy, iz)) return null;
  for (let n = 0; n < world.size.y; n++) {
    if (!isWater(world, ix, yy + 1, iz)) return yy + 1;
    yy++;
  }
  return yy + 1;
}

/** 水面から 下へ つづく 水の マスの 数（上限 limit） */
export function waterDepthBelow(world: VoxelWorld, x: number, z: number, surface: number, limit: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  let n = 0;
  while (n < limit && isWater(world, ix, surface - 1 - n, iz)) n++;
  return n;
}

/** 体の 足もとの 高さの めざす 所: 体の いちばん 上が 水面から depth ブロック 下 */
export const swimYAt = (surface: number, ai: KindAi, depth: number): number => surface - depth - ai.height;

/**
 * (x, z) へ 行けるか。行けるなら そこでの 足もとの 高さ（今の 高さ y から 水面に 合わせて maxDy だけ 近づく）、だめなら NaN。
 * だめな 場合: 水の 深さが 足りない（浅い）・体の 箱が 水の 外に はみ出す・体の いちばん 上の 深さが 範囲の 外。
 */
export function swimTarget(world: VoxelWorld, ai: KindAi, sw: YokaiSwim, x: number, z: number, y: number, maxDy: number): number {
  const mid = y + ai.height / 2;
  const surface = waterSurface(world, x, z, mid);
  if (surface === null) return NaN;
  if (waterDepthBelow(world, x, z, surface, sw.minWaterDepth) < sw.minWaterDepth) return NaN;
  const want = swimYAt(surface, ai, sw.depthSpawn);
  const ny = y + Math.max(-maxDy, Math.min(maxDy, want - y));
  const d = surface - (ny + ai.height);
  // 深さが 範囲の 外でも、めざす 高さに 近づいているなら 動いて よい（出た ばかりの ときなど）
  const inRange = d >= sw.depthMin - 1e-6 && d <= sw.depthMax + 1e-6;
  if (!inRange && Math.abs(want - ny) >= Math.abs(want - y) - 1e-9) return NaN;
  if (!bodyInWater(world, ai, x, ny, z)) return NaN;
  return ny;
}

/** この妖怪の およぐ 数（書いてなければ undefined = およがない） */
export const swimOf = (e: Pick<Ent, 'kind'>): YokaiSwim | undefined => (KIND_TRAITS[e.kind].swims ? YOKAI_DEFS[e.kind].swim : undefined);
