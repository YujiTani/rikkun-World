import { CAMERA_CLEARANCE, RAY_STEP } from './config';

/**
 * SIGHT-1（#446）: カメラの 点の まわりに 固いブロックを 入れない ための 共通の 関数。
 * 1P の CameraRig と 2P の p2CameraPose の 両方が 使う（three を 使わない・毎回 新しい 物を 作らない）。
 */
export type SolidFn = (x: number, y: number, z: number) => boolean;
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** 線ぞいに すすむ 刻み幅（マス）。そのあと 最後の 刻みを 二分で 細かく する */
const SCAN_STEP = 0.05;
const BISECT_COUNT = 7; // 回
const PUSH_ROUNDS = 4; // 回: 肩の 点を 押し出す 最大の 回数

/** 点 (px,py,pz) の まわり 半径 r の 球に かかる 固いマスが あるか（球と 箱の いちばん近い 点の 距離で 見る） */
function solidWithin(isSolid: SolidFn, px: number, py: number, pz: number, r: number): boolean {
  const x0 = Math.floor(px - r);
  const x1 = Math.floor(px + r);
  const y0 = Math.floor(py - r);
  const y1 = Math.floor(py + r);
  const z0 = Math.floor(pz - r);
  const z1 = Math.floor(pz + r);
  const r2 = r * r;
  for (let x = x0; x <= x1; x++) {
    const dx = Math.max(x - px, 0, px - (x + 1));
    for (let y = y0; y <= y1; y++) {
      const dy = Math.max(y - py, 0, py - (y + 1));
      for (let z = z0; z <= z1; z++) {
        const dz = Math.max(z - pz, 0, pz - (z + 1));
        if (dx * dx + dy * dy + dz * dz < r2 && isSolid(x, y, z)) return true;
      }
    }
  }
  return false;
}

/** p が すきま r に ならない とき、近くの 固いマスから 軸ごとに 押し出す（PUSH_ROUNDS 回まで。p を 書きかえる） */
export function pushOutOfSolids(isSolid: SolidFn, p: Point3, r: number = CAMERA_CLEARANCE): void {
  for (let round = 0; round < PUSH_ROUNDS; round++) {
    let moved = false;
    const x0 = Math.floor(p.x - r);
    const x1 = Math.floor(p.x + r);
    const y0 = Math.floor(p.y - r);
    const y1 = Math.floor(p.y + r);
    const z0 = Math.floor(p.z - r);
    const z1 = Math.floor(p.z + r);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          if (!isSolid(x, y, z)) continue;
          const ex = axisPush(p.x, x, r);
          const ey = axisPush(p.y, y, r);
          const ez = axisPush(p.z, z, r);
          const dx = Math.max(x - p.x, 0, p.x - (x + 1));
          const dy = Math.max(y - p.y, 0, p.y - (y + 1));
          const dz = Math.max(z - p.z, 0, p.z - (z + 1));
          if (dx * dx + dy * dy + dz * dz >= r * r) continue;
          // いちばん 小さく 動かせば 出られる 軸だけ 動かす（めりこみが 浅い 軸）
          const ax = Math.abs(ex);
          const ay = Math.abs(ey);
          const az = Math.abs(ez);
          if (ax <= ay && ax <= az) p.x += ex;
          else if (ay <= az) p.y += ey;
          else p.z += ez;
          moved = true;
        }
    if (!moved) return;
  }
}

/** 軸 1 本で、マス [c, c+1] から r はなれる ために 動く 量（近い 側へ 出る） */
function axisPush(v: number, c: number, r: number): number {
  const toLow = c - r - v; // 負: 手前へ
  const toHigh = c + 1 + r - v; // 正: むこうへ
  return Math.abs(toLow) < Math.abs(toHigh) ? toLow : toHigh;
}

/**
 * S から (ux,uy,uz)（長さ 1）の 向きへ 進んで、まわり 半径 r に 固いブロックが 1 つも ない いちばん 遠い 長さ（0〜maxLen）。
 * S 自身が すきま 不足なら 0。
 */
export function clearDistance(
  isSolid: SolidFn,
  sx: number,
  sy: number,
  sz: number,
  ux: number,
  uy: number,
  uz: number,
  maxLen: number,
  r: number = CAMERA_CLEARANCE,
): number {
  if (!(maxLen > 0) || solidWithin(isSolid, sx, sy, sz, r)) return 0;
  let good = 0;
  for (let t = SCAN_STEP; ; t += SCAN_STEP) {
    const tt = Math.min(t, maxLen);
    if (solidWithin(isSolid, sx + ux * tt, sy + uy * tt, sz + uz * tt, r)) {
      let lo = good;
      let hi = tt;
      for (let i = 0; i < BISECT_COUNT; i++) {
        const mid = (lo + hi) / 2;
        if (solidWithin(isSolid, sx + ux * mid, sy + uy * mid, sz + uz * mid, r)) hi = mid;
        else lo = mid;
      }
      return lo;
    }
    good = tt;
    if (tt >= maxLen) return maxLen;
  }
}

/** o から (ux,uy,uz)（長さ 1）の 向きへ 進んで、固いブロックに 入る 最初の 距離（刻み RAY_STEP を 二分で 細かく）。なければ null */
export function firstSolidDistance(isSolid: SolidFn, ox: number, oy: number, oz: number, ux: number, uy: number, uz: number, maxLen: number): number | null {
  const at = (t: number) => isSolid(Math.floor(ox + ux * t), Math.floor(oy + uy * t), Math.floor(oz + uz * t));
  if (at(0)) return 0;
  for (let t = RAY_STEP; t < maxLen; t += RAY_STEP) {
    if (at(t)) {
      let lo = t - RAY_STEP;
      let hi = t;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (at(mid)) hi = mid;
        else lo = mid;
      }
      return hi;
    }
  }
  return at(maxLen) ? maxLen : null;
}
