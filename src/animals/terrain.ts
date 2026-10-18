import type { VoxelWorld } from '../contracts';
import { isLeafId } from '../world/blocks/blockTypes';

/** にわとり の 体（LIVE-1 §2.2） */
export const BODY = { radius: 0.3, height: 0.8, stepUp: 1, wanderDrop: 3 } as const;

export type AnimalWorld = Pick<VoxelWorld, 'size' | 'isLoaded' | 'getBlock' | 'isSolid'>;

/** startY から 下へ `cells` マス しらべて、最初の 固い マス の 上面(= マス + 1)。無ければ null */
export function columnTop(world: AnimalWorld, ix: number, iz: number, startY: number, cells: number): number | null {
  let y = Math.min(startY, world.size.y - 1);
  const end = Math.max(0, y - cells + 1);
  for (; y >= end; y--) if (world.isSolid(ix, y, iz)) return y + 1;
  return null;
}

/** 体の 四すみ の 列 の 上面 の いちばん 高い もの。どれか 1 つ でも 無ければ null */
export function supportTop(world: AnimalWorld, x: number, z: number, y: number, maxDrop: number): number | null {
  const r = BODY.radius * 0.999;
  const startY = Math.floor(y + BODY.stepUp + 1e-6) - 1;
  const cells = BODY.stepUp + maxDrop + 1;
  let top = -Infinity;
  for (let i = 0; i < 4; i++) {
    const t = columnTop(world, Math.floor(x + (i & 1 ? r : -r)), Math.floor(z + (i & 2 ? r : -r)), startY, cells);
    if (t === null) return null;
    if (t > top) top = t;
  }
  return top;
}

/** 足の高さ y に 体の 箱 を 置いて ブロック に ぶつからないか */
export function bodyFree(world: AnimalWorld, x: number, z: number, y: number): boolean {
  const r = BODY.radius * 0.999;
  const x0 = Math.floor(x - r);
  const x1 = Math.floor(x + r);
  const z0 = Math.floor(z - r);
  const z1 = Math.floor(z + r);
  const y0 = Math.floor(y + 1e-6);
  const y1 = Math.floor(y + BODY.height);
  for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) for (let iy = y0; iy <= y1; iy++) if (world.isSolid(ix, iy, iz)) return false;
  return true;
}

/** いちばん 上の 固い(はっぱ いがい) ブロック の 高さ。無ければ null */
export function surfaceY(world: AnimalWorld, x: number, z: number): number | null {
  const topY = (world as { topY?: (x: number, z: number) => number }).topY;
  let y = typeof topY === 'function' ? Math.min(topY.call(world, x, z), world.size.y - 1) : world.size.y - 1;
  for (; y >= 0; y--) {
    if (!world.isSolid(x, y, z)) continue;
    if (isLeafId(String(world.getBlock(x, y, z)))) continue;
    return y;
  }
  return null;
}
