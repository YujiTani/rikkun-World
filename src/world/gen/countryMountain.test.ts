// 古い 形（とうろう・かいだん）を 確かめる テスト: 既定は 目じるし（お堂・石段）なので ?structures=0 を はっきり 指定する（world/gen/lookFlags.ts。import より 前に きまる）
vi.hoisted(() => {
  (globalThis as { location?: unknown }).location = { search: '?trees=v1&mountain=v1&structures=0&drift=0' };
});
import { describe, expect, it, vi } from 'vitest';
import { SEA_Y } from '../../contracts';
import { mountainFrame } from './biome';
import { featuresNearChunk } from './countryFeatureBlocks';
import { featuresInRect, featureSitesTouching, kaidanPath } from './countryFeatures';
import { MOUNTAIN_TUNE } from './countryKit';
import { terrainFor } from './terrain';

/** 山の物の 道具（4b #187）: かいだんの 道・足もとで 引く 窓口・どける 四角。数と 場所の 受け入れは countryFeatures4b.test.ts */

const seed = 20261012;

/** てんぐの やまの 点（陸）を 先頭から 4 こまで */
function tenguMountains(): { px: number; pz: number }[] {
  const T = terrainFor(seed);
  const out: { px: number; pz: number }[] = [];
  for (let fz = -9; fz <= 9; fz++) {
    for (let fx = -9; fx <= 9; fx++) {
      const m = mountainFrame(seed, fx, fz).mountain;
      if (m && m.kind === 'tengu' && T.height(m.px, m.pz) >= SEA_Y) out.push({ px: m.px, pz: m.pz });
    }
  }
  return out.slice(0, 4);
}

function firstKaidan(): { f: ReturnType<typeof featuresInRect>[number]; path: ReturnType<typeof kaidanPath> } {
  for (const m of tenguMountains()) {
    const f = featuresInRect(seed, m.px - 150, m.pz - 150, m.px + 150, m.pz + 150).find((q) => q.type === 'kaidan');
    if (f) return { f, path: kaidanPath(seed, f) };
  }
  throw new Error('かいだんが 見つからない');
}

describe('かいだんの 道（kaidanPath）', () => {
  it('かいだん以外・ない 物には 空を 返す', () => {
    expect(kaidanPath(seed, { type: 'touro', cx: 0, cz: 0, x: 0, y: 0, z: 0 })).toEqual([]);
  });

  it('1 歩に 2 マス・長さは 下限 以上・同じ マスは 2 回 でない・返した 道を 書きかえても 中は かわらない', () => {
    const { f, path } = firstKaidan();
    expect(path.length).toBeGreaterThanOrEqual(MOUNTAIN_TUNE.kaidan.minSteps * MOUNTAIN_TUNE.kaidan.width);
    expect(path.length % MOUNTAIN_TUNE.kaidan.width).toBe(0);
    expect(new Set(path.map((p) => `${p.x},${p.z}`)).size).toBe(path.length);
    path[0]!.y = -1;
    expect(kaidanPath(seed, f)[0]!.y).not.toBe(-1);
  });
});

describe('かいだんの 足もと', () => {
  it('道の すその チャンクからも 見つかる（基準の マスから 遠くても）。木・草花を どける 四角が 道の マスを おおう', () => {
    const { f, path } = firstKaidan();
    const end = path[path.length - 1]!;
    expect(Math.max(Math.abs(end.x - f.x), Math.abs(end.z - f.z)), '基準から 遠い すそ').toBeGreaterThan(40);
    const x0 = (end.x >> 4) * 16;
    const z0 = (end.z >> 4) * 16;
    expect(featureSitesTouching(seed, x0, z0, x0 + 15, z0 + 15).some((s) => s.type === 'kaidan' && s.x === f.x && s.z === f.z)).toBe(true);
    const near = featuresNearChunk(seed, x0, z0);
    for (const p of path) {
      if (p.x < x0 || p.x > x0 + 15 || p.z < z0 || p.z > z0 + 15) continue;
      expect(near.plants.some((r) => p.x >= r[0] && p.x <= r[2] && p.z >= r[1] && p.z <= r[3]), `草花の 四角 (${p.x},${p.z})`).toBe(true);
      expect(near.trees.some((r) => p.x >= r[0] && p.x <= r[2] && p.z >= r[1] && p.z <= r[3]), `木の 四角 (${p.x},${p.z})`).toBe(true);
    }
  });

  it('山から はなれた チャンクには 山の物の 足もとが ない', () => {
    const m = tenguMountains()[0]!;
    expect(featureSitesTouching(seed, m.px + 900, m.pz + 900, m.px + 915, m.pz + 915).filter((s) => ['touro', 'kaidan'].includes(s.type))).toEqual([]);
  });
});
