import { describe, expect, it } from 'vitest';
import { BLOCK_TILES, TILE_NAMES, getTilePixels, buildAtlasData, ATLAS_WIDTH, ATLAS_HEIGHT } from './textures';
import { BLOCK_TYPES } from './blockTypes';
import { LIVE_COLORS, LIVE_TILE_NAMES } from './liveTextures';
import { itemIconPixels } from '../../ui/itemIcon';

const has = (name: (typeof LIVE_TILE_NAMES)[number], hexColor: string): boolean => {
  const n = parseInt(hexColor.slice(1), 16);
  return getTilePixels(name).some((c) => c[0] === ((n >> 16) & 255) && c[1] === ((n >> 8) & 255) && c[2] === (n & 255));
};

describe('LIVE-2 ブロックの 絵（こたつ・とりごや）', () => {
  it('11 まい の タイルが アトラス に ある（うしろに 足した ので 前の 番号は そのまま）', () => {
    expect(LIVE_TILE_NAMES).toHaveLength(11);
    for (const n of LIVE_TILE_NAMES) expect(TILE_NAMES, n).toContain(n);
    expect(TILE_NAMES.indexOf('grass_top')).toBe(0);
    expect(TILE_NAMES.indexOf('tansu_top')).toBe(19);
    expect(buildAtlasData()).toHaveLength(ATLAS_WIDTH * ATLAS_HEIGHT * 4);
  });

  it('どの タイルも 16×16・ぜんぶ 不透明（すきとおる 所なし。見通せない 箱）・おたがい ちがう', () => {
    const seen = new Set<string>();
    for (const n of LIVE_TILE_NAMES) {
      const px = getTilePixels(n);
      expect(px, n).toHaveLength(256);
      if (n.endsWith('_x')) expect(px.some((c) => c[3] === 0) && px.some((c) => c[3] === 255), n).toBe(true); // LIVE-2.1 の 十字の板 は すきとおる
      else expect(px.every((c) => c[3] === 255), n).toBe(true);
      const key = JSON.stringify(px);
      expect(seen.has(key), n).toBe(false);
      seen.add(key);
    }
  });

  it('こたつ: 天板 + みかん（だいだい）+ はっぱ、横 は 藍の ふとん + すその 生成りの 帯', () => {
    expect(has('kotatsu_top', LIVE_COLORS.plate)).toBe(true);
    expect(has('kotatsu_top', LIVE_COLORS.mikan)).toBe(true);
    expect(has('kotatsu_top', LIVE_COLORS.leaf)).toBe(true);
    expect(has('kotatsu_side', LIVE_COLORS.futon)).toBe(true);
    expect(has('kotatsu_side', LIVE_COLORS.hem)).toBe(true);
    // ふとん の すそ は いちばん 下 の 2 ドット
    const side = getTilePixels('kotatsu_side');
    const hem = parseInt(LIVE_COLORS.hem.slice(1), 16);
    for (let x = 0; x < 16; x++) {
      const c = side[15 * 16 + x];
      expect((c[0] << 16) | (c[1] << 8) | c[2]).toBe(hem);
    }
  });

  it('とりごや: さく = 木、のれん = 藍 + 生成りの すそ、ねぐら = 藍の やね、すばこ = わら + たまご', () => {
    expect(has('toriya_fence_side', LIVE_COLORS.wood)).toBe(true);
    expect(has('toriya_fence_side', LIVE_COLORS.woodD)).toBe(true);
    expect(has('toriya_gate', LIVE_COLORS.futon)).toBe(true);
    expect(has('toriya_gate', LIVE_COLORS.hem)).toBe(true);
    expect(has('toriya_nest_roof', LIVE_COLORS.roof)).toBe(true);
    expect(has('toriya_nest_roof', LIVE_COLORS.roofS)).toBe(true);
    expect(has('toriya_box_top', LIVE_COLORS.straw)).toBe(true);
    expect(has('toriya_box_top', LIVE_COLORS.egg)).toBe(true);
  });

  it('ブロックの 面 の 割り当て: 5 ブロック すべて 専用の 絵（たんす・き の かりの 絵を 使わない）', () => {
    for (const id of ['nukunuku', 'toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box'] as const) {
      const t = BLOCK_TILES[id];
      expect(t, id).toBeDefined();
      for (const n of t!) {
        expect(n, id).not.toMatch(/^(tansu|log)_/);
        expect(TILE_NAMES, `${id}:${n}`).toContain(n);
      }
    }
    expect(BLOCK_TILES.nukunuku).toEqual(['kotatsu_top', 'kotatsu_side', 'kotatsu_side']);
  });

  it('ブロックの 性質: こたつ・さく・ねぐら・すばこ は 固い、もん は 通れる（固くない）。ぜんぶ こわせる', () => {
    const t = (id: string) => BLOCK_TYPES.find((b) => b.id === id)!;
    expect(t('nukunuku')).toMatchObject({ name: 'こたつ', solid: true, breakable: true });
    expect(t('toriya_fence').solid).toBe(true);
    expect(t('toriya_gate').solid).toBe(false);
    expect(t('toriya_nest').solid).toBe(true);
    expect(t('toriya_box').solid).toBe(true);
    for (const id of ['toriya_fence', 'toriya_gate', 'toriya_nest', 'toriya_box']) {
      expect(t(id).breakable).toBe(true);
      expect(t(id).name).toBe('とりごや');
    }
  });

  it('こたつの アイコン は ブロックの 横の 面（持ち物で ふとん が 見える）', () => {
    expect(itemIconPixels('nukunuku')).toEqual(getTilePixels('kotatsu_side'));
  });
});
