import { describe, expect, it } from 'vitest';
import type { DayPhase } from '../contracts';
import { createTimeHook } from './hook';
import { TimeOfDayImpl } from './TimeOfDay';

function steps(t: TimeOfDayImpl, n: number): void {
  for (let i = 0; i < n; i++) t.update();
}

describe('昼と夜（AC1）', () => {
  it('開いた直後は ひる の始め', () => {
    const hook = createTimeHook(new TimeOfDayImpl());
    expect(hook.get()).toMatchObject({ phase: 'day', dayTick: 0, day: 0 });
  });
  it('時間帯の境目と 1 日の終わり', () => {
    const t = new TimeOfDayImpl();
    steps(t, 17999);
    expect(t.phase()).toBe('day');
    steps(t, 1);
    expect(t.phase()).toBe('dusk');
    t.set(19800);
    expect(t.phase()).toBe('night');
    t.set(28800);
    expect(t.phase()).toBe('dawn');
    t.set(30599);
    steps(t, 1);
    expect(t.dayTick()).toBe(0);
    expect(t.day()).toBe(1);
    expect(t.phase()).toBe('day');
  });
  it('set は day を変えない・はみ出しは 1 日にまるめる', () => {
    const t = new TimeOfDayImpl();
    t.set(30600 + 5);
    expect(t.dayTick()).toBe(5);
    expect(t.day()).toBe(0);
  });
  it('時間帯が変わったときだけ知らせる。解除できる', () => {
    const t = new TimeOfDayImpl();
    const seen: DayPhase[] = [];
    const off = t.onPhaseChange((p) => seen.push(p));
    steps(t, 18000);
    t.set(19800);
    t.set(19900);
    t.set(28800);
    expect(seen).toEqual(['dusk', 'night', 'dawn']);
    off();
    t.set(0);
    expect(seen).toHaveLength(3);
  });
});

describe('空と明るさ（AC2）', () => {
  it('ひる・よる の色と明るさ', () => {
    const t = new TimeOfDayImpl();
    expect(t.skyColor()).toBe('#8FD3FF');
    expect(t.brightness()).toBe(1);
    expect(t.dollBrightness()).toBe(1);
    t.set(20000);
    expect(t.skyColor()).toBe('#1B2350');
    expect(t.brightness()).toBeCloseTo(0.45);
    expect(t.dollBrightness()).toBeCloseTo(0.75);
  });
  it('ゆうがた の まん中は 0.6〜0.85、ゆうやけ色', () => {
    const t = new TimeOfDayImpl();
    t.set(18900);
    expect(t.brightness()).toBeGreaterThan(0.6);
    expect(t.brightness()).toBeLessThan(0.85);
    expect(t.skyColor()).toBe('#FF9E6B');
  });
  it('どの 2 ステップのあいだでも明るさの差は 0.01 以下（1 日ぜんぶ）', () => {
    const t = new TimeOfDayImpl();
    let prev = t.brightness();
    let prevDoll = t.dollBrightness();
    for (let i = 0; i < 30600; i++) {
      t.update();
      expect(Math.abs(t.brightness() - prev)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(t.dollBrightness() - prevDoll)).toBeLessThanOrEqual(0.01);
      prev = t.brightness();
      prevDoll = t.dollBrightness();
    }
  });
  it('あさ は よる から ひる へ戻る', () => {
    const t = new TimeOfDayImpl();
    t.set(28800);
    expect(t.brightness()).toBeCloseTo(0.45);
    t.set(28800 + 900);
    expect(t.skyColor()).toBe('#FFC48A');
    t.set(30599);
    expect(t.brightness()).toBeGreaterThan(0.99);
  });
});
