import { describe, expect, it } from 'vitest';
import { LevelSystem } from './LevelSystem';

describe('LevelSystem', () => {
  it('経験値: ちょうちん 2・からかさ 3・ろくろくび 3・ぬりかべ 6', () => {
    const l = new LevelSystem();
    expect(l.onDefeat('chochin')).toBe(2);
    expect(l.onDefeat('karakasa')).toBe(3);
    expect(l.onDefeat('rokurokubi')).toBe(3);
    expect(l.onDefeat('nurikabe')).toBe(6);
  });

  it('次のレベルまで 5×今のレベル。レベルアップで経験値は繰り越す', () => {
    let healed = 0;
    const l = new LevelSystem({ onLevelUp: () => healed++ });
    expect(l.get()).toEqual({ level: 1, xp: 0, next: 5 });
    l.addXp(4);
    expect(l.level()).toBe(1);
    l.addXp(3); // 7 -> Lv2 で 2 のこる
    expect(l.get()).toEqual({ level: 2, xp: 2, next: 10 });
    expect(healed).toBe(1);
  });

  it('まとめて上がれる（5 + 10 = 15 で Lv3）', () => {
    const l = new LevelSystem();
    expect(l.addXp(15)).toBe(2);
    expect(l.get()).toEqual({ level: 3, xp: 0, next: 15 });
  });

  it('出来事: xp と levelUp', () => {
    const l = new LevelSystem();
    l.addXp(5);
    const ev = l.drainEvents();
    expect(ev.map((e) => e.type)).toEqual(['xp', 'levelUp']);
    expect(l.drainEvents()).toEqual([]);
  });

  it('保存と読みこみ。こわれた値は Lv1 から', () => {
    const l = new LevelSystem();
    l.addXp(12);
    const data = JSON.parse(JSON.stringify(l.serialize()));
    const m = new LevelSystem();
    m.deserialize(data);
    expect(m.get()).toEqual(l.get());
    m.deserialize({ level: 'x' });
    expect(m.get().level).toBe(1);
    m.deserialize(null);
    expect(m.get()).toEqual({ level: 1, xp: 0, next: 5 });
  });
});
