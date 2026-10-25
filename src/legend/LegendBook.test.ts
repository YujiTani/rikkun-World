import { describe, expect, it } from 'vitest';
import { M6_SETTING_DEFAULTS, type ItemId } from '../contracts';
import { ACHIEVEMENT_DEFS } from '../achievements/defs';
import { AchievementSystem } from '../achievements/AchievementSystem';
import { LegendBook } from './LegendBook';

/** WEAPON-7 AC7: 手に 入れた ことの ある レジェンダリー（`legendGot`） */
describe('LegendBook', () => {
  const isLegend = (i: string) => i === 'raijin_ken' || i === 'crystal_katana';
  it('レジェンダリーを 手に 入れると 入る（同じ物 2 本目でも 1 つ）。そうでない物は 入らない', () => {
    const b = new LegendBook(isLegend);
    expect(b.got()).toEqual([]);
    expect(b.add('katana')).toBeNull();
    expect(b.add('raijin_ken')).toEqual({ first: true, kinds: 1 });
    expect(b.add('raijin_ken')).toEqual({ first: false, kinds: 1 });
    expect(b.add('crystal_katana')).toEqual({ first: true, kinds: 2 });
    expect(b.got()).toEqual(['raijin_ken', 'crystal_katana']);
  });
  it('保存・読みこみで 同じ。前の 保存（ない・こわれた）→ 空', () => {
    const b = new LegendBook(isLegend);
    b.add('raijin_ken' as ItemId);
    const c = new LegendBook(isLegend);
    c.deserialize(JSON.parse(JSON.stringify(b.serialize())));
    expect(c.got()).toEqual(['raijin_ken']);
    for (const bad of [undefined, null, 5, 'x', {}, { got: 3 }, { got: [1, null] }]) {
      const d = new LegendBook(isLegend);
      d.add('raijin_ken' as ItemId);
      d.deserialize(bad);
      expect(d.got(), String(bad)).toEqual([]);
    }
  });
  it('こわれても 消えない（remove は ない）・got() は コピー', () => {
    const b = new LegendBook(isLegend);
    b.add('raijin_ken' as ItemId);
    b.got().push('crystal_katana');
    expect(b.got()).toEqual(['raijin_ken']);
  });

  it('AC12 雷神剣を はじめて 手に 入れると get.raijin_ken.1 と legend.kinds.1（2 本目では 取れない）・どちらも 小で ない', () => {
    const a = new AchievementSystem(() => ({ ...M6_SETTING_DEFAULTS, achieveCooldown: 0, achieveCooldownEarly: 0 }));
    const b = new LegendBook(isLegend);
    // main.ts の inventory.onAdded と 同じ つなぎ
    const add = (item: ItemId) => {
      const r = b.add(item);
      if (r) a.feedLegend(item, r.kinds);
    };
    const before = a.unlockedCount();
    add('raijin_ken' as ItemId);
    expect(a.isUnlocked('get.raijin_ken.1')).toBe(true);
    expect(a.isUnlocked('legend.kinds.1')).toBe(true);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'get.raijin_ken.1')!.small).toBe(false);
    expect(ACHIEVEMENT_DEFS.find((d) => d.id === 'legend.kinds.1')!.small).toBe(false);
    expect(a.unlockedCount() - before).toBe(2);
    add('raijin_ken' as ItemId);
    expect(a.unlockedCount() - before, '2 本目では ふえない').toBe(2);
  });
});
