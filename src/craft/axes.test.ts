import { describe, expect, it } from 'vitest';
import { CRAFT_RECIPES } from './recipes';
import { W2_SETTING_DEFAULTS } from '../contracts';
import { CRAFT_RECIPE_NAMES } from '../achievements/defs';
import { itemType } from '../inventory/items';
import { buildTooltip, type TooltipDeps } from '../ui/tooltipModel';

/** BAL-D AC17: おの 3 本のレシピ・カード 32 枚・ならび・「ぜんぶ つくる」+3 */
describe('BAL-D おの のレシピ（AC17）', () => {
  const text = (id: string) => {
    const r = CRAFT_RECIPES.find((x) => x.id === id)!;
    return [r.output.count, r.inputs.map((i) => `${i.item}${i.count}`).join(','), r.works, r.station];
  };
  it('材料', () => {
    expect(text('wood_axe')).toEqual([1, 'log3', true, 'craft']);
    expect(text('stone_axe')).toEqual([1, 'stone3,log2', true, 'craft']);
    expect(text('iron_axe')).toEqual([1, 'iron_ingot3,log2', true, 'craft']);
  });
  it('カードは 33 枚。おの 3 枚は てつの つるはし のすぐ後ろ', () => {
    expect(CRAFT_RECIPES).toHaveLength(36);
    expect(CRAFT_RECIPES.slice(0, 7).map((r) => r.id)).toEqual([
      'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe', 'furnace',
    ]);
  });
  it('「ぜんぶ つくる」は 28（+3）。おの の名前', () => {
    expect(CRAFT_RECIPE_NAMES).toHaveLength(28);
    expect(CRAFT_RECIPE_NAMES.slice(3, 6)).toEqual([['wood_axe', 'きの おの'], ['stone_axe', 'いしの おの'], ['iron_axe', 'てつの おの']]);
  });
  it('アイテム名・たいきゅう（き 59・いし 131・てつ 250）', () => {
    expect(['wood_axe', 'stone_axe', 'iron_axe'].map((i) => itemType(i as never)?.name)).toEqual(['きの おの', 'いしの おの', 'てつの おの']);
    const d = W2_SETTING_DEFAULTS.toolDurability;
    expect([d.wood_axe, d.stone_axe, d.iron_axe]).toEqual([59, 131, 250]);
  });
});

describe('BAL-D ツールチップの 1 行（§5）', () => {
  const deps: TooltipDeps = { nameOf: (i) => i, rarityOf: () => 'common', placeable: () => false, recipes: () => [] };
  it('おの は き・つるはし は いし・くわ は つち（くわ には ほる つよさ 4 も）', () => {
    expect(buildTooltip('stone_axe', deps).lines).toEqual(['ほる つよさ 4', 'き に つよい', 'たいきゅう 131 / 131']);
    expect(buildTooltip('iron_pickaxe', deps).lines).toContain('いし に つよい');
    expect(buildTooltip('kuwa', deps).lines).toEqual(['ほる つよさ 4', 'つち に つよい', 'はたけ を つくる', 'たいきゅう 131 / 131']);
  });
});
