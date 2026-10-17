import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX, BLOCK_TYPES } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { startFeaturesOf } from './features';
import { generateChunk } from './chunk';
import { mouthsInRegion, regionRect } from './region';
import { inMouthFootprint, mouthsNear, rampFloor, roomFloor } from './mouths';
import { heightAt, spawnOf, terrainFor } from './terrain';
import { GEN_CONFIG } from './config';

/**
 * VOX-B 受け入れ基準 8（洞くつの口）・12/13（スタートの広場）・14（はじまりの木・岩山）のうち、
 * 作った列のブロックで確かめられるもの。列は generateChunk のそのまま（VOX-D: 仮の海のふちは もう無い。16 は 22 に）。
 */

const SEEDS = [20261012, 1, 2, 3, 4, 5];
const SEEDS_20 = [20261012, ...Array.from({ length: 19 }, (_, i) => i + 1)];
const SOLID = new Set<number>(BLOCK_TYPES.map((t, i) => (t.solid ? i : -1)).filter((i) => i >= 0));

/** 読みこんだ世界の かわり（列は 必要になったとき 作る） */
function loaded(seed: number) {
  const cols = new Map<number, Uint8Array>();
  const chunk = (cx: number, cz: number): Uint8Array | null => {
    const key = (cx + 5000) * 10007 + (cz + 5000);
    let a = cols.get(key);
    if (!a) {
      a = new Uint8Array(WORLD_HEIGHT * 256);
      generateChunk(seed, cx, cz).sections.forEach((s, sy) => a!.set(sectionToArray(s), sy * SECTION_VOLUME));
      cols.set(key, a);
    }
    return a;
  };
  /** ブロックの番号。範囲の外は -1 */
  const get = (x: number, y: number, z: number): number => {
    if (y < 0 || y >= WORLD_HEIGHT) return -1;
    const a = chunk(x >> 4, z >> 4);
    return a === null ? -1 : a[(y * 16 + (z & 15)) * 16 + (x & 15)]!;
  };
  // #184: 木・草の上の物（もみじ・まつ の はっぱ、はな、すすき、たけ）は 地面ではない
  const ABOVE = new Set<number>(['air', 'water', 'log', 'leaves', 'start_torch', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'susuki', 'bamboo'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]!));
  const top = (x: number, z: number): number => {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      if (!ABOVE.has(get(x, y, z))) return y;
    }
    return -1;
  };
  return { get, top };
}

describe('スタートの広場（基準 12・13）', () => {
  it('5×5 は スタートの高さの くさ・上 3 段は空気（たいまつ はよい）・たいまつは (x+2, Hs+1, z−1)（20 シード）', () => {
    for (const seed of SEEDS_20) {
      const w = loaded(seed);
      const sp = spawnOf(seed);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          expect(w.get(sp.x + dx, sp.h, sp.z + dz), `seed ${seed}`).toBe(BLOCK_INDEX.grass);
          for (let y = sp.h + 1; y <= sp.h + 3; y++) {
            const b = w.get(sp.x + dx, y, sp.z + dz);
            expect(b === BLOCK_INDEX.air || b === BLOCK_INDEX.start_torch, `seed ${seed} (${dx},${dz},${y}) ${b}`).toBe(true);
          }
        }
      }
      expect(w.get(sp.x + GEN_CONFIG.startTorch.dx, sp.h + 1, sp.z + GEN_CONFIG.startTorch.dz)).toBe(BLOCK_INDEX.start_torch);
    }
  });

  it('4 方向（北・東・南・西）へ 1 マスずつ 歩いて 広場の外へ出られる（となりとの高さの差が 1 以下）', () => {
    for (const seed of SEEDS_20) {
      const w = loaded(seed);
      const sp = spawnOf(seed);
      for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        let prev = w.top(sp.x, sp.z);
        for (let r = 1; r <= 6; r++) {
          const h = w.top(sp.x + dx * r, sp.z + dz * r);
          expect(Math.abs(h - prev), `seed ${seed} 方向 ${dx},${dz} r=${r}`).toBeLessThanOrEqual(1);
          // 足もとの上 2 マスは 空気（広場のすぐ外では 木・岩でふさがない）
          for (let y = h + 1; y <= h + 2; y++) expect(w.get(sp.x + dx * r, y, sp.z + dz * r), `seed ${seed} r=${r} y=${y}`).toBe(BLOCK_INDEX.air);
          prev = h;
        }
      }
    }
  });
});

describe('はじまりの木・岩山（基準 14）', () => {
  it('木 3 本は みきが あり、1 本は 北 ±45° で 目から 見える。岩山に 空気に面した せきたん 6 こ以上・3 こ以上は 南の面（20 シード）', () => {
    for (const seed of SEEDS_20) {
      const w = loaded(seed);
      const sp = spawnOf(seed);
      const f = startFeaturesOf(seed);
      const eye = { x: sp.x + 0.5, y: sp.h + 1 + 1.6, z: sp.z + 0.5 };
      const firstHit = (tx: number, ty: number, tz: number): number => {
        const dx = tx - eye.x;
        const dy = ty - eye.y;
        const dz = tz - eye.z;
        const n = Math.ceil(Math.hypot(dx, dy, dz) / 0.25);
        for (let i = 1; i <= n; i++) {
          const b = w.get(Math.floor(eye.x + (dx * i) / n), Math.floor(eye.y + (dy * i) / n), Math.floor(eye.z + (dz * i) / n));
          if (SOLID.has(b)) return b;
        }
        return -1;
      };
      let northSeen = 0;
      for (const t of f.trees) {
        expect(w.get(t.x, t.y, t.z), `seed ${seed} みき`).toBe(BLOCK_INDEX.log);
        const ang = (Math.atan2(t.x + 0.5 - eye.x, -(t.z + 0.5 - eye.z)) * 180) / Math.PI;
        let visible = false;
        for (let k = 0; k < 4; k++) {
          const b = firstHit(t.x + 0.5, t.y + k + 0.5, t.z + 0.5);
          if (b === BLOCK_INDEX.log || b === BLOCK_INDEX.leaves) visible = true;
        }
        if (Math.abs(ang) <= 45 && visible) northSeen++;
      }
      expect(northSeen, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      // 岩山
      const r = f.rock;
      let coal = 0;
      let south = 0;
      const R = Math.ceil(r.r) + 1;
      for (let x = r.cx - R; x <= r.cx + R; x++) {
        for (let z = r.cz - R; z <= r.cz + R; z++) {
          if (Math.hypot(x - r.cx, z - r.cz) > r.r + 1) continue;
          for (let y = Math.max(1, r.peakY - 12); y <= r.peakY; y++) {
            if (w.get(x, y, z) !== BLOCK_INDEX.coal_ore) continue;
            const air = (dx: number, dy: number, dz: number): boolean => w.get(x + dx, y + dy, z + dz) === BLOCK_INDEX.air;
            if (air(1, 0, 0) || air(-1, 0, 0) || air(0, 1, 0) || air(0, -1, 0) || air(0, 0, 1) || air(0, 0, -1)) coal++;
            if (air(0, 0, 1)) south++;
          }
        }
      }
      expect(coal, `seed ${seed}`).toBeGreaterThanOrEqual(6);
      expect(south, `seed ${seed}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('洞くつの口（基準 8）', () => {
  it('seed 既定・1〜5 で 1 つ以上。スタートから 40 より外', () => {
    for (const seed of SEEDS) {
      const ms = mouthsInRegion(seed);
      expect(ms.length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      const sp = spawnOf(seed);
      for (const m of ms) expect(Math.max(Math.abs(m.x - sp.x), Math.abs(m.z - sp.z))).toBeGreaterThan(40);
    }
  });

  it('入り口から さか道を 1 段ずつ（自動ジャンプで）下りて へやまで行き、もどれる（20 シード）', () => {
    let total = 0;
    for (const seed of SEEDS_20) {
      const w = loaded(seed);
      const mouths = mouthsInRegion(seed);
      total += mouths.length;
      for (const m of mouths) {
        const dx = [0, 1, 0, -1][m.dir]!;
        const dz = [-1, 0, 1, 0][m.dir]!;
        const h0 = m.y - 1;
        expect(w.top(m.x, m.z), `seed ${seed} 入り口の地面`).toBe(h0);
        let prevFloor = h0 + 1;
        for (let k = 0; k < GEN_CONFIG.caves.rampLength; k++) {
          const floor = rampFloor(h0, k);
          expect(prevFloor - floor === 0 || prevFloor - floor === 1, `seed ${seed} k=${k}`).toBe(true);
          prevFloor = floor;
          for (const l of [-1, 0, 1]) {
            const x = m.x + k * dx + l * -dz;
            const z = m.z + k * dz + l * dx;
            // 自動ジャンプは 足もとの上 3.05 まで 空いていないと 跳ばない → 空気 4 マス（F〜F+3）
            for (let y = floor; y < floor + 4; y++) expect(SOLID.has(w.get(x, y, z)), `seed ${seed} 空間 k=${k} l=${l} y=${y}`).toBe(false);
          }
          // 中心線の足もとは 固い
          expect(SOLID.has(w.get(m.x + k * dx, floor - 1, m.z + k * dz)), `seed ${seed} 中心の床 k=${k}`).toBe(true);
        }
        // へや（5×5×高さ 4。1 段の自動ジャンプで さか道へ もどれるように）
        const rf = roomFloor(h0);
        expect(m.room.y).toBe(rf);
        expect(prevFloor - rf).toBeLessThanOrEqual(1);
        for (let k = GEN_CONFIG.caves.rampLength; k < GEN_CONFIG.caves.rampLength + 5; k++) {
          for (let l = -2; l <= 2; l++) {
            const x = m.x + k * dx + l * -dz;
            const z = m.z + k * dz + l * dx;
            expect(SOLID.has(w.get(x, rf - 1, z)), `seed ${seed} へやの床`).toBe(true);
            for (let y = rf; y < rf + 4; y++) expect(SOLID.has(w.get(x, y, z)), `seed ${seed} へやの空間`).toBe(false);
          }
        }
        expect(m.room).toEqual({ x: m.x + 14 * dx, y: rf, z: m.z + 14 * dz });
      }
    }
    expect(total).toBeGreaterThanOrEqual(20);
  });
});

describe('仮の海のふちが無い（VOX-D 基準 22）', () => {
  it('src に LOAD_BOUNDS・applyEdgeSea・edgeHeight を使う所が無い（src/proto と テストは のぞく）', () => {
    const bad: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name === 'proto') continue;
          walk(path);
        } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
          const text = readFileSync(path, 'utf8');
          if (/\b(LOAD_BOUNDS|applyEdgeSea|edgeHeight)\b/.test(text)) bad.push(path);
        }
      }
    };
    walk(join(process.cwd(), 'src'));
    expect(bad).toEqual([]);
  });

  it('どの列も generateChunk のそのままの形（R のはしの列も 海にならない・高さが変わらない）', () => {
    for (const seed of SEEDS_20.slice(0, 6)) {
      const R = regionRect(seed);
      const w = loaded(seed);
      for (const [x, z] of [[R.x0, R.z0], [R.x1 - 1, R.z1 - 1], [R.x0, R.z1 - 1], [R.x1 - 1, R.z0]] as const) {
        if (mouthsNear(terrainFor(seed), x >> 4, z >> 4).some((m) => inMouthFootprint(m, x, z, 1))) continue;
        expect(w.top(x, z), `seed ${seed} (${x},${z})`).toBe(heightAt(seed, x, z));
      }
    }
  });

  it('スタート・岩山の高さは 生成のまま', () => {
    for (const seed of SEEDS_20) {
      const sp = spawnOf(seed);
      const r = startFeaturesOf(seed).rock;
      const w = loaded(seed);
      expect(w.top(sp.x, sp.z)).toBe(sp.h);
      expect(w.top(r.cx, r.cz)).toBe(heightAt(seed, r.cx, r.cz));
    }
  });
});
