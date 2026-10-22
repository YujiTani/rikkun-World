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
  it('実績の 並び（版 3.2 §4.5）: 17 こ、小 は feed.1・pet.1・eatEgg.1 だけ。bug・carry は eatEgg の うしろ', () => {
    const l = ACHIEVEMENT_DEFS.filter((d) => d.series.startsWith('animal.'));
    expect(l.length).toBe(26); // LIVE-2 で ＋9（17 → 26）。並び は live2.test.ts
    expect(l.filter((d) => d.small).map((d) => d.id)).toEqual(['animal.feed.1', 'animal.pet.1', 'animal.eatEgg.1', 'animal.home.1']);
    expect(l.slice(-15, -9).map((d) => d.id)).toEqual(['animal.eatEgg.1', 'animal.bug.1', 'animal.bug.10', 'animal.bug.50', 'animal.carry.1', 'animal.carry.10']);
    expect(l.find((d) => d.id === 'animal.friend.1')!.name).toBe('はじめて なかま が できた！');
    expect(l.find((d) => d.id === 'animal.friend.5')!.name).toBe('なかま が 5 わ に なった！');
  });
  it('名前: feed は むし、egg は うまれた、bug・carry・つくる あみ（id は 版 2 と 同じ）', () => {
    const n = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id)?.name;
    expect(n('animal.feed.1')).toBe('はじめて にわとり に むし を あげた！');
    expect(n('animal.feed.10')).toBe('むし を 10 かい あげた！');
    expect(n('animal.feed.50')).toBe('むし を 50 かい あげた！');
    expect(n('animal.egg.1')).toBe('はじめて たまご が うまれた！');
    expect(n('animal.egg.10')).toBe('たまご が 10 こ うまれた！');
    expect(n('animal.bug.1')).toBe('はじめて むし を とった！');
    expect(n('animal.bug.10')).toBe('むし を 10 ひき とった！');
    expect(n('animal.carry.1')).toBe('はじめて だっこ した！');
    expect(n('animal.carry.10')).toBe('10 かい だっこ した！');
    expect(n('craft.mushi_ami.1')).toBe('はじめて むしとりあみ を つくった！');
  });
  it('数（AC26）: LIVE-1 版 3.2 の 数 は LIVE-2 で ふえた（ぜんぶ 258・小 87・そだてる 61・小 16。数の 表は achievements.test.ts）。つくる は 1 ふえ（小 1）。craft.mushi_ami は craft.bucket の うしろ', () => {
    expect(ACHIEVEMENT_DEFS.length).toBe(258);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.small).length).toBe(87);
    const farm = ACHIEVEMENT_DEFS.filter((d) => d.category === 'farm');
    expect(farm.length).toBe(61);
    expect(farm.filter((d) => d.small).length).toBe(16);
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(ids.indexOf('craft.mushi_ami.1')).toBe(ids.indexOf('craft.bucket.1') + 1);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'craft.mushi_ami.1')).toMatchObject({ category: 'craft', small: true, stat: 'craft:mushi_ami' });
    expect(new Set(ids).size).toBe(258);
  });
  it('bugCatch は bug:*（持ち物 でも 足もと でも）、carry は carry:* を 数える。animal.bug.1・animal.carry.1 が 取れる', () => {
    const s = mk();
    s.feedAnimals([
      { type: 'bugCatch', toInventory: true },
      { type: 'bugCatch', toInventory: false },
      { type: 'carry', id: 1 },
      { type: 'swing', x: 0, y: 0, z: 0, caught: false, reason: 'miss' },
      { type: 'putDown', id: 1, x: 0, y: 0, z: 0 },
    ]);
    expect(s.stat('bug:*')).toBe(2);
    expect(s.stat('carry:*')).toBe(1);
    expect(s.isUnlocked('animal.bug.1')).toBe(true);
    expect(s.isUnlocked('animal.carry.1')).toBe(true);
    expect(s.isUnlocked('animal.bug.10')).toBe(false);
  });
  it('むしとりあみ を つくる（craft:mushi_ami）で craft.mushi_ami.1。craft.everything の 数 28 は かえない', () => {
    const s = mk();
    s.feedCraft([{ type: 'craft', recipe: 'mushi_ami', count: 1 } as never]);
    expect(s.isUnlocked('craft.mushi_ami.1')).toBe(true);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'craft.everything.28')).toBeDefined();
  });
});
