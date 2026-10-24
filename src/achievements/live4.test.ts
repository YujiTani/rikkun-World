import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem } from './AchievementSystem';
import { M6_SETTING_DEFAULTS } from '../contracts';

/** LIVE-4 実績（docs/design/LIVE-4.md 版 2 §4.5・§3.1・AC18）。数の 表 は achievements.test.ts */
describe('LIVE-4 実績（§4.5）', () => {
  it('animal.machoKO は animal.eatMeat の すぐ うしろ・小・名前 §3.1・記録 machoKO:*・段階 1 つ（1）', () => {
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(ids.indexOf('animal.machoKO.1')).toBeGreaterThan(-1);
    expect(ids.indexOf('animal.machoKO.1')).toBe(ids.indexOf('animal.eatMeat.1') + 1);
    const d = ACHIEVEMENT_DEFS.find((x) => x.id === 'animal.machoKO.1');
    expect(d).toMatchObject({ category: 'farm', small: true, stat: 'machoKO:*', name: 'はじめて マッチョ と いっしょ に ようかい を たおした！' });
    expect(ACHIEVEMENT_DEFS.filter((x) => x.series === 'animal.machoKO')).toHaveLength(1);
    expect(/[一-鿿]/.test(d!.name), '名前 に 漢字 なし').toBe(false);
  });

  it('machoKO:* が 1 に なる と 実績 が ひらく（2 回目 から は 何も おきない）', () => {
    const s = new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
    s.record('machoKO:*', 1);
    expect(s.stat('machoKO:*')).toBe(1);
    expect(s.list().find((x) => x.id === 'animal.machoKO.1')?.unlocked).toBe(true);
    s.record('machoKO:*', 1);
    expect(s.stat('machoKO:*')).toBe(2);
  });

  it('画面 の 文 に 強い ことば（ころす・しぬ・やっつけろ）が 無い', () => {
    const d = ACHIEVEMENT_DEFS.find((x) => x.id === 'animal.machoKO.1');
    expect(d, '実績 が ある').toBeTruthy();
    for (const bad of ['ころ', 'しぬ', 'やっつけろ']) expect(d!.name).not.toContain(bad);
  });
});
