import { CHUNK_SIZE } from '../../contracts';
import type { FeatureSite } from './countryFeatures';
import { featuresNearChunk } from './countryFeatureBlocks';
import { WATER_BLOCKS as B, WATER_V2 } from './waterV2Table';

/**
 * 水の 景色 v2: 滝が 水に 落ちる 場所（しぶきを 出す 所）。滝の ブロックから 読みとる
 * （たきつぼ ブロックの 列の となりの わきどころ = 落ちる 水の はじまり、その 列の いちばん 上の 水 = 落ちた 先）。
 * 段々の 滝は 段ごとに 1 組ずつ 出る。
 */

export interface SplashSpot {
  /** 落ちた 先の 水面の すぐ 上（ブロックの 座標） */
  x: number;
  y: number;
  z: number;
  /** 落差（マス） */
  drop: number;
}

const memo = new WeakMap<FeatureSite, readonly SplashSpot[]>();
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function spotsOf(s: FeatureSite): readonly SplashSpot[] {
  const hit = memo.get(s);
  if (hit) return hit;
  const spring = new Map<number, number>();
  const surface = new Map<number, number>();
  const key = (x: number, z: number): number => x * 100003 + z;
  for (const b of s.blocks) {
    if (b.id === B.spring) spring.set(key(b.x, b.z), Math.max(spring.get(key(b.x, b.z)) ?? -Infinity, b.y));
    else if (b.id === B.water) surface.set(key(b.x, b.z), Math.max(surface.get(key(b.x, b.z)) ?? -Infinity, b.y));
  }
  const out: SplashSpot[] = [];
  for (const b of s.blocks) {
    if (b.id !== B.pit) continue;
    const top = surface.get(key(b.x, b.z));
    if (top === undefined) continue;
    let from = -Infinity;
    for (const [dx, dz] of SIDES) from = Math.max(from, spring.get(key(b.x + dx, b.z + dz)) ?? -Infinity);
    if (from > top) out.push({ x: b.x, y: top + 1, z: b.z, drop: from - top });
  }
  memo.set(s, out);
  return out;
}

/** (px, pz) から range マス いないの しぶきの 場所（フラグが なければ いつも 空） */
export function splashSpotsNear(seed: number, px: number, pz: number, range: number, out: SplashSpot[]): SplashSpot[] {
  out.length = 0;
  if (!WATER_V2) return out;
  const seen = new Set<FeatureSite>();
  const have = new Set<number>(); // 同じ 場所を 2 回 数えない（滝が 2 つの チャンクに かかる とき）
  const r2 = range * range;
  for (let cz = Math.floor((pz - range) / CHUNK_SIZE); cz <= Math.floor((pz + range) / CHUNK_SIZE); cz++) {
    for (let cx = Math.floor((px - range) / CHUNK_SIZE); cx <= Math.floor((px + range) / CHUNK_SIZE); cx++) {
      for (const s of featuresNearChunk(seed, cx * CHUNK_SIZE, cz * CHUNK_SIZE).sites) {
        if ((s.type !== 'taki' && s.type !== 'kawa') || seen.has(s)) continue;
        seen.add(s);
        for (const p of spotsOf(s)) {
          const k = (p.x * 100003 + p.z) * 512 + p.y;
          if ((p.x - px) ** 2 + (p.z - pz) ** 2 > r2 || have.has(k)) continue;
          have.add(k);
          out.push(p);
        }
      }
    }
  }
  return out;
}
