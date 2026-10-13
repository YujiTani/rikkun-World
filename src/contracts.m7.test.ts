import { describe, expect, it } from 'vitest';
import {
  CROP_BLOCK,
  CROP_KINDS,
  M7_SETTING_DEFAULTS,
  SEED_ITEM,
  WILD_BLOCK,
  createM7Settings,
  cropKindOfBlock,
  seedKindOfItem,
  vegKindOfItem,
} from './contracts';
import { BLOCK_TYPES } from './world/blocks/blockTypes';

describe('M7 contracts', () => {
  it('新しい BlockId は 今の並びの うしろ（番号が ずれない）', () => {
    const ids = BLOCK_TYPES.map((t) => t.id);
    expect(ids.indexOf('tansu')).toBe(16);
    expect(ids.slice(17)).toEqual([
      'farmland', 'farmland_wet', 'crop_onion', 'crop_tomato', 'crop_pumpkin', 'crop_eggplant',
      'wild_onion', 'wild_tomato', 'wild_pumpkin', 'wild_eggplant', 'kakashi', 'kakashi_head', 'saku',
    ]);
  });
  it('作物・たね・やさい の ひきかえ', () => {
    for (const k of CROP_KINDS) {
      expect(cropKindOfBlock(CROP_BLOCK[k])).toEqual({ kind: k, wild: false });
      expect(cropKindOfBlock(WILD_BLOCK[k])).toEqual({ kind: k, wild: true });
      expect(seedKindOfItem(SEED_ITEM[k])).toBe(k);
      expect(vegKindOfItem(k)).toBe(k);
    }
    expect(cropKindOfBlock('grass')).toBeNull();
    expect(seedKindOfItem('onion')).toBeNull();
  });
  it('設定は 毎回 ふかいコピー', () => {
    const a = createM7Settings();
    a.farmGrowDays.dry.tomato = 99;
    a.farmYield.onion[0] = 9;
    expect(createM7Settings().farmGrowDays.dry.tomato).toBe(M7_SETTING_DEFAULTS.farmGrowDays.dry.tomato);
    expect(createM7Settings().farmYield.onion).toEqual([1, 2]);
    expect(M7_SETTING_DEFAULTS.farmYield.onion).toEqual([1, 2]);
  });
});
