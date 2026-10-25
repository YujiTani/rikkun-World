import { inFootprint } from './coop';
import { TAU } from './animalConsts';

export const SLAB: [number, number] = [0, 0];
/** 1 つの 軸 の 区間 [t0,t1] を 箱 [lo,hi] で せばめる。当たらなければ null（返す 配列は 使いまわし） */
export function slab(o: number, d: number, lo: number, hi: number, t0: number, t1: number): [number, number] | null {
  if (Math.abs(d) < 1e-9) {
    if (o < lo || o > hi) return null;
  } else {
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) {
      const x = ta;
      ta = tb;
      tb = x;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  SLAB[0] = t0;
  SLAB[1] = t1;
  return SLAB;
}
export const FOLLOW_OFFS: readonly number[] = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6];
export const SEP_OFFS: readonly number[] = [0, 0.8, -0.8, 1.6, -1.6];

export function inFootprintAny(coops: readonly { x: number; z: number }[], px: number, pz: number): boolean {
  for (const c of coops) if (inFootprint(c, px, pz)) return true;
  return false;
}

export const dist2d = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 0 = 北(-Z)・時計まわり（妖怪 と 同じ） */
export const yawTo = (dx: number, dz: number) => Math.atan2(dx, -dz);
