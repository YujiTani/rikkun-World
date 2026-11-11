import { SENSE } from './senseTuning';

/**
 * SIGHT-1（#446）: 妖怪の 見通し。目 → 相手の 点 の 線分を マスごとに たどり（DDA）、固いマスが あれば さえぎられる。
 * 目の マスと 相手の マスは 数えない。
 */
type SolidFn = (x: number, y: number, z: number) => boolean;

/** 2 点の あいだに 固いマスが 1 つも ない（見える）か */
function lineClear(isSolid: SolidFn, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  let x = Math.floor(ax);
  let y = Math.floor(ay);
  let z = Math.floor(az);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const ez = Math.floor(bz);
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
  let ty = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * tdy : Infinity;
  let tz = dz !== 0 ? (dz > 0 ? z + 1 - az : az - z) * tdz : Infinity;
  const limit = Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z);
  for (let i = 0; i < limit; i++) {
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
    if (x === ex && y === ey && z === ez) return true; // 相手の マスは 数えない
    if (isSolid(x, y, z)) return false;
  }
  return true;
}

/** 妖怪（足もと ex,ey,ez・体の 高さ bodyHeight）から 人（足もと px,py,pz）が 見えるか（相手の 点 2 つの どちらか 通れば 見える） */
export function canSee(isSolid: SolidFn, ex: number, ey: number, ez: number, bodyHeight: number, px: number, py: number, pz: number): boolean {
  const eyeY = ey + bodyHeight * SENSE.eyeFrac;
  for (const h of SENSE.targetHeights) if (lineClear(isSolid, ex, eyeY, ez, px, py + h, pz)) return true;
  return false;
}
