import { describe, expect, it } from 'vitest';
import { itemType } from '../../inventory/items';
import { dugItemOf } from '../../dig/dugItems';
import { DIG_DEFAULTS } from '../../dig/config';
import { BLOCK_INDEX, BLOCK_TYPES, isCrossIndex } from './blockTypes';
import { EMISSION, OPACITY } from '../light/opacity';
import { WAFU_GRIDS } from './wafuTiles';
import { paintGrid } from './voxI4aTiles';

/** WAFU-1: わふうの 4 ブロック（かわら・しっくいは 前から ある物を 使う） */
const type = (id: string) => BLOCK_TYPES.find((t) => t.id === id);

describe('WAFU-1: わふうの ブロック', () => {
  for (const id of ['shu_ita', 'ishidatami', 'koke_ishi']) {
    it(`${id}: 固くて、こわせて、持てて、置ける`, () => {
      expect(type(id)!.solid).toBe(true);
      expect(type(id)!.breakable).toBe(true);
      expect(itemType(id)?.placeBlock).toBe(id);
      expect(dugItemOf(id as never)).toBe(id);
    });
  }
  it('ほる かたさ: き = log、いし = stone', () => {
    const h = DIG_DEFAULTS.hardness as Record<string, number | null>;
    expect(h.shu_ita).toBe(h.log);
    expect(h.ishidatami).toBe(h.stone);
    expect(h.koke_ishi).toBe(h.stone);
  });
  it('chouchin: 通れる・こわせる・持てる・置ける・光 12・光を 通す・十字の 板', () => {
    expect(type('chouchin')!.solid).toBe(false);
    expect(type('chouchin')!.breakable).toBe(true);
    expect(itemType('chouchin')?.placeBlock).toBe('chouchin');
    expect(EMISSION[BLOCK_INDEX.chouchin]).toBe(12);
    expect(OPACITY[BLOCK_INDEX.chouchin]).toBe(0);
    expect(isCrossIndex(BLOCK_INDEX.chouchin)).toBe(true);
  });
  it('ちょうちんの 絵は まわりが すける（alpha 0）、ほかの 3 つは 全面 ぬり', () => {
    const alphas = (g: (typeof WAFU_GRIDS)[keyof typeof WAFU_GRIDS]) => paintGrid(g).map((p) => p[3]);
    expect(alphas(WAFU_GRIDS.chouchin).some((a) => a === 0)).toBe(true);
    for (const k of ['shu_ita', 'ishidatami', 'koke_ishi'] as const) expect(alphas(WAFU_GRIDS[k]).every((a) => a === 255), k).toBe(true);
  });
  it('lk_ の 頭は 使わない・かわら/しっくいは 1 つずつ', () => {
    for (const id of ['shu_ita', 'ishidatami', 'koke_ishi', 'chouchin']) expect(id.startsWith('lk_')).toBe(false);
    expect(BLOCK_TYPES.filter((t) => t.id === 'kawara' || t.id === 'shikkui')).toHaveLength(2);
  });
});
