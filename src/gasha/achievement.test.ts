import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { findUnrubiedKanji } from '../ui/text';

const mk = (): AchievementSystem => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));

describe('実績「がしゃどくろを たおした」', () => {
  const def = ACHIEVEMENT_DEFS.find((d) => d.stat === 'defeat:gashadokuro');

  it('表に あり、たたかうの 大きな 実績（金メダル）。名前は ひらがな・カタカナだけ（漢字は ふりがなつき）', () => {
    expect(def).toBeDefined();
    expect(def!.category).toBe('fight');
    expect(def!.goal).toBe(1);
    expect(def!.small).toBe(false);
    expect(def!.medal).toBe('gold');
    expect(def!.name).toContain('がしゃどくろ');
    expect(def!.name).toContain('たおした');
    expect(findUnrubiedKanji(def!.name)).toEqual([]);
  });

  it('record("defeat:gashadokuro") で 取れる。ふつうの ようかいを たおしても 取れない', () => {
    const s = mk();
    s.record('defeat:karakasa', 3);
    expect(s.isUnlocked(def!.id)).toBe(false);
    s.record('defeat:gashadokuro', 1);
    expect(s.isUnlocked(def!.id)).toBe(true);
  });
});
