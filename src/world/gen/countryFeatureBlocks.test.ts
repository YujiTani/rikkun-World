import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { generateChunk } from './chunk';
import { columnKey, featuresNearChunk } from './countryFeatureBlocks';
import { FEATURE_TUNE, featureSitesInRect } from './countryFeatures';
import { terrainFor } from './terrain';
import { countryCell } from './biome';
import { findCountry } from './biomeHook';

/** 国だけの物の チャンクへの 置き方（VOX-I-4a）: どける・覚える・地面の 高さの 答え。数・場所は countryFeatures.test.ts */

const seed = 20261012;

/** その 国の 升目を 順に 見て、はじめに 見つかる その 種類の 物（海の 升目は とばす） */
function firstOf(kind: 'hana' | 'harappa', type: string) {
  for (let j = -20; j <= 20; j++) {
    for (let i = -20; i <= 20; i++) {
      const c = countryCell(seed, i, j);
      if (c.kind !== kind || c.startForced) continue;
      const s = featureSitesInRect(seed, c.px - 60, c.pz - 60, c.px + 60, c.pz + 60).find((f) => f.type === type);
      if (s !== undefined) return s;
    }
  }
  throw new Error(`${type} が 見つからない`);
}

describe('countryFeatureBlocks', () => {
  it('チャンクごとの 答えは 覚える（同じ 物を 返す）。物が ない 所は 空', () => {
    const p = findCountry(seed, 'hana', { x: 0, z: 0 });
    const a = featuresNearChunk(seed, (p.x >> 4) * 16, (p.z >> 4) * 16);
    expect(featuresNearChunk(seed, (p.x >> 4) * 16, (p.z >> 4) * 16)).toBe(a);
    expect(featuresNearChunk(seed, 100000, 100000).sites).toEqual([]);
  });

  it('ひまわりの まわり（足もとから treeMargin 以内に みきが ある 木）は 生成で のこらない', () => {
    const s = firstOf('hana', 'himawari');
    const cx = s.x >> 4;
    const cz = s.z >> 4;
    const arr = new Uint16Array(WORLD_HEIGHT * 256);
    generateChunk(seed, cx, cz).sections.forEach((sec, sy) => arr.set(sectionToArray(sec), sy * SECTION_VOLUME));
    const at = (x: number, y: number, z: number): number => arr[(y * 16 + (z & 15)) * 16 + (x & 15)]!;
    const m = FEATURE_TUNE.treeMargin;
    for (let dz = -m; dz <= m; dz++) {
      for (let dx = -m; dx <= m; dx++) {
        const x = s.x + dx;
        const z = s.z + dz;
        if (x >> 4 !== cx || z >> 4 !== cz) continue;
        for (let y = 1; y < WORLD_HEIGHT; y++) expect(at(x, y, z), `(${x},${y},${z})`).not.toBe(BLOCK_INDEX.log);
      }
    }
    expect(at(s.x, s.y, s.z)).toBe(BLOCK_INDEX.himawari);
  });

  it('はたけあと・つきみの いわの 列は 「地面の 高さが かわる 列」に 入る（surface が 読む）', () => {
    const t = terrainFor(seed);
    const s = firstOf('harappa', 'hatakeato');
    const f = featuresNearChunk(seed, (s.x >> 4) * 16, (s.z >> 4) * 16);
    expect(f.ground.get(columnKey(s.x, s.z))).toBe(s.y - 1);
    expect(t.height(s.x, s.z)).toBeGreaterThanOrEqual(s.y - 1);
  });
});
