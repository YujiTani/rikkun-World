import { describe, expect, it } from 'vitest';
import type { AnimalEvent } from '../contracts';
import { M6_SETTING_DEFAULTS } from '../contracts';
import { ACHIEVEMENT_DEFS } from './defs';
import { AchievementSystem } from './AchievementSystem';

const mk = () => {
  const s = { ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 };
  return new AchievementSystem(() => s);
};

describe('LIVE-2 実績（§4.5）', () => {
  it('数（AC24。LIVE-3・LIVE-4 で ＋1 ずつ ふえた）: 262・小 89・そだてる 63・小 18', () => {
    expect(ACHIEVEMENT_DEFS.length).toBe(262);
    expect(ACHIEVEMENT_DEFS.filter((d) => d.small).length).toBe(89);
    const farm = ACHIEVEMENT_DEFS.filter((d) => d.category === 'farm');
    expect(farm.length).toBe(63);
    expect(farm.filter((d) => d.small).length).toBe(18);
  });

  it('そだてる の 並び: animal.carry の うしろ に coop・home・hatch・grow・goldenEgg・macho の 順（9 こ・小 は home.1 だけ）', () => {
    const ids = ACHIEVEMENT_DEFS.filter((d) => d.series.startsWith('animal.')).map((d) => d.id);
    const i = ids.indexOf('animal.carry.10');
    expect(ids.slice(i + 1)).toEqual([
      'animal.coop.1',
      'animal.home.1',
      'animal.hatch.1',
      'animal.hatch.5',
      'animal.grow.1',
      'animal.grow.5',
      'animal.goldenEgg.1',
      'animal.goldenEgg.5',
      'animal.macho.1',
    ]);
    const live2 = ACHIEVEMENT_DEFS.filter((d) => /^animal\.(coop|home|hatch|grow|goldenEgg|macho)\./.test(d.id));
    expect(live2.filter((d) => d.small).map((d) => d.id)).toEqual(['animal.home.1']);
  });

  it('名前（仕様 §4.5 の とおり）', () => {
    const n = (id: string) => ACHIEVEMENT_DEFS.find((d) => d.id === id)?.name;
    expect(n('animal.coop.1')).toBe('はじめて とりごや を たてた！');
    expect(n('animal.home.1')).toBe('はじめて とりごや の こ が できた！');
    expect(n('animal.hatch.1')).toBe('はじめて ひよこ が かえった！');
    expect(n('animal.hatch.5')).toBe('ひよこ が 5 わ かえった！');
    expect(n('animal.grow.1')).toBe('はじめて おとな に なった！');
    expect(n('animal.grow.5')).toBe('5 わ おとな に なった！');
    expect(n('animal.goldenEgg.1')).toBe('はじめて きん の たまご！');
    expect(n('animal.goldenEgg.5')).toBe('きん の たまご を 5 こ！');
    expect(n('animal.macho.1')).toBe('マッチョ ひよこ が かえった！');
  });

  it('つくる: craft.nukunuku・craft.toriya は 小。craft.mushi_ami の うしろ。名前（AC24）', () => {
    const craft = ACHIEVEMENT_DEFS.filter((d) => d.category === 'craft').map((d) => d.id);
    const i = craft.indexOf('craft.mushi_ami.1');
    expect(craft.slice(i + 1, i + 3)).toEqual(['craft.nukunuku.1', 'craft.toriya.1']);
    const d = (id: string) => ACHIEVEMENT_DEFS.find((x) => x.id === id)!;
    expect(d('craft.nukunuku.1')).toMatchObject({ name: 'はじめて こたつ を つくった！', small: true, stat: 'craft:nukunuku' });
    expect(d('craft.toriya.1')).toMatchObject({ name: 'はじめて とりごや を つくった！', small: true, stat: 'craft:toriya' });
  });

  it('記録: hatch・hatch:macho・home・grow・金 の たまご（egg の gold）を 数える', () => {
    const s = mk();
    const ev: AnimalEvent[] = [
      { type: 'hatch', id: 1, breed: 'normal', gold: false },
      { type: 'hatch', id: 2, breed: 'macho', gold: true },
      { type: 'home', id: 1, coop: 1 },
      { type: 'grow', id: 1, first: true, breed: 'normal' },
      { type: 'egg', id: 1, x: 0, y: 0, z: 0, gold: true },
      { type: 'egg', id: 1, x: 0, y: 0, z: 0 },
      { type: 'hatchStart', x: 0, y: 0, z: 0 },
      { type: 'coopLocked', coop: 1 },
    ];
    s.feedAnimals(ev);
    expect(s.stat('hatch:*')).toBe(2);
    expect(s.stat('hatch:macho')).toBe(1);
    expect(s.stat('home:*')).toBe(1);
    expect(s.stat('grow:*')).toBe(1);
    expect(s.stat('goldenEgg:*')).toBe(1);
    expect(s.stat('egg:*')).toBe(2);
  });

  it('小屋 を 置いた（DigEvent place の id toriya_fence を 1 回）は place:toriya に なる。ふつう の ブロック は ならない', () => {
    const s = mk();
    s.feedDig([{ type: 'place', tick: 1, block: { x: 0, y: 0, z: 0 }, id: 'stone' }]);
    expect(s.stat('place:toriya')).toBe(0);
    s.feedDig([{ type: 'place', tick: 2, block: { x: 0, y: 0, z: 0 }, id: 'toriya_fence' }]);
    expect(s.stat('place:toriya')).toBe(1);
  });
});
