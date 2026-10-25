import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem } from './AchievementSystem';

/**
 * SAMURAI-1（#300）AC18: 実績 samurai.first.1・samurai.all.4。実装の 前の テスト（赤）。
 * 窓口 の 形（NINJA-1 の feedNinja と 同じ）: `AchievementSystem.feedSamurai(item, kinds)`（侍帳 SamuraiBook.add の 結果 kinds を わたす。stat は `samuraiKinds`）。
 * 実績の 形は NINJA-1 AC18 と 同じ（大きい 実績・category fight）。
 */
const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const def = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id);

describe('AC18 侍装備の 実績', () => {
  it('samurai.first.1 は「はじめての 侍装備！」・samurai.all.4 は「侍装備を 4 つ そろえた！」。どちらも 大きい 実績', () => {
    const a = def('samurai.first.1');
    const b = def('samurai.all.4');
    expect(a, 'samurai.first.1').toBeDefined();
    expect(b, 'samurai.all.4').toBeDefined();
    expect(a!.name).toBe('はじめての ［侍｜さむらい］［装備｜そうび］！');
    expect(b!.name).toBe('［侍｜さむらい］［装備｜そうび］を 4 つ そろえた！');
    expect(a!.small).toBe(false);
    expect(b!.small).toBe(false);
    expect(a!.category).toBe('fight');
    expect(b!.category).toBe('fight');
  });
  it('はじめて もちものに 入れる → samurai.first.1。3 しゅ では samurai.all.4 は まだ', () => {
    const s = mk();
    expect(s.isUnlocked('samurai.first.1')).toBe(false);
    s.feedSamurai('samurai_geta', 1);
    expect(s.isUnlocked('samurai.first.1')).toBe(true);
    expect(s.isUnlocked('samurai.all.4')).toBe(false);
    s.feedSamurai('samurai_jingasa', 2);
    s.feedSamurai('samurai_tekko', 3);
    expect(s.isUnlocked('samurai.all.4')).toBe(false);
  });
  it('4 しゅ 入れる → samurai.all.4。同じ 物 2 回は 数えない（kinds が ふえない）', () => {
    const s = mk();
    s.feedSamurai('samurai_geta', 1);
    s.feedSamurai('samurai_geta', 1);
    s.feedSamurai('samurai_geta', 1);
    expect(s.isUnlocked('samurai.all.4')).toBe(false);
    s.feedSamurai('samurai_jingasa', 2);
    s.feedSamurai('samurai_tekko', 3);
    s.feedSamurai('samurai_haori', 4);
    expect(s.isUnlocked('samurai.all.4')).toBe(true);
  });
  it('忍者の 実績・legend.kinds は かわらない（侍装備は 忍者帳にも レジェンダリー武器の 数にも 入れない）', () => {
    const s = mk();
    s.feedSamurai('samurai_geta', 1);
    expect(s.stat('legendKinds')).toBe(0);
    expect(s.stat('ninjaKinds')).toBe(0);
    expect(s.isUnlocked('ninja.first.1')).toBe(false);
    expect(s.stat('get:samurai_geta')).toBe(0);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('ninja.')).map((d) => d.id)).toEqual(['ninja.first.1', 'ninja.all.4']);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('get.')).map((d) => d.id)).toEqual(['get.raijin_ken.1', 'get.fujin_ken.1', 'get.niji.1']);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('legend.kinds.')).map((d) => d.id)).toEqual(['legend.kinds.1', 'legend.kinds.2', 'legend.kinds.3']);
  });
  it('実績は ぜんぶで 284（NINJA-1 の 282 ＋ 2）で、samurai.* は 2 つだけ', () => {
    expect(ACHIEVEMENT_DEFS.filter((d) => d.id.startsWith('samurai.')).map((d) => d.id)).toEqual(['samurai.first.1', 'samurai.all.4']);
    expect(ACHIEVEMENT_DEFS).toHaveLength(284);
  });
});
