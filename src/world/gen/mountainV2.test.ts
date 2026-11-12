import { describe, expect, it, vi } from 'vitest';

// ?mountain=v2 の 山で ためす（MOUNTAIN_V2 は 読みこみの ときに きまる ので、import より まえに 入れる）
vi.hoisted(() => {
  (globalThis as { location?: unknown }).location = { search: '?mountain=v2' };
});

import { mountainFrame } from './biome';
import type { CountryKind } from './config';
import { SEA_Y } from '../../contracts';
import { mountainOffsetV2, v2Landmarks } from './mountainV2';
import { heightAt } from './terrain';

/** 試作（?mountain=v2）: 高さの地図の上で、すそ → 頂上・橋でつながった柱の てっぺんまで、となりの列との高さの差 1 以下で 歩けるか。形だけ と、ゲーム内の高さ（ざらざら・自然地形との max つき）の 2 とおり */

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

const R = 200;
const W = 2 * R + 1;
/** すその 判定: この 高さ（海から）以下の 列、または 四角の ふちから 歩きはじめる */
const FOOT = 3;

/** 高さの地図の上で、すそ（FOOT 以下の列）から goal まで、となりの列との差 1 以下で つながるか */
function reachable(heights: Int16Array, goals: { x: number; z: number }[]): boolean[] {
  const seen = new Uint8Array(W * W);
  const queue: number[] = [];
  for (let i = 0; i < W * W; i++) {
    const x = i % W;
    const z = (i - x) / W;
    // すそ = 低い列、または しらべる 四角の ふち（ゲーム内の高さでは ふもとの 自然の 地面が 海から +3 より 高い ことが ある）
    if (heights[i]! <= FOOT || x === 0 || z === 0 || x === W - 1 || z === W - 1) {
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

function grid(m: { seed: number; kind: CountryKind; px: number; pz: number }, game: boolean): Int16Array {
  const heights = new Int16Array(W * W);
  for (let z = -R; z <= R; z++) {
    for (let x = -R; x <= R; x++) {
      heights[(z + R) * W + x + R] = game ? heightAt(m.seed, m.px + x, m.pz + z) - SEA_Y : Math.max(0, Math.round(mountainOffsetV2(m.seed, m.kind, m.px, m.pz, m.px + x, m.pz + z)));
    }
  }
  return heights;
}

describe('山の形 v2: 登れる道', () => {
  for (const game of [false, true]) {
    for (const m of pickMountains()) {
      it(`${m.kind}（seed ${m.seed}, ${m.px}）${game ? ' ゲーム内の高さ' : ' 形だけ'}: すそから 頂上・橋の 柱まで 差 1 以下で つながる`, () => {
        const heights = grid(m, game);
        const lm = v2Landmarks(m.seed, m.kind, m.px, m.pz);
        const goals = [{ x: 0, z: 0 }, ...lm.bridged.map((b) => ({ x: b.x - m.px, z: b.z - m.pz }))];
        const ok = reachable(heights, goals);
        expect(ok[0], '頂上').toBe(true);
        expect(ok.slice(1).every(Boolean), '橋の柱').toBe(true);
      });
    }
  }
});
