import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem } from './AchievementSystem';

/**
 * NINJA-1（#299）AC18: 実績 ninja.first.1・ninja.all.4。実装の 前の テスト（赤）。
 * 窓口 の 形: `AchievementSystem.feedNinja(item, kinds)`（忍者帳 NinjaBook.add の 結果 kinds を わたす。`feedLegend` と 同じ 形。stat は `ninjaKinds`）。
 */
const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const def = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id);

describe('AC18 忍者装備の 実績', () => {
  it('ninja.first.1 は「はじめての 忍者装備！」・ninja.all.4 は 4 しゅ。どちらも 大きい 実績（金メダル）', () => {
    const a = def('ninja.first.1');
    const b = def('ninja.all.4');
    expect(a, 'ninja.first.1').toBeDefined();
    expect(b, 'ninja.all.4').toBeDefined();
    expect(a!.name).toBe('はじめての ［忍者｜にんじゃ］［装備｜そうび］！');
    expect(a!.small).toBe(false);
    expect(b!.small).toBe(false);
    expect(a!.category).toBe('fight');
    expect(b!.category).toBe('fight');
  });
  it('はじめて もちものに 入れる → ninja.first.1。3 しゅ では ninja.all.4 は まだ', () => {
    const s = mk();
    expect(s.isUnlocked('ninja.first.1')).toBe(false);
    s.feedNinja('ninja_tabi', 1);
    expect(s.isUnlocked('ninja.first.1')).toBe(true);
    expect(s.isUnlocked('ninja.all.4')).toBe(false);
    s.feedNinja('ninja_zukin', 2);
    s.feedNinja('ninja_tekko', 3);
    expect(s.isUnlocked('ninja.all.4')).toBe(false);
  });
  it('4 しゅ 入れる → ninja.all.4。同じ 物 2 回は 数えない（kinds が ふえない）', () => {
    const s = mk();
    s.feedNinja('ninja_tabi', 1);
    s.feedNinja('ninja_tabi', 1);
    s.feedNinja('ninja_tabi', 1);
    expect(s.isUnlocked('ninja.all.4')).toBe(false);
    s.feedNinja('ninja_zukin', 2);
    s.feedNinja('ninja_tekko', 3);
    s.feedNinja('ninja_shozoku', 4);
    expect(s.isUnlocked('ninja.all.4')).toBe(true);
  });
  it('legend.kinds・get.* は かわらない（忍者装備は レジェンダリー武器の 数に 入れない）', () => {
    const s = mk();
    s.feedNinja('ninja_tabi', 1);
    expect(s.stat('legendKinds')).toBe(0);
    expect(s.stat('get:ninja_tabi')).toBe(0);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('get.')).map((d) => d.id)).toEqual(['get.raijin_ken.1', 'get.fujin_ken.1', 'get.niji.1']);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('legend.kinds.')).map((d) => d.id)).toEqual(['legend.kinds.1', 'legend.kinds.2', 'legend.kinds.3']);
  });
});
