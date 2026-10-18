import { describe, expect, it } from 'vitest';
import type { AnimalEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem } from './AchievementSystem';

const mk = () => {
  const s = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => s);
};

describe('LIVE-1 畜産の 記録（§4.5）', () => {
  it('feed・friend・petAnimal（なかま だけ）・egg を 数える', () => {
    const s = mk();
    const events: AnimalEvent[] = [
      { type: 'feed', id: 1, item: 'tomato', hearts: 1, friend: false },
      { type: 'friend', id: 1, first: true, count: 1 },
      { type: 'pet', id: 1, friend: true },
      { type: 'pet', id: 2, friend: false },
      { type: 'egg', id: 1, x: 0, y: 0, z: 0 },
      { type: 'hint', hint: 'feedHint' },
    ];
    s.feedAnimals(events);
    expect(s.stat('feed:*')).toBe(1);
    expect(s.stat('friend:*')).toBe(1);
    expect(s.stat('petAnimal:*')).toBe(1);
    expect(s.stat('egg:*')).toBe(1);
  });
  it('eat:* は やさい だけ。たまご は eat:egg だけ', () => {
    const s = mk();
    s.feedFarm([
      { type: 'eat', tick: 0, x: 0, y: 0, z: 0, item: 'tomato', heal: 2 },
      { type: 'eat', tick: 1, x: 0, y: 0, z: 0, item: 'egg', heal: 2 },
    ]);
    expect(s.stat('eat:*')).toBe(1);
    expect(s.stat('eat:egg')).toBe(1);
  });
  it('実績の 並び: 12 こ、小 は feed.1・pet.1・eatEgg.1 だけ', () => {
    const l = ACHIEVEMENT_DEFS.filter((d) => d.series.startsWith('animal.'));
    expect(l.length).toBe(12);
    expect(l.filter((d) => d.small).map((d) => d.id)).toEqual(['animal.feed.1', 'animal.pet.1', 'animal.eatEgg.1']);
    expect(l.find((d) => d.id === 'animal.friend.1')!.name).toBe('はじめて なかま が できた！');
    expect(l.find((d) => d.id === 'animal.friend.5')!.name).toBe('なかま が 5 わ に なった！');
  });
});
