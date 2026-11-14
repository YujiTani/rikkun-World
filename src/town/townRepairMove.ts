import { TOWN } from './townTuning';

/**
 * TOWN-1 1.4 §4.5d「移す 先」: もどる マスに 重なる 体を うつす 先（いちばん 近い あいて いる 地面の 上）。
 * 足もとの マスが すけない ブロック・体の 2 マスが 空気・どちらも まだ もどって いない 記録の マスで ない 所。
 * 横の きょりで 16 マス 以内（高さは 足もとの ±4 マス）を 近い 順に（同じ なら 低い 方、それでも 同じ なら z・x の 小さい 方）。
 * 1 回で 横 33×33 の 列まで。計算だけ（世界は 口で 読む）。
 */

export interface SpotWorld {
  /** すけない（立てる）ブロックか */
  isSolid(x: number, y: number, z: number): boolean;
  /** 空気か（読みこんで いない マスは false） */
  isAir(x: number, y: number, z: number): boolean;
  /** まだ もどって いない 記録の マスか */
  inRecord(x: number, y: number, z: number): boolean;
}

export interface Spot {
  x: number;
  y: number;
  z: number;
}

/** (bx, by, bz) ＝ 体の 足もと の 近くで 立てる 所。なければ null（ふんすいの 前へ） */
export function findSpot(w: SpotWorld, bx: number, by: number, bz: number): Spot | null {
  const R = TOWN.repair.moveRadius;
  const D = TOWN.repair.moveDy;
  const fx = Math.floor(bx);
  const fz = Math.floor(bz);
  const fy = Math.floor(by + 1e-6);
  let bestD = Infinity;
  let bestY = 0;
  let bestX = 0;
  let bestZ = 0;
  let found = false;
  for (let z = fz - R; z <= fz + R; z++) {
    for (let x = fx - R; x <= fx + R; x++) {
      const d2 = (x + 0.5 - bx) ** 2 + (z + 0.5 - bz) ** 2;
      if (d2 > R * R || d2 > bestD) continue;
      for (let y = fy - D; y <= fy + D; y++) {
        if (y < 1 || !w.isSolid(x, y - 1, z) || w.inRecord(x, y - 1, z) || !w.isAir(x, y, z) || w.inRecord(x, y, z) || !w.isAir(x, y + 1, z) || w.inRecord(x, y + 1, z)) continue;
        // 同じ きょりでは 低い 方（y）・z・x の 小さい 方。列の 中では 低い 方から 見る ので 最初の 1 つで よい
        if (d2 < bestD || y < bestY || (y === bestY && (z < bestZ || (z === bestZ && x < bestX)))) {
          bestD = d2;
          bestY = y;
          bestX = x;
          bestZ = z;
          found = true;
        }
        break;
      }
    }
  }
  return found ? { x: bestX + 0.5, y: bestY, z: bestZ + 0.5 } : null;
}
