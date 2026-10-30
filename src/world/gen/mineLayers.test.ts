import { describe, expect, it } from 'vitest';
import { WORLD_HEIGHT } from '../../contracts';
import { createMineHook } from './mineHook';

/**
 * MINE-1A（docs/design/MINE-1.md）受け入れ基準 A1: 3 つの 層（§4.1）。
 *   窓口 `window.__rikkun.mine`（§6.1）のうち、生成の 計算だけで 答える 物。ゲームを 起動しなくても 読める
 *   （biome の `createBiomeHook` と 同じ。置く 場所は src/world/gen/mineHook.ts。名前と 形は §6.1 の とおり）。
 *     layers()  → { id: 'asai' | 'nakahodo' | 'fukai'; minY: number; maxY: number | null }[]（asai の maxY は null ＝ 地面まで）
 *     layerAt(y) → 'asai' | 'nakahodo' | 'fukai' | null
 */

const mine = createMineHook({ seed: 20261012 });
type LayerId = 'asai' | 'nakahodo' | 'fukai';

describe('A1: layerAt（高さだけで 層が きまる）', () => {
  it('96 → asai・95 → nakahodo・52 → nakahodo・51 → fukai・1 → fukai・0 → null・200 → asai', () => {
    expect(mine.layerAt(96)).toBe('asai');
    expect(mine.layerAt(95)).toBe('nakahodo');
    expect(mine.layerAt(52)).toBe('nakahodo');
    expect(mine.layerAt(51)).toBe('fukai');
    expect(mine.layerAt(1)).toBe('fukai');
    expect(mine.layerAt(0)).toBeNull();
    expect(mine.layerAt(200)).toBe('asai');
  });

  it('世界の いちばん上までは asai・y 0 より 下は null', () => {
    expect(mine.layerAt(WORLD_HEIGHT - 1)).toBe('asai');
    expect(mine.layerAt(-1)).toBeNull();
    expect(mine.layerAt(-100)).toBeNull();
  });
});

describe('A1: layers()', () => {
  const byId = (id: LayerId) => mine.layers().find((l) => l.id === id);

  it('§4.1 の 表と 同じ: asai 96〜地面（maxY null）・nakahodo 52〜95・fukai 1〜51', () => {
    expect(byId('asai')).toEqual({ id: 'asai', minY: 96, maxY: null });
    expect(byId('nakahodo')).toEqual({ id: 'nakahodo', minY: 52, maxY: 95 });
    expect(byId('fukai')).toEqual({ id: 'fukai', minY: 1, maxY: 51 });
  });

  it('層は 3 つの id だけ（同じ id が 2 回 出ない）', () => {
    const ids = mine.layers().map((l) => l.id);
    expect(new Set(ids)).toEqual(new Set<LayerId>(['asai', 'nakahodo', 'fukai']));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('layerAt は layers() の 高さと いつも 同じ（y = -5 〜 世界の上 +5 の ぜんぶ）。すきまも 重なりも ない', () => {
    const ls = mine.layers();
    for (let y = -5; y <= WORLD_HEIGHT + 5; y++) {
      const hit = ls.filter((l) => y >= l.minY && (l.maxY === null || y <= l.maxY)).map((l) => l.id);
      if (y < 1) expect(hit, `y=${y}`).toEqual([]);
      else expect(hit, `y=${y}`).toHaveLength(1);
      expect(mine.layerAt(y), `y=${y}`).toBe(hit[0] ?? null);
    }
  });
});

describe('A1: 層は 高さだけで 決まる（場所・国・シードに よらない）', () => {
  it('べつの シードでも 同じ', () => {
    const other = createMineHook({ seed: 3 });
    expect(other.layers()).toEqual(mine.layers());
    for (const y of [0, 1, 51, 52, 95, 96, 200]) expect(other.layerAt(y), `y=${y}`).toBe(mine.layerAt(y));
  });
});
