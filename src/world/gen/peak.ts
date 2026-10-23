import { countryCell } from './biome';
import { GEN_CONFIG as C } from './config';
import { heightAt } from './terrain';

/**
 * 山の 頂上（COUNTRY-1 §5.2。`visit.peak` の 判定の もと）。
 * その場所から いちばん近い 山の点の 頂上 = 点から 6 以内で いちばん高い列（生成の高さ。同じなら 点に近い方。VOX-I §2.3）。
 * `h` は その列に 立てる y（生成の高さ + 1）。近くに 山が なければ null。
 */
export interface Peak {
  x: number;
  z: number;
  h: number;
}

const POINT_RADIUS = 6;
/** 升目を この数 ひろげて さがす（山の点は 4 升目で 1 つ） */
const SEARCH_CELLS = 4;
const cache = new Map<string, Peak>();

function peakOfPoint(seed: number, px: number, pz: number): Peak {
  const key = `${seed}|${px}|${pz}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let best: Peak = { x: px, z: pz, h: -Infinity };
  let bestD = Infinity;
  for (let dz = -POINT_RADIUS; dz <= POINT_RADIUS; dz++) {
    for (let dx = -POINT_RADIUS; dx <= POINT_RADIUS; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > POINT_RADIUS) continue;
      const h = heightAt(seed, px + dx, pz + dz);
      if (h > best.h || (h === best.h && d < bestD)) {
        best = { x: px + dx, z: pz + dz, h };
        bestD = d;
      }
    }
  }
  const out = { x: best.x, z: best.z, h: best.h + 1 };
  if (cache.size >= 64) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}

export function peakNear(seed: number, x: number, z: number): Peak | null {
  const cell = C.biome.cell;
  const i0 = Math.floor((x - C.anchor.x) / cell);
  const j0 = Math.floor((z - C.anchor.z) / cell);
  let bestD = Infinity;
  let bx = 0;
  let bz = 0;
  for (let j = j0 - SEARCH_CELLS; j <= j0 + SEARCH_CELLS; j++) {
    for (let i = i0 - SEARCH_CELLS; i <= i0 + SEARCH_CELLS; i++) {
      const c = countryCell(seed, i, j);
      if (!c.mountain) continue;
      const d = Math.hypot(c.px - x, c.pz - z);
      if (d < bestD) {
        bestD = d;
        bx = c.px;
        bz = c.pz;
      }
    }
  }
  if (bestD === Infinity) return null;
  return { ...peakOfPoint(seed, bx, bz) };
}
