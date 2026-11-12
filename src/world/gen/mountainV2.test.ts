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

/**
 * なめらかな 円すい（等高線が ほぼ 円の 帯）の わりあい。山の 面積（海から 3 以上の 列）のうち、
 * 坂が ゆるやかで（0.3〜1.5）、5×5 の はんいで 坂の 向き・大きさが ほとんど かわらず、坂の 向きが 頂上から 外向き（放射）に そろう 列。
 */
const CONE = { slopeMin: 0.3, slopeMax: 1.5, flatTol: 0.25, angleTol: 30, maxShare: 0.15, area: 3 };

function coneShare(m: { seed: number; kind: CountryKind; px: number; pz: number }): number {
  const RR = 160;
  const WW = 2 * RR + 1;
  const f = new Float32Array(WW * WW);
  for (let z = -RR; z <= RR; z++) for (let x = -RR; x <= RR; x++) f[(z + RR) * WW + x + RR] = mountainOffsetV2(m.seed, m.kind, m.px, m.pz, m.px + x, m.pz + z);
  const gx = (i: number): number => (f[i + 1]! - f[i - 1]!) / 2;
  const gz = (i: number): number => (f[i + WW]! - f[i - WW]!) / 2;
  let area = 0;
  let cone = 0;
  const cosTol = Math.cos((CONE.angleTol * Math.PI) / 180);
  for (let z = -RR + 3; z <= RR - 3; z++) {
    for (let x = -RR + 3; x <= RR - 3; x++) {
      const i = (z + RR) * WW + x + RR;
      if (f[i]! < CONE.area) continue;
      area++;
      const a = gx(i);
      const b = gz(i);
      const g = Math.hypot(a, b);
      if (g < CONE.slopeMin || g > CONE.slopeMax) continue;
      let smoothOk = true;
      for (const j of [i - 2, i + 2, i - 2 * WW, i + 2 * WW]) if (Math.hypot(gx(j) - a, gz(j) - b) > CONE.flatTol) smoothOk = false;
      if (!smoothOk) continue;
      const r = Math.hypot(x, z) || 1;
      if (-(a * x + b * z) / (g * r) >= cosTol) cone++;
    }
  }
  return cone / area;
}

describe('山の形 v2: なめらかな 円すいの 帯', () => {
  for (const m of pickMountains()) {
    it(`${m.kind}（${m.px}, ${m.pz}）: 円すいの 帯が 山の 15% 以下`, () => {
      const s = coneShare(m);
      expect(s, `円すいの 帯 ${(s * 100).toFixed(1)}%`).toBeLessThanOrEqual(CONE.maxShare);
    });
  }
});
