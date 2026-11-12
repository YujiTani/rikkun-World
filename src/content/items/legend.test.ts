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

/** LEGEND-4 PR1 K-C1（docs/design/LEGEND-4.md §3.9・§4.4）: 黒龍の 登録表 */
const NAME = '［黒龍｜こくりゅう］';

describe('K-C1 kokuryu: 登録表', () => {
  const d = itemDef('kokuryu')!;
  it('legendary・maxStack 1・レシピ なし・たいきゅう 10000・名前は §3.2 の とおり', () => {
    expect(LEGEND4_IDS).toContain('kokuryu');
    expect(d).toBeDefined();
    expect(d.rarity).toBe('legendary');
    expect(d.maxStack).toBe(1);
    expect(d.category).toBe('weapon');
    expect(d.recipe).toBeUndefined();
    expect(ALL_RECIPES.some((r) => r.id === 'kokuryu')).toBe(false);
    expect(d.wear).toBe(10000);
    expect(W2_SETTING_DEFAULTS.toolDurability.kokuryu).toBe(10000);
    expect(itemType('kokuryu')).toEqual({ id: 'kokuryu', name: NAME, maxStack: 1, placeBlock: null });
    expect(itemRarity('kokuryu')).toBe('legendary');
  });
  it('zukan が ある・名前と ずかんに ルビの ない 漢字が ない', () => {
    expect(d.zukan.length).toBeGreaterThan(0);
    expect(findUnrubiedKanji(withRuby(d.name))).toEqual([]);
    expect(findUnrubiedKanji(withRuby(d.zukan))).toEqual([]);
  });
  it('説明の 表: や の つよさ 4〜10・special・ながく ひくほど はやく とぶ', () => {
    expect(LEGEND4_TUNING.kokuryu.damage).toEqual([4, 6, 10]);
    expect(W2_SETTING_DEFAULTS.bowDamageByItem.kokuryu).toEqual([4, 6, 10]);
    expect(ITEM_INFO.kokuryu!.use).toBe('や を とばして とおく の ようかい を たおす。や が いる');
    expect(ITEM_INFO.kokuryu!.special).toBe('や が つよく なり、すべて を つらぬく！ もてば かぜ の ように はやく、そら たかく とべる');
    expect(ITEM_INFO.kokuryu!.stats).toBe('bow');
  });
  it('まっすぐ・つらぬく ゆみ（きょり 48）・手に 持つ 間 走る 速さ 1.2 倍の passive', () => {
    expect(W2_SETTING_DEFAULTS.bowStraightByItem.kokuryu).toBe(LEGEND4_TUNING.kokuryu.range);
    expect(W2_SETTING_DEFAULTS.legendary.find((l) => l.item === 'kokuryu')!.passive).toEqual([{ kind: 'moveMul', mul: LEGEND4_TUNING.kokuryu.moveMul }]);
  });
  it('2D の 古い 絵（16x16）が ある（石の 絵に 落ちない）', () => {
    const px = itemIconPixels('kokuryu');
    expect(px).toHaveLength(256);
    expect(px.some((c) => c[3] === 255)).toBe(true);
    expect(px).not.toEqual(itemIconPixels('stone'));
  });
});

/** LEGEND-4 PR2 Y-C1（§3.9・§5.4）: 八咫烏の 登録表 */
describe('Y-C1 yatagarasu: 登録表', () => {
  const d = itemDef('yatagarasu')!;
  const Y = LEGEND4_TUNING.yatagarasu;
  it('legendary・maxStack 1・レシピ なし・たいきゅう 10000・名前は §3.2 の とおり', () => {
    expect(LEGEND4_IDS).toContain('yatagarasu');
    expect(d.rarity).toBe('legendary');
    expect(d.maxStack).toBe(1);
    expect(d.category).toBe('weapon');
    expect(d.recipe).toBeUndefined();
    expect(ALL_RECIPES.some((r) => r.id === 'yatagarasu')).toBe(false);
    expect(d.wear).toBe(10000);
    expect(W2_SETTING_DEFAULTS.toolDurability.yatagarasu).toBe(10000);
    expect(itemType('yatagarasu')).toEqual({ id: 'yatagarasu', name: '［八咫烏｜やたがらす］', maxStack: 1, placeBlock: null });
    expect(itemRarity('yatagarasu')).toBe('legendary');
  });
  it('zukan が ある・ルビの ない 漢字が ない', () => {
    expect(d.zukan.length).toBeGreaterThan(0);
    expect(findUnrubiedKanji(withRuby(d.name))).toEqual([]);
    expect(findUnrubiedKanji(withRuby(d.zukan))).toEqual([]);
  });
  it('説明の 表（§5.4）・や の つよさ 4〜10・ほのお あり・まっすぐでは ない', () => {
    expect(W2_SETTING_DEFAULTS.bowDamageByItem.yatagarasu).toEqual([4, 6, 10]);
    expect(Y.damage).toEqual([4, 6, 10]);
    expect(ITEM_INFO.yatagarasu!.use).toBe('や を とばして とおく の ようかい を たおす。や が いる');
    expect(ITEM_INFO.yatagarasu!.special).toBe('ひかり の や が あたると むらさき の ほのお が だいばくはつ！ ときどき や が へらない');
    expect(ITEM_INFO.yatagarasu!.stats).toBe('bow');
    expect(W2_SETTING_DEFAULTS.bowBurstByItem.yatagarasu).toBe(true);
    expect(W2_SETTING_DEFAULTS.bowStraightByItem.yatagarasu).toBeUndefined();
    expect(W2_SETTING_DEFAULTS.bowBurstByItem.kokuryu).toBeUndefined();
  });
  it('2D の 古い 絵（16x16）が ある', () => {
    const px = itemIconPixels('yatagarasu');
    expect(px).toHaveLength(256);
    expect(px.some((c) => c[3] === 255)).toBe(true);
    expect(px).not.toEqual(itemIconPixels('kokuryu'));
  });
});
