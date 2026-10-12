import type { BlockId, VoxelWorld } from '../../contracts';

/** yaw（ラジアン）で、ワールドの (x, z) を妖怪の向きから見た (x', z') に直す。前 = -z' */
export function toLocalXZ(x: number, z: number, yaw: number, out: { x: number; z: number }): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = c * x + s * z;
  out.z = -s * x + c * z;
}

/** 妖怪の向きから見た (x', z') を、ワールドの (x, z) に直す */
export function toWorldXZ(x: number, z: number, yaw: number, out: { x: number; z: number }): void {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  out.x = c * x - s * z;
  out.z = s * x + c * z;
}

/** (dx, dz) の方を向く yaw（0 = 北 -Z、時計回り） */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}

/** a から b までの、-π〜π に直した角度の差 */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 向きのついた箱。中心は足もとからの位置を妖怪の向きで見たもの。h* は半分の大きさ */
export interface OBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
}

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

const tmp2 = { x: 0, z: 0 };

/** 向きのついた箱のワールドでの外わく */
export function obbBounds(b: OBox, px: number, py: number, pz: number, yaw: number, out: Aabb): Aabb {
  toWorldXZ(b.cx, b.cz, yaw, tmp2);
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const ex = c * b.hx + s * b.hz;
  const ez = s * b.hx + c * b.hz;
  out.minX = px + tmp2.x - ex;
  out.maxX = px + tmp2.x + ex;
  out.minZ = pz + tmp2.z - ez;
  out.maxZ = pz + tmp2.z + ez;
  out.minY = py + b.cy - b.hy;
  out.maxY = py + b.cy + b.hy;
  return out;
}

/**
 * 線と向きのついた箱の当たり。当たれば線の始まりからの距離、外れれば -1。
 * 始まりが箱の中なら 0。dir は単位ベクトルでなくてもよい。
 */
export function rayObb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  b: OBox, px: number, py: number, pz: number, yaw: number,
): number {
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) return -1;
  toLocalXZ(ox - px, oz - pz, yaw, tmp2);
  const lo = [tmp2.x - b.cx, oy - py - b.cy, tmp2.z - b.cz];
  toLocalXZ(dx / len, dz / len, yaw, tmp2);
  const ld = [tmp2.x, dy / len, tmp2.z];
  const h = [b.hx, b.hy, b.hz];
  let t0 = 0;
  let t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = lo[i]!;
    const d = ld[i]!;
    const half = h[i]!;
    if (Math.abs(d) < 1e-12) {
      if (o < -half || o > half) return -1;
    } else {
      let a = (-half - o) / d;
      let c = (half - o) / d;
      if (a > c) {
        const t = a;
        a = c;
        c = t;
      }
      if (a > t0) t0 = a;
      if (c < t1) t1 = c;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

/** 2 つの外わくが重なっているか（ふれているだけは重なっていない） */
export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

// ---------------------------------------------------------------- ブロックの調べ

/** 箱の中に固いブロックが無ければ true（ふれているだけは無いとする） */
export function boxFree(world: VoxelWorld, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  const e = 1e-6;
  const ix0 = Math.floor(x0 + e);
  const ix1 = Math.floor(x1 - e);
  const iy0 = Math.floor(y0 + e);
  const iy1 = Math.floor(y1 - e);
  const iz0 = Math.floor(z0 + e);
  const iz1 = Math.floor(z1 - e);
  for (let y = iy0; y <= iy1; y++) {
    for (let x = ix0; x <= ix1; x++) {
      for (let z = iz0; z <= iz1; z++) {
        if (world.isSolid(x, y, z)) return false;
      }
    }
  }
  return true;
}

/** 列を startY のセルから下へ見て、最初の固いブロックの上面の高さ。maxCells 個見て無ければ null */
export function groundTop(world: VoxelWorld, ix: number, iz: number, startY: number, maxCells: number): number | null {
  const top = Math.min(world.size.y - 1, startY);
  const bottom = Math.max(0, top - maxCells + 1);
  for (let y = top; y >= bottom; y--) {
    if (world.isSolid(ix, y, iz)) return y + 1;
  }
  return null;
}

/** 列を startY のセルから下へ見て、最初の「空気でないもの」（水もふくむ）の上面の高さ */
export function surfaceTop(world: VoxelWorld, ix: number, iz: number, startY: number, maxCells: number): number | null {
  const top = Math.min(world.size.y - 1, startY);
  const bottom = Math.max(0, top - maxCells + 1);
  for (let y = top; y >= bottom; y--) {
    const b: BlockId | 'outside' = world.getBlock(ix, y, iz);
    if (b !== 'air' && b !== 'outside') return y + 1;
  }
  return null;
}

/**
 * 2 点のあいだに固いブロックが無いか（線がまっすぐ通るか）。
 * はじめのセルと終わりのセルは見ない（目がブロックのふちにあっても見える）。
 */
export function lineOfSight(
  world: VoxelWorld,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  let x = Math.floor(ax);
  let y = Math.floor(ay);
  let z = Math.floor(az);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const ez = Math.floor(bz);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const tdx = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tdy = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tdz = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tx = dx === 0 ? Infinity : (sx > 0 ? x + 1 - ax : ax - x) * tdx;
  let ty = dy === 0 ? Infinity : (sy > 0 ? y + 1 - ay : ay - y) * tdy;
  let tz = dz === 0 ? Infinity : (sz > 0 ? z + 1 - az : az - z) * tdz;
  const maxSteps = Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z) + 1;
  for (let i = 0; i < maxSteps; i++) {
    if (x === ex && y === ey && z === ez) return true;
    if (tx <= ty && tx <= tz) {
      x += sx;
      tx += tdx;
    } else if (ty <= tz) {
      y += sy;
      ty += tdy;
    } else {
      z += sz;
      tz += tdz;
    }
    if (x === ex && y === ey && z === ez) return true;
    if (world.isSolid(x, y, z)) return false;
  }
  return true;
}
