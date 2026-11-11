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

/** LEGEND-4 PR4 G-C1（docs/design/LEGEND-4.md §3.9・§7.5）: ノームの斧の 登録表 */
const NAME = 'ノームの［斧｜おの］';

describe('G-C1 gnome_axe: 登録表', () => {
  const d = itemDef('gnome_axe')!;
  it('legendary・maxStack 1・レシピ なし・たいきゅう 10000・名前は §3.2 の とおり・ぶきの 組', () => {
    expect(LEGEND4_IDS).toContain('gnome_axe');
    expect(d).toBeDefined();
    expect(d.rarity).toBe('legendary');
    expect(d.maxStack).toBe(1);
    expect(d.category).toBe('weapon');
    expect(d.recipe).toBeUndefined();
    expect(ALL_RECIPES.some((r) => r.id === 'gnome_axe')).toBe(false);
    expect(d.wear).toBe(10000);
    expect(W2_SETTING_DEFAULTS.toolDurability.gnome_axe).toBe(10000);
    expect(itemType('gnome_axe')).toEqual({ id: 'gnome_axe', name: NAME, maxStack: 1, placeBlock: null });
    expect(itemRarity('gnome_axe')).toBe('legendary');
  });
  it('zukan が ある・名前と ずかんに ルビの ない 漢字が ない', () => {
    expect(d.zukan.length).toBeGreaterThan(0);
    expect(findUnrubiedKanji(withRuby(d.name))).toEqual([]);
    expect(findUnrubiedKanji(withRuby(d.zukan))).toEqual([]);
  });
  it('説明の 文は §7.5 の とおり', () => {
    expect(ITEM_INFO.gnome_axe!.use).toBe('き を はやく きれる。ようかい も たたける');
    expect(ITEM_INFO.gnome_axe!.special).toBe('き を きれば 2 だん いっきに まっぷたつ！ よこなぎ で ようかい を なぎはらう');
    expect(ITEM_INFO.gnome_axe!.how).toBe('えらんで、ブロック に むけて ひだりクリック を おしつづける。ようかい に むけて ひだりクリック で よこに ふる');
    expect(ITEM_INFO.gnome_axe!.stats).toBe('pickaxe');
  });
  it('数は 表から: ほる つよさ・たたく つよさ（よこなぎ）・おの なかま（き）', () => {
    expect(d.tool).toEqual({ power: LEGEND4_TUNING.gnome.digPower, level: LEGEND4_TUNING.gnome.digLevel, family: 'log', damage: LEGEND4_TUNING.gnome.damage });
    expect(LEGEND4_TUNING.gnome.damage).toBe(7);
    expect(W2_SETTING_DEFAULTS.legendary.find((l) => l.item === 'gnome_axe')!.charge).toBeNull();
  });
  it('2D の 古い 絵（16x16）が ある（石の 絵に 落ちない）', () => {
    const px = itemIconPixels('gnome_axe');
    expect(px).toHaveLength(256);
    expect(px.some((c) => c[3] === 255)).toBe(true);
    expect(px).not.toEqual(itemIconPixels('stone'));
  });
});
