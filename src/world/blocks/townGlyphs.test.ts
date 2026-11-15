import { describe, expect, it } from 'vitest';
import { GLYPHS } from './townGlyphs';
import { TOWN_BLOCK_DEFS, TOWN_EXTRA_TILE_DEFS } from './townBlocks';

/** かんばんの ドット字: 14×14・字が 読める くらいの 点の 数・使う 字は ぜんぶ そろって いる */
describe('かんばんの 字', () => {
  it('どの 字も 14×14 で、点が 20〜90 こ', () => {
    for (const [k, rows] of Object.entries(GLYPHS)) {
      if (k === '') continue;
      expect(rows, k).toHaveLength(14);
      for (const r of rows) expect(r, k).toMatch(/^[.#]{14}$/);
      const n = rows.join('').split('#').length - 1;
      expect(n, `${k} の 点`).toBeGreaterThanOrEqual(20);
      expect(n, `${k} の 点`).toBeLessThanOrEqual(90);
    }
  });

  it('ブロックの 絵が 使う 字は ぜんぶ ある', () => {
    for (const d of [...TOWN_BLOCK_DEFS, ...TOWN_EXTRA_TILE_DEFS]) {
      if (d.art.pat !== 'glyph') continue;
      const name = d.art.acc[1] ?? '';
      expect(GLYPHS[name], `${d.id} の 字 ${name}`).toBeDefined();
    }
  });
});
