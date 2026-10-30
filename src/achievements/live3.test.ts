import { describe, expect, it } from 'vitest';
import type { AnimalEvent, FarmEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem } from './AchievementSystem';

const mk = () => new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
const at = { tick: 0, x: 0, y: 0, z: 0 };

// 「SAVE_GEN は かえない（3 の まま）」の テストは MINE-1A（#348）で 消した。地下の 作り方が かわる ので SAVE_GEN は 3 → 4 に 上がる（A11）。
// 上げた 値の 確かめは src/save/mineSave.test.ts。LIVE-3 自身が 版を 上げて いない ことは 当時の PR で 確かめずみ。

describe('LIVE-3 実績（§4.5・AC15）', () => {
  it('animal.eatMeat は animal.eatEgg の すぐ うしろ・小・名前・記録 eat:momo_yaki・段階 1', () => {
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(ids.indexOf('animal.eatMeat.1')).toBe(ids.indexOf('animal.eatEgg.1') + 1);
    const d = ACHIEVEMENT_DEFS.find((x) => x.id === 'animal.eatMeat.1');
    expect(d).toMatchObject({ category: 'farm', small: true, stat: 'eat:momo_yaki', name: 'はじめて やいた もも にく を たべた！' });
    expect(ACHIEVEMENT_DEFS.filter((x) => x.series === 'animal.eatMeat')).toHaveLength(1);
  });

  it('「いただきます」その もの の 実績・お祝い は 無い（meat:* の 実績 は 作らない）', () => {
    expect(ACHIEVEMENT_DEFS.some((x) => (x.stat as string).startsWith('meat:'))).toBe(false);
    expect(ACHIEVEMENT_DEFS.some((x) => /meat(?!eat)/i.test(x.series.replace('eatMeat', '')))).toBe(false);
  });

  it('eat:momo_yaki を 数える。eat:* は やさい だけ（たまご と 同じ）', () => {
    const s = mk();
    s.feedFarm([
      { type: 'eat', ...at, item: 'tomato', heal: 2 },
      { type: 'eat', ...at, item: 'momo_yaki', heal: 10 },
    ] as FarmEvent[]);
    expect(s.stat('eat:*')).toBe(1);
    expect(s.stat('eat:momo_yaki')).toBe(1);
    expect(s.stat('eat:*')).toBe(1);
  });

  it('出来事 meat は meat:* を 1 数える だけ（取れる 実績 は 増えない）', () => {
    const s = mk();
    const before = ACHIEVEMENT_DEFS.filter((d) => (d.stat as string).startsWith('meat')).length;
    s.feedAnimals([{ type: 'meat', id: 1, coop: 1, count: 2, dropped: 0 }] as unknown as AnimalEvent[]);
    expect(s.stat('meat:*' as never)).toBe(1);
    expect(before).toBe(0);
  });
});
