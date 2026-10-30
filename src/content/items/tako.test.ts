import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS } from '../../contracts';
import { CRAFT_RECIPES } from '../../craft/recipes';
import { itemRarity } from '../../drops/rarity';
import { itemType } from '../../inventory/items';
import { itemIconPixels } from '../../ui/itemIcon';
import { itemCategory } from '../../ui/itemCategory';
import { getTilePixels } from '../../world/blocks/textures';
import { ITEM_DEFS } from './registry';

/** TAKO-1 AC17〜19（docs/design/TAKO-1.md §4.4）: すみ・ふで */
describe('AC17: すみ・ふでの 定義', () => {
  it('すみ: 重ね 64・ざいりょう・common', () => {
    expect(itemType('sumi')).toEqual({ id: 'sumi', name: 'すみ', maxStack: 64, placeBlock: null });
    expect(itemCategory('sumi')).toBe('material');
    expect(itemRarity('sumi')).toBe('common');
  });
  it('ふで: 重ね 1・道具・uncommon・たいきゅう 5', () => {
    expect(itemType('fude')).toEqual({ id: 'fude', name: 'ふで', maxStack: 1, placeBlock: null });
    expect(itemCategory('fude')).toBe('tool');
    expect(itemRarity('fude')).toBe('uncommon');
    expect(ITEM_DEFS.fude.wear).toBe(5);
  });
  it('2D の 絵が 石の 絵に 落ちない', () => {
    const stone = getTilePixels('stone');
    for (const id of ['sumi', 'fude'] as const) {
      const px = itemIconPixels(id);
      expect(px, id).toHaveLength(256);
      expect(px.some((p) => p[3] > 0), id).toBe(true);
      expect(JSON.stringify(px), id).not.toBe(JSON.stringify(stone));
    }
    // 黒っぽい すみ と 竹色＋黒の ふで
    expect(itemIconPixels('sumi').filter((p) => p[3] > 0 && p[0] < 0x80 && p[1] < 0x80).length).toBeGreaterThan(60);
  });
});

describe('AC18: ふでの 作り方', () => {
  it('作業台で すみ 1 ＋ たけ 2 → ふで 1', () => {
    const r = CRAFT_RECIPES.find((x) => x.id === 'fude')!;
    expect(r.station).toBe('craft');
    expect(r.works).toBe(true);
    expect(r.output).toEqual({ item: 'fude', count: 1 });
    expect(r.inputs.map((i) => [i.item, i.count])).toEqual([['sumi', 1], ['bamboo', 2]]);
  });
});

describe('AC19: ふでの たいきゅう 5 は 定義 1 か所', () => {
  it('設定の 新品の 値は 登録表の wear から（5）', () => {
    expect(W2_SETTING_DEFAULTS.toolDurability.fude).toBe(ITEM_DEFS.fude.wear);
    expect(W2_SETTING_DEFAULTS.toolDurability.fude).toBe(5);
  });
});
