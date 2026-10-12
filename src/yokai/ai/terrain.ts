import type { VoxelWorld } from '../../contracts';
import { AI_CONST, type KindAi } from './config';
import { boxFree, groundTop, surfaceTop } from './geometry';

/**
 * (x, z) に、足の高さ y から立てるか。立てれば足もとの高さ、だめなら NaN。
 * - 体のはば（radius）の四すみと中心の列すべてに、のぼれる段〜おりる深さの中に地面があること
 * - 水の上はだめ
 * - 体の入る分のくうきがあること
 */
export function groundSupport(world: VoxelWorld, x: number, z: number, y: number, ai: KindAi): number {
  const r = ai.radius;
  if (x < r + AI_CONST.edgeMargin || z < r + AI_CONST.edgeMargin) return NaN;
  if (x > world.size.x - r - AI_CONST.edgeMargin || z > world.size.z - r - AI_CONST.edgeMargin) return NaN;
  const startY = Math.floor(y + ai.stepUp + 1e-6) - 1;
  const cells = ai.stepUp + AI_CONST.maxDrop + 1;
  let top = -Infinity;
  for (let i = 0; i < 5; i++) {
    const sx = i === 0 ? x : x + (i & 1 ? r : -r) * 0.999;
    const sz = i === 0 ? z : z + (i & 2 ? r : -r) * 0.999;
    const ix = Math.floor(sx);
    const iz = Math.floor(sz);
    const g = groundTop(world, ix, iz, startY, cells);
    if (g === null) return NaN;
    if (world.getBlock(ix, g, iz) === 'water') return NaN;
    if (g > top) top = g;
  }
  if (!boxFree(world, x - r, top + 0.05, z - r, x + r, top + ai.height, z + r)) return NaN;
  return top;
}

/** 立っている所の、足もとの下の地面の高さ（落ちる・のぼる用。深さの制限なし）。無ければ -Infinity */
export function settleGround(world: VoxelWorld, x: number, z: number, y: number, ai: KindAi): number {
  const r = ai.radius;
  const startY = Math.floor(y + ai.stepUp + 1e-6) - 1;
  let top = -Infinity;
  for (let i = 0; i < 5; i++) {
    const sx = i === 0 ? x : x + (i & 1 ? r : -r) * 0.999;
    const sz = i === 0 ? z : z + (i & 2 ? r : -r) * 0.999;
    const g = groundTop(world, Math.floor(sx), Math.floor(sz), startY, world.size.y);
    if (g !== null && g > top) top = g;
  }
  return top;
}

/** ちょうちん用: 水もふくむ一番上の面の高さ。無ければ null */
export function flySurface(world: VoxelWorld, x: number, z: number, y: number): number | null {
  return surfaceTop(world, Math.floor(x), Math.floor(z), Math.floor(y) + 6, 24);
}

/** その足もとの上に屋根（固いブロック）があるか。空が見えなければ true */
export function isRoofed(world: VoxelWorld, x: number, y: number, z: number, height: number): boolean {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const from = Math.floor(y + height);
  for (let yy = from; yy < world.size.y; yy++) {
    if (world.isSolid(ix, yy, iz) && world.getBlock(ix, yy, iz) !== 'leaves') return true;
  }
  return false;
}
