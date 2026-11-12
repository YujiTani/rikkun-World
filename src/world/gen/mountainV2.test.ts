import { describe, expect, it } from 'vitest';
import { mountainFrame } from './biome';
import type { CountryKind } from './config';
import { mountainOffsetV2, v2Landmarks } from './mountainV2';

/** 試作（?mountain=v2）: 高さの地図の上で、すそ → 頂上・橋でつながった柱の てっぺんまで、となりの列との高さの差 1 以下で 歩けるか */

/** しらべる 山: 種類ごとに 2 つ（seed の 小さい 順に 山のわくを 見る） */
function pickMountains(): { seed: number; kind: CountryKind; px: number; pz: number }[] {
  const picks: { seed: number; kind: CountryKind; px: number; pz: number }[] = [];
  const count: Record<string, number> = {};
  for (const seed of [3, 11, 5, 7, 9, 13]) {
    for (let fz = -3; fz <= 3; fz++) {
      for (let fx = -3; fx <= 3; fx++) {
        const m = mountainFrame(seed, fx, fz).mountain;
        if (!m) continue;
        count[m.kind] = count[m.kind] ?? 0;
        if (count[m.kind]! >= 2) continue;
        count[m.kind]!++;
        picks.push({ seed, kind: m.kind, px: m.px, pz: m.pz });
      }
    }
  }
  return picks;
}

const R = 140;
const W = 2 * R + 1;
/** すその 判定: この 高さ（海から）以下の 列から 歩きはじめる */
const FOOT = 3;

/** 高さの地図の上で、すそ（FOOT 以下の列）から goal まで、となりの列との差 1 以下で つながるか */
function reachable(heights: Int16Array, goals: { x: number; z: number }[]): boolean[] {
  const seen = new Uint8Array(W * W);
  const queue: number[] = [];
  for (let i = 0; i < W * W; i++) {
    if (heights[i]! <= FOOT) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const x = i % W;
    const z = (i - x) / W;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]] as const) {
      if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
      const j = nz * W + nx;
      if (seen[j] || Math.abs(heights[j]! - heights[i]!) > 1) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return goals.map((g) => seen[(Math.round(g.z) + R) * W + Math.round(g.x) + R] === 1);
}

describe('山の形 v2: 登れる道', () => {
  for (const m of pickMountains()) {
    it(`${m.kind}（seed ${m.seed}）: すそから 頂上・橋の 柱まで 差 1 以下で つながる`, () => {
      const heights = new Int16Array(W * W);
      for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) heights[(z + R) * W + x + R] = Math.max(0, Math.round(mountainOffsetV2(m.seed, m.kind, m.px, m.pz, m.px + x, m.pz + z)));
      const lm = v2Landmarks(m.seed, m.kind, m.px, m.pz);
      const goals = [{ x: 0, z: 0 }, ...lm.bridged.map((b) => ({ x: b.x - m.px, z: b.z - m.pz }))];
      const ok = reachable(heights, goals);
      expect(ok[0], '頂上').toBe(true);
      expect(ok.slice(1).every(Boolean), '橋の柱').toBe(true);
    });
  }
});
