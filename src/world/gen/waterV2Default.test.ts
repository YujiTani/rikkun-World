import { describe, expect, it } from 'vitest';
import { featureSitesTouching } from './countryFeatures';
import { groundFn } from './countryStructureKit';
import { type Ctx } from './countryKit';
import { terrainFor } from './terrain';
import { plainShaftWorld } from './mineShafts';
import { waterSites } from './waterV2';
import { waterLeaks } from './waterV2Kit';
import { WATER_V2 } from './waterV2Table';

// 何も 指定しない（既定の 世界）。水 v2 が 出る・はじまりの 範囲に は 出ない（yuzu 2026-11-13）
const seed = 20261012;
const T = terrainFor(seed);
const WATER = new Set(['taki', 'kawa', 'ike']);
/** はじまりの 範囲（ブロック。biome の startRadius 48 より 広く 見る） */
const START = 120;

describe('水 v2 は 既定で 出る', () => {
  it('フラグが 入って いる', () => {
    expect(WATER_V2).toBe(true);
  });

  it('滝のある 山が あり、水は もれない', () => {
    let withFall = 0;
    for (let j = -8; j <= 8; j++) {
      for (let i = -8; i <= 8; i++) {
        const cell = T.map.cell(i, j);
        if (!cell.mountain || cell.i !== i || cell.j !== j) continue;
        const c: Ctx = { T, i, j, px: cell.px, pz: cell.pz, kind: cell.kind, shafts: plainShaftWorld(seed) };
        const sites = waterSites(c, []);
        if (sites.some((s) => s.type === 'taki')) withFall++;
        const g = groundFn(c);
        expect(waterLeaks(sites.flatMap((s) => s.blocks), (x, z) => (g(x, z) >= 0 ? g(x, z) : T.height(x, z))), `mountain ${cell.px},${cell.pz}`).toEqual([]);
      }
    }
    expect(withFall).toBeGreaterThan(0);
  }, 40_000); // 単体 9.4 秒 → 4 倍で 40 秒

  it('はじまりの 範囲には 滝・川・池が 出ない', () => {
    const near = featureSitesTouching(seed, -START, -START, START, START).filter((s) => WATER.has(s.type));
    expect(near.map((s) => `${s.type} ${s.x},${s.z}`)).toEqual([]);
  });
});
