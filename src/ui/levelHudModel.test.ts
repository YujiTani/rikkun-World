import { describe, expect, it } from 'vitest';
import { P2State } from '../duo/p2State';
import { creditDefeat } from '../duo/credit';
import { LevelSystem } from '../level/LevelSystem';
import { levelBarView } from './levelHudModel';

describe('レベルの 棒に 出す 値（1P・2P 共通）', () => {
  it('レベル・いまの けいけんち / 次まで・棒の 長さ', () => {
    expect(levelBarView({ level: 1, xp: 0, next: 5 })).toEqual({ badge: '1', num: '0 / 5', fillPct: 0 });
    expect(levelBarView({ level: 3, xp: 6, next: 15 })).toEqual({ badge: '3', num: '6 / 15', fillPct: 40 });
  });
  it('棒は 100% を こえない', () => {
    expect(levelBarView({ level: 2, xp: 99, next: 10 }).fillPct).toBe(100);
  });
  it('2P の 値は 2P の p2.levels から 出る（1P とは 別々）', () => {
    const p2 = new P2State();
    const level1 = new LevelSystem();
    creditDefeat({ level1, level2: p2.levels, feedDefeat: () => undefined }, 2, 'karakasa', 3);
    const v2 = levelBarView(p2.levels.get());
    expect(v2.badge).toBe('1');
    expect(v2.num).toBe('3 / 5');
    expect(levelBarView(level1.get()).num).toBe('0 / 5');
    p2.levels.set(4, 7);
    expect(levelBarView(p2.levels.get())).toEqual({ badge: '4', num: '7 / 20', fillPct: 35 });
  });
  it('2P の レベルが 上がると 2P の levelUp の しらせだけ 出る（1P の level には 出ない）', () => {
    const p2 = new P2State();
    const level1 = new LevelSystem();
    creditDefeat({ level1, level2: p2.levels, feedDefeat: () => undefined }, 2, 'karakasa', 5);
    expect(p2.levels.drainEvents().some((e) => e.type === 'levelUp')).toBe(true);
    expect(level1.drainEvents()).toEqual([]);
  });
});
