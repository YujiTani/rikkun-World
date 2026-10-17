import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MICRO_FOREST, MICRO_PARAMS, microMix, microSurfaceHeight, newSample, sampleSurface, type ColumnSource } from './microSurface';

/** ブロックの高さ（y）を関数で決める ColumnSource */
function heightSource(ty: (bx: number, bz: number) => number, reach = 8): ColumnSource {
  return { surfaceY: ty, reach: () => reach, rockOk: () => true };
}
const stepSource = heightSource((bx) => (bx < 0 ? 5 : 6)); // x = 0 で 1 ブロック上がる
const flat = heightSource(() => 5);

describe('S（小ブロックの表面の高さ）', () => {
  it('同じ入力からは いつも同じ（決定的）', () => {
    for (let i = 0; i < 200; i++) {
      const mx = (i * 37) % 300 - 40;
      const mz = (i * 91) % 300 - 40;
      expect(microSurfaceHeight(mx, mz, stepSource)).toBe(microSurfaceHeight(mx, mz, stepSource));
    }
  });

  it('はんい: ブロックの底 +3 以上、上のへり + reach 以下。地面が無い列は -1', () => {
    const none = heightSource((bx) => (bx === 3 ? -1 : 4), 8);
    for (let mx = -30; mx < 60; mx++) {
      for (let mz = 0; mz < 40; mz++) {
        const h = microSurfaceHeight(mx, mz, none);
        if (Math.floor(mx / 9) === 3) expect(h).toBe(-1);
        else {
          expect(h).toBeGreaterThanOrEqual(4 * 9 + MICRO_PARAMS.minAboveBase);
          expect(h).toBeLessThanOrEqual(5 * 9 + 8);
        }
      }
    }
    const noReach = heightSource(() => 4, 0);
    for (let mx = 0; mx < 80; mx++) expect(microSurfaceHeight(mx, 7, noReach)).toBeLessThanOrEqual(5 * 9);
  });

  it('1 ブロックの段差: 坂（となりあう列の差が 1 マス）と 崖（差が 4 マス以上）が まざる', () => {
    // x = 0 の境目（mx = -1 と 0）を z に沿って 見る。辺は 9 マスごとに 別の辺（bz）
    const diffs = new Map<number, number>();
    for (let bz = -60; bz < 60; bz++) {
      let d = 0;
      for (let k = 0; k < 9; k++) d += microSurfaceHeight(0, bz * 9 + k, stepSource) - microSurfaceHeight(-1, bz * 9 + k, stepSource);
      const avg = Math.round(d / 9);
      diffs.set(avg, (diffs.get(avg) ?? 0) + 1);
    }
    let slope = 0;
    let cliff = 0;
    for (const [d, n] of diffs) {
      if (d <= 3) slope += n;
      else cliff += n;
    }
    expect(slope).toBeGreaterThan(10);
    expect(cliff).toBeGreaterThan(10);
  });

  it('ゆるい坂: 1 小ブロックずつ上がる（隣の列との差は ほとんど 0〜2）', () => {
    let small = 0;
    let total = 0;
    for (let bz = -40; bz < 40; bz++) {
      const z = bz * 9 + 4;
      const a = microSurfaceHeight(-1, z, stepSource);
      const b = microSurfaceHeight(0, z, stepSource);
      if (b - a <= 3) {
        total++;
        if (Math.abs(b - a) <= 2) small++;
      }
    }
    expect(total).toBeGreaterThan(10);
    expect(small / total).toBeGreaterThan(0.7);
  });

  it('岩: ブロックをまたぐ大きさ（3〜12 マス）で出っぱる', () => {
    const s = newSample();
    const cells = new Set<string>();
    let minX = 1e9;
    let maxX = -1e9;
    for (let mx = 0; mx < 400; mx++) {
      for (let mz = 0; mz < 400; mz++) {
        sampleSurface(mx, mz, flat, s);
        if (s.rock) cells.add(`${mx},${mz}`);
      }
    }
    expect(cells.size).toBeGreaterThan(50);
    // 連なった岩のかたまり（4 近傍）の大きさ
    const seen = new Set<string>();
    const widths: number[] = [];
    for (const key of cells) {
      if (seen.has(key)) continue;
      const stack = [key];
      seen.add(key);
      minX = 1e9;
      maxX = -1e9;
      let minZ = 1e9;
      let maxZ = -1e9;
      while (stack.length) {
        const [x, z] = stack.pop()!.split(',').map(Number);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${z + dz}`;
          if (cells.has(k) && !seen.has(k)) {
            seen.add(k);
            stack.push(k);
          }
        }
      }
      widths.push(Math.max(maxX - minX + 1, maxZ - minZ + 1));
    }
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...widths)).toBeLessThanOrEqual(13);
    expect(widths.some((w) => w > 9)).toBe(true); // 1 ブロックより大きい（またぐ）
  });
});

// ---- VOX-B 基準 21: 草原の S は今の S と同じ・森の境目で MICRO_PARAMS がまざる

/** 今の S（VOX-B より前の microSurface.ts）で 同じ入力から 出した 値の FNV-1a（-300〜299 の 600×600 小ブロック。h・ground・rock） */
const GOLDEN: Record<string, number> = { flat: 20207809, step: 1800674323, hilly: 991219573 };
const SOURCES: Record<string, (bx: number, bz: number) => number> = {
  flat: () => 5,
  step: (bx) => (bx < 0 ? 5 : 6),
  hilly: (bx, bz) => 4 + ((((bx * 7 + bz * 13) % 4) + 4) % 4),
};
function checksum(src: ColumnSource): number {
  const s = newSample();
  let h = 0x811c9dc5;
  for (let mz = -300; mz < 300; mz++) {
    for (let mx = -300; mx < 300; mx++) {
      sampleSurface(mx, mz, src, s);
      for (const v of [s.h, s.ground, s.rock ? 1 : 0]) {
        h ^= v & 0xffff;
        h = Math.imul(h, 0x01000193);
      }
    }
  }
  return h | 0;
}

describe('小ブロック地形 S（バイオーム）', () => {
  for (const name of Object.keys(SOURCES)) {
    it(`草原（森の重み 0）の S は 今の S と同じ: ${name}`, () => {
      const ty = SOURCES[name]!;
      const plain: ColumnSource = { surfaceY: ty, reach: () => 8, rockOk: () => true };
      expect(checksum(plain)).toBe(GOLDEN[name]);
      expect(checksum({ ...plain, forest: () => 0 })).toBe(GOLDEN[name]);
    });
  }

  it('森の重みで MICRO_PARAMS がまざる（0 = 草原、1 = 森、間は なめらか）', () => {
    expect(microMix(0)).toEqual({
      tuftThreshold: MICRO_PARAMS.tuft.threshold,
      rockChance: MICRO_PARAMS.rock.chance,
      soilThreshold: MICRO_PARAMS.soil.threshold,
    });
    expect(microMix(1)).toEqual({
      tuftThreshold: MICRO_FOREST.tuft.threshold,
      rockChance: MICRO_FOREST.rock.chance,
      soilThreshold: MICRO_FOREST.soil.threshold,
    });
    // 境目 16 ブロック: bx 0 → 16 で 重みが 0 → 1。数は 間を 一方向に動く
    const band = Array.from({ length: 17 }, (_, i) => microMix(i / 16));
    for (let i = 1; i < band.length; i++) {
      const sign = Math.sign(MICRO_FOREST.rock.chance - MICRO_PARAMS.rock.chance) || 1;
      expect((band[i]!.rockChance - band[i - 1]!.rockChance) * sign).toBeGreaterThanOrEqual(0);
    }
    const mid = microMix(0.5);
    expect(mid.rockChance).toBeCloseTo((MICRO_PARAMS.rock.chance + MICRO_FOREST.rock.chance) / 2, 10);
    expect(microMix(-1)).toEqual(microMix(0));
    expect(microMix(2)).toEqual(microMix(1));
  });

  it('森の列では 岩が 草原より 多く出る（同じ地面で 重み 0 と 1 をくらべる）', () => {
    const rocks = (w: number): number => {
      const src: ColumnSource = { surfaceY: () => 5, reach: () => 8, rockOk: () => true, forest: () => w };
      const s = newSample();
      let n = 0;
      for (let mz = 0; mz < 400; mz++) for (let mx = 0; mx < 400; mx++) {
        sampleSurface(mx, mz, src, s);
        if (s.rock) n++;
      }
      return n;
    };
    const g = rocks(0);
    const f = rocks(1);
    expect(f).not.toBe(g);
    expect(Math.abs(f - g)).toBeGreaterThan(0);
  });

  it('src/world は src/proto/voxel/terrain を import しない', () => {
    const root = join(process.cwd(), 'src', 'world');
    const bad: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && name !== 'microSurface.test.ts' && /proto\/voxel\/terrain/.test(readFileSync(p, 'utf8'))) bad.push(p);
      }
    };
    walk(root);
    expect(bad).toEqual([]);
  });
});
