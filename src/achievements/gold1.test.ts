import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS, CRAFT_RECIPE_NAMES, KIN_RECIPES } from './defs';
import { AchievementSystem } from './AchievementSystem';

const mk = () => {
  const s = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => s);
};
const craft = (s: AchievementSystem, r: string) => s.feedCraft([{ type: 'craft', tick: 0, recipe: r, item: r as never, count: 1 }]);

describe('GOLD-1 実績（§4.8・AC15）', () => {
  it('4 つ・どれも 小 でない・メダル きん・なかま', () => {
    const d = (id: string) => ACHIEVEMENT_DEFS.find((x) => x.id === id);
    for (const [id, cat] of [['gold.first.1', 'craft'], ['gold.all.8', 'craft'], ['obtain.harapan_mimizu.1', 'farm'], ['rarity.star5.1', 'collect']] as const) {
      expect(d(id)?.category).toBe(cat);
      expect(d(id)?.small).toBeFalsy();
      expect(d(id)?.medal).toBe('gold');
    }
    expect(d('gold.first.1')?.name).toBe('はじめて きん の そうび を つくった！');
    expect(d('gold.all.8')?.name).toBe('きん の そうび を 8 こ ぜんぶ つくった！');
    expect(d('obtain.harapan_mimizu.1')?.name).toBe('はじめて はらぱんみみず を てにいれた！');
    expect(d('rarity.star5.1')?.name).toBe('はじめて ほし 5 を ゲット！');
  });
  it('各 なかま の いちばん うしろ', () => {
    for (const [cat, id] of [['craft', 'gold.all.8'], ['collect', 'rarity.star5.1'], ['farm', 'obtain.harapan_mimizu.1']] as const) {
      const l = ACHIEVEMENT_DEFS.filter((x) => x.category === cat);
      expect(l[l.length - 1].id).toBe(id);
    }
  });
  it('kin_katana → gold.first・8 こ ぜんぶ → gold.all（7 こ では まだ）', () => {
    const s = mk();
    craft(s, 'kin_katana');
    expect(s.isUnlocked('gold.first.1')).toBe(true);
    expect(s.isUnlocked('gold.all.8')).toBe(false);
    for (const r of KIN_RECIPES.slice(0, 7)) craft(s, r);
    craft(s, 'kin_katana');
    expect(s.isUnlocked('gold.all.8')).toBe(false);
    craft(s, KIN_RECIPES[7]);
    expect(s.isUnlocked('gold.all.8')).toBe(true);
  });
  it('craft.everything は 28 の まま・craft.weapons・armors は かわらない', () => {
    const s = mk();
    for (const r of KIN_RECIPES) craft(s, r);
    expect(s.stat('craft:weapons')).toBe(0);
    expect(s.stat('craft:armors')).toBe(0);
    expect(s.stat('craft:everything')).toBe(0);
    expect(ACHIEVEMENT_DEFS.find((x) => x.series === 'craft.everything')?.goal).toBe(CRAFT_RECIPE_NAMES.length);
  });
  it('はらぱんみみず を ひろう → obtain.harapan_mimizu', () => {
    const s = mk();
    s.feedCraft([{ type: 'pickup', tick: 0, item: 'harapan_mimizu', count: 1 }]);
    expect(s.isUnlocked('obtain.harapan_mimizu.1')).toBe(true);
  });
  it('ほし 5（epic）だけ → rarity.star5。ほし 6・7 は 数えない', () => {
    const s = mk();
    s.feedRarity('mythic');
    s.feedRarity('legendary');
    s.feedRarity('rare');
    expect(s.isUnlocked('rarity.star5.1')).toBe(false);
    s.feedRarity('epic');
    expect(s.isUnlocked('rarity.star5.1')).toBe(true);
    expect(s.stat('obtainRarity:epic')).toBe(1);
  });
});
