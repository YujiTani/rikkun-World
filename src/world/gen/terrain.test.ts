import { describe, expect, it } from 'vitest';
import { SEA_Y, WORLD_HEIGHT } from '../../contracts';
import { startFeaturesOf } from './features';
import { biomeAt, biomeCell, heightAt, rawHeightAt, spawnOf, terrainAt } from './terrain';

/** VOX-B 受け入れ基準 3（高さ）・5（海から上がれる）・10（バイオーム）・11（スタート）・14（はじまりの木・岩山）のうち、高さだけで見られるもの */

const SEEDS_200 = Array.from({ length: 200 }, (_, i) => (i === 0 ? 20261012 : i));

describe('定数', () => {
  it('世界の高さ 352・海面 144', () => {
    expect(WORLD_HEIGHT).toBe(352);
    expect(SEA_Y).toBe(144);
  });
});

describe('基準 3: 高さ H は SEA_Y−30〜270（200 シード × 64 列）', () => {
  it('どの seed・どの場所でも範囲の中。負の座標・±30,000 でも動く', () => {
    for (const seed of SEEDS_200) {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
          const x = i * 613 - 1900 + (seed % 7);
          const z = j * 577 - 1800 - (seed % 5);
          const t = terrainAt(seed, x, z);
          expect(t.h).toBeGreaterThanOrEqual(SEA_Y - 30);
          expect(t.h).toBeLessThanOrEqual(270);
          expect(t.sea).toBe(t.h <= SEA_Y - 1);
          expect(['grassland', 'forest']).toContain(t.biome);
        }
      }
    }
    for (const [x, z] of [[30000, -30000], [-30000, 30000], [-5000, -5000], [0, 0], [-1, -1]]) {
      const t = terrainAt(20261012, x!, z!);
      expect(t.h).toBeGreaterThanOrEqual(SEA_Y - 30);
      expect(t.h).toBeLessThanOrEqual(270);
    }
  });

  it('同じ seed・同じ場所は同じ。ちがう seed はちがう', () => {
    expect(terrainAt(5, 123, -456)).toEqual(terrainAt(5, 123, -456));
    let diff = 0;
    for (let k = 0; k < 40; k++) if (terrainAt(1, k * 97, k * 53).h !== terrainAt(2, k * 97, k * 53).h) diff++;
    expect(diff).toBeGreaterThan(20);
  });

  it('陸は 6 割ほど（海は深くても 30）', () => {
    let land = 0;
    let n = 0;
    for (let s = 1; s <= 10; s++) {
      for (let i = 0; i < 40; i++) {
        for (let j = 0; j < 40; j++) {
          const t = terrainAt(s, i * 211 - 4000, j * 223 - 4000);
          n++;
          if (!t.sea) land++;
          expect(t.h).toBeGreaterThanOrEqual(SEA_Y - 30);
        }
      }
    }
    expect(land / n).toBeGreaterThan(0.45);
    expect(land / n).toBeLessThan(0.75);
  });
});

describe('基準 5: 海から上がれる', () => {
  it('水に面した陸の列から 8 マス以内では、となりとの高さの差が 1 以下（200 シード）', () => {
    let shores = 0;
    for (const seed of SEEDS_200) {
      // z = (seed ごとにずらした線) を x で歩き、陸と海の境目を見つける
      const z = (seed * 37) % 400;
      let prev = terrainAt(seed, -3000, z).sea;
      let found = 0;
      for (let x = -3000 + 4; x < 3000 && found < 4; x += 4) {
        const sea = terrainAt(seed, x, z).sea;
        if (sea !== prev) {
          found++;
          shores++;
          const N = 18;
          const g = new Int16Array(N * N); // (x−9..x+8) × (z−9..z+8)
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = rawHeightAt(seed, x - 9 + i, z - 9 + j);
          for (let j = 0; j < N - 1; j++) {
            for (let i = 0; i < N - 1; i++) {
              const h = g[j * N + i]!;
              expect(Math.abs(g[j * N + i + 1]! - h), `seed ${seed} (${x - 9 + i},${z - 9 + j})`).toBeLessThanOrEqual(1);
              expect(Math.abs(g[(j + 1) * N + i]! - h), `seed ${seed} (${x - 9 + i},${z - 9 + j})`).toBeLessThanOrEqual(1);
            }
          }
        }
        prev = sea;
      }
    }
    expect(shores).toBeGreaterThan(300);
  }, 30000);
});

describe('基準 10: バイオーム', () => {
  it('1,000 升目で 森は 25〜45%（25 シード × 40 升目。1 つの seed だけだと 大きな形のかたよりで 3〜5 割にふれる）', () => {
    let forest = 0;
    let n = 0;
    for (let seed = 1; seed <= 25; seed++) {
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 5; j++) {
          n++;
          if (biomeCell(seed, i - 4, j - 2).kind === 'forest') forest++;
        }
      }
    }
    expect(n).toBe(1000);
    expect(forest / n).toBeGreaterThanOrEqual(0.25);
    expect(forest / n).toBeLessThanOrEqual(0.45);
  });

  it('升目の点は 升目の中の 16〜111（線は 64 + 128k）', () => {
    for (const seed of [1, 2, 3]) {
      for (let i = -5; i < 5; i++) {
        for (let j = -5; j < 5; j++) {
          const c = biomeCell(seed, i, j);
          expect(c.px - (64 + 128 * i)).toBeGreaterThanOrEqual(16);
          expect(c.px - (64 + 128 * i)).toBeLessThanOrEqual(111);
          expect(c.pz - (64 + 128 * j)).toBeGreaterThanOrEqual(16);
          expect(c.pz - (64 + 128 * j)).toBeLessThanOrEqual(111);
        }
      }
    }
  });

  it('(64,64) は草原。まわり 4 升目に 森が 1 つ以上（200 シード）', () => {
    for (const seed of SEEDS_200) {
      expect(biomeAt(seed, 64, 64).kind, `seed ${seed}`).toBe('grassland');
      const kinds = [[-1, -1], [0, -1], [-1, 0], [0, 0]].map(([i, j]) => biomeCell(seed, i!, j!).kind);
      expect(kinds.filter((k) => k === 'forest').length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(kinds.filter((k) => k === 'grassland').length, `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('境目（森の重みが 0〜1 の間）をまたぐとなりの列の高さの差は、境目でない所の最大をこえない', () => {
    for (const seed of [20261012, 1, 2]) {
      let maxPure = 0;
      let maxBlend = 0;
      let blend = 0;
      for (let x = -700; x < 700; x++) {
        for (let z = -150; z < 150; z += 3) {
          const w0 = biomeAt(seed, x, z).forest;
          const w1 = biomeAt(seed, x + 1, z).forest;
          const d = Math.abs(rawHeightAt(seed, x, z) - rawHeightAt(seed, x + 1, z));
          if ((w0 > 0 && w0 < 1) || (w1 > 0 && w1 < 1)) {
            blend++;
            maxBlend = Math.max(maxBlend, d);
          } else maxPure = Math.max(maxPure, d);
        }
      }
      expect(blend).toBeGreaterThan(500);
      expect(maxBlend, `seed ${seed}`).toBeLessThanOrEqual(maxPure);
    }
  });

  it('境目の重みは なめらか（1 マスで 0.1 以内）。種類は 重み 0.5 でかわる', () => {
    for (const seed of [1, 2, 3]) {
      for (let x = -500; x < 500; x++) {
        const a = biomeAt(seed, x, 40).forest;
        const b = biomeAt(seed, x + 1, 40).forest;
        expect(Math.abs(a - b)).toBeLessThanOrEqual(0.1);
      }
    }
  });
});

describe('基準 11: スタート', () => {
  it('200 シードで fallback を使わず、P2 を満たし、(64,64) から 16 以内', () => {
    for (const seed of SEEDS_200) {
      const sp = spawnOf(seed);
      expect(sp.fallback, `seed ${seed}`).toBe(false);
      expect(Math.abs(sp.x - 64)).toBeLessThanOrEqual(16);
      expect(Math.abs(sp.z - 64)).toBeLessThanOrEqual(16);
      expect(sp.from).toEqual({ x: 64, z: 64 });
      expect(sp.checked).toBeGreaterThanOrEqual(1);
      expect(terrainAt(seed, sp.x, sp.z).biome).toBe('grassland');
      expect(sp.h).toBeGreaterThanOrEqual(SEA_Y + 2);
      expect(sp.h).toBeLessThanOrEqual(SEA_Y + 12);
      expect(sp.h).toBe(rawHeightAt(seed, sp.x, sp.z));
      let lo = 999;
      let hi = -999;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          const h = rawHeightAt(seed, sp.x + dx, sp.z + dz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
        }
      }
      expect(hi - lo, `seed ${seed}`).toBeLessThanOrEqual(2);
    }
  });

  it('同じ seed は同じ場所', () => {
    expect(spawnOf(20261012)).toEqual(spawnOf(20261012));
  });

  it('広場: 5×5 は スタートの高さ。3〜6 の列は 1 段ずつ（どの方向にも歩いて出られる）', () => {
    for (const seed of [20261012, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const sp = spawnOf(seed);
      for (let dx = -8; dx <= 8; dx++) {
        for (let dz = -8; dz <= 8; dz++) {
          const r = Math.max(Math.abs(dx), Math.abs(dz));
          const h = heightAt(seed, sp.x + dx, sp.z + dz);
          if (r <= 2) expect(h).toBe(sp.h);
          else if (r <= 6) {
            const raw = rawHeightAt(seed, sp.x + dx, sp.z + dz);
            expect(h).toBeGreaterThanOrEqual(Math.min(raw, sp.h - (r - 2)));
            expect(h).toBeLessThanOrEqual(Math.max(raw, sp.h + (r - 2)));
          }
        }
      }
    }
  });
});

describe('基準 14: はじまりの木・岩山（高さだけで分かる分）', () => {
  it('木 3 本（チェビシェフ 5〜12）、うち 1 本は 北 ±45°。岩山は スタートの北 10〜14 マス', () => {
    for (const seed of SEEDS_200) {
      const sp = spawnOf(seed);
      const f = startFeaturesOf(seed);
      expect(f.trees, `seed ${seed}`).toHaveLength(3);
      let north = 0;
      for (const t of f.trees) {
        const cheb = Math.max(Math.abs(t.x - sp.x), Math.abs(t.z - sp.z));
        expect(cheb).toBeGreaterThanOrEqual(5);
        expect(cheb).toBeLessThanOrEqual(12);
        expect(t.y).toBe(heightAt(seed, t.x, t.z) + 1);
        const ang = (Math.atan2(t.x + 0.5 - (sp.x + 0.5), -(t.z + 0.5 - (sp.z + 0.5))) * 180) / Math.PI;
        if (Math.abs(ang) <= 45) north++;
      }
      expect(north, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      const r = f.rock;
      expect(r.r).toBeGreaterThanOrEqual(3.5);
      expect(r.r).toBeLessThanOrEqual(4.5);
      expect(r.cx - sp.x).toBeGreaterThanOrEqual(-2);
      expect(r.cx - sp.x).toBeLessThanOrEqual(2);
      expect(r.cz - sp.z).toBeGreaterThanOrEqual(-14);
      expect(r.cz - sp.z).toBeLessThanOrEqual(-10);
      let maxG = -1;
      for (let x = Math.floor(r.cx - r.r); x <= Math.ceil(r.cx + r.r); x++) {
        for (let z = Math.floor(r.cz - r.r); z <= Math.ceil(r.cz + r.r); z++) {
          if (Math.hypot(x - r.cx, z - r.cz) <= r.r) maxG = Math.max(maxG, heightAt(seed, x, z));
        }
      }
      expect(maxG).toBe(r.peakY); // 頂上が中の最高
      expect(heightAt(seed, r.cx, r.cz)).toBe(r.peakY);
    }
  });
});
