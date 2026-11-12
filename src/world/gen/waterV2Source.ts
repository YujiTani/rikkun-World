import { hash01 } from './random';
import type { Ground } from './waterV2Kit';
import { WATER_TUNE as T } from './waterV2Table';

/**
 * 水源の 場所を 先に きめる: 山の 高い ほうの 帯で、池（半径 4〜7）が ほれる たいらな 肩を 全部の 向きから さがし、点数の 高い 順に ならべる。
 * 点数 = 高さ（高いほど よい）＋ 下の がけの 落差 − すそまでの 道のり。すその 近く（高さの 下 1/3）は えらばない。
 */

const S = T.source;

export interface SourceSpot {
  x: number;
  z: number;
  score: number;
}

/** 4 方向 */
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** center の まわり radius の 中で、点数の 高い 順の 水源の 場所（おたがい S.apart 以上 はなす）。base = 山の すその 高さ。free = 置いてよい 列、toFoot = すそまでの 道のり（小さい ほど よい） */
export function sourceSpots(g: Ground, cx: number, cz: number, radius: number, base: number, free: (x: number, z: number) => boolean, toFoot: (x: number, z: number) => number, seed: number): SourceSpot[] {
  let peak = base;
  for (let z = cz - radius; z <= cz + radius; z += S.step) for (let x = cx - radius; x <= cx + radius; x += S.step) peak = Math.max(peak, g(x, z));
  const spots: SourceSpot[] = [];
  for (let z = cz - radius; z <= cz + radius; z += S.step) {
    for (let x = cx - radius; x <= cx + radius; x += S.step) {
      const h = g(x, z);
      if (h < 0 || !free(x, z)) continue;
      const frac = (h - base) / Math.max(1, peak - base);
      if (frac < S.lowest) continue;
      let flat = true;
      for (let dz = -S.disk; dz <= S.disk && flat; dz += 2) {
        for (let dx = -S.disk; dx <= S.disk; dx += 2) {
          if (Math.hypot(dx, dz) > S.disk) continue;
          const hh = g(x + dx, z + dz);
          if (hh < 0 || Math.abs(hh - h) > S.flat || !free(x + dx, z + dz)) {
            flat = false;
            break;
          }
        }
      }
      if (!flat) continue;
      let drop = 0;
      for (const [dx, dz] of DIRS4) {
        const gl = g(x + dx * S.reach, z + dz * S.reach);
        if (gl >= 0) drop = Math.max(drop, h - gl);
      }
      const way = toFoot(x, z);
      const score = (frac >= S.high ? S.highBonus : 0) + frac * S.fracWeight + Math.min(drop, S.dropCap) - Math.min(Number.isFinite(way) ? way : S.wayCap, S.wayCap) * S.wayWeight + hash01(seed, x, z, 130) * 3;
      spots.push({ x, z, score });
    }
  }
  spots.sort((a, b) => b.score - a.score);
  const out: SourceSpot[] = [];
  for (const s of spots) {
    if (out.length >= S.keep) break;
    if (out.every((o) => Math.hypot(o.x - s.x, o.z - s.z) >= S.apart)) out.push(s);
  }
  return out;
}
