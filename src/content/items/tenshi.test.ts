import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS } from '../../contracts';
import { ALL_RECIPES } from '../../craft/recipes';
import { ITEM_INFO } from '../../craft/info/table';
import { itemType } from '../../inventory/items';
import { itemRarity } from '../../drops/rarity';
import { findUnrubiedKanji, withRuby } from '../../ui/text';
import { itemIconPixels } from '../../ui/itemIcon';
import { LEGEND4_IDS } from './ids';
import { LEGEND4_TUNING } from './legend4Tuning';
import { itemDef } from './registry';

/** LEGEND-4 T-C1・T7（§3.9・§6.6）: 天使の弓の 登録表・ダメージ 3・5・7・手に 持つ 形 */
const NAME = '［天使｜てんし］の［弓｜ゆみ］';

describe('T-C1 tenshi_yumi: 登録表', () => {
  const d = itemDef('tenshi_yumi')!;
  it('legendary・maxStack 1・レシピ なし・たいきゅう 10000・名前は §3.2 の とおり', () => {
    expect(LEGEND4_IDS).toContain('tenshi_yumi');
    expect(d).toBeDefined();
    expect(d.rarity).toBe('legendary');
    expect(d.maxStack).toBe(1);
    expect(d.category).toBe('weapon');
    expect(d.recipe).toBeUndefined();
    expect(ALL_RECIPES.some((r) => r.id === 'tenshi_yumi')).toBe(false);
    expect(d.wear).toBe(10000);
    expect(W2_SETTING_DEFAULTS.toolDurability.tenshi_yumi).toBe(10000);
    expect(itemType('tenshi_yumi')).toEqual({ id: 'tenshi_yumi', name: NAME, maxStack: 1, placeBlock: null });
    expect(itemRarity('tenshi_yumi')).toBe('legendary');
  });
  it('zukan が ある・名前と ずかんに ルビの ない 漢字が ない', () => {
    expect(d.zukan.length).toBeGreaterThan(0);
    expect(findUnrubiedKanji(withRuby(d.name))).toEqual([]);
    expect(findUnrubiedKanji(withRuby(d.zukan))).toEqual([]);
  });
  it('説明の 表（§6.4）', () => {
    expect(ITEM_INFO.tenshi_yumi!.use).toBe('や を とばして とおく の ようかい を たおす。や が いる');
    expect(ITEM_INFO.tenshi_yumi!.special).toBe('せなか に つばさ が はえて、ふわふわ とべる ように なる');
    expect(ITEM_INFO.tenshi_yumi!.stats).toBe('bow');
  });
  it('2D の 古い 絵（16x16）が ある（石の 絵に 落ちない）', () => {
    const px = itemIconPixels('tenshi_yumi');
    expect(px).toHaveLength(256);
    expect(px.some((c) => c[3] === 255)).toBe(true);
    expect(px).not.toEqual(itemIconPixels('stone'));
  });
});

describe('T7 ダメージ 3・5・7（ふつうの 放物線の 弓）', () => {
  it('表と 設定が 同じ・まっすぐ とぶ 弓では ない', () => {
    expect(LEGEND4_TUNING.tenshi.damage).toEqual([3, 5, 7]);
    expect(W2_SETTING_DEFAULTS.bowDamageByItem.tenshi_yumi).toEqual([3, 5, 7]);
    expect(W2_SETTING_DEFAULTS.bowStraightByItem.tenshi_yumi).toBeUndefined();
  });
});
