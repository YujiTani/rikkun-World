import { describe, expect, it } from 'vitest';
import type { DayPhase } from '../contracts';
import { createTimeHook } from './hook';
import { TimeOfDayImpl } from './TimeOfDay';

function steps(t: TimeOfDayImpl, n: number): void {
  for (let i = 0; i < n; i++) t.update();
}

describe('昼と夜（AC1）', () => {
  // SHADOW-1（オーナーの決定）: はじまりは tick 9000（朝の長い影をさける）。実装したら it.fails を it に
  it.fails('開いた直後は ひる の 9000 tick め', () => {
    const hook = createTimeHook(new TimeOfDayImpl());
    expect(hook.get()).toMatchObject({ phase: 'day', dayTick: 9000, day: 0 });
  });
  it.fails('時間帯の境目と 1 日の終わり（はじまりは 9000）', () => {
    const t = new TimeOfDayImpl();
    steps(t, 54000 - 9000 - 1);
    expect(t.phase()).toBe('day');
    steps(t, 1);
    expect(t.phase()).toBe('dusk');
    t.set(59400);
    expect(t.phase()).toBe('night');
    t.set(86400);
    expect(t.phase()).toBe('dawn');
    t.set(91799);
    steps(t, 1);
    expect(t.dayTick()).toBe(0);
    expect(t.day()).toBe(1);
    expect(t.phase()).toBe('day');
  });
  it('set は day を変えない・はみ出しは 1 日にまるめる', () => {
    const t = new TimeOfDayImpl();
    t.set(91800 + 5);
    expect(t.dayTick()).toBe(5);
    expect(t.day()).toBe(0);
  });
  it.fails('時間帯が変わったときだけ知らせる。解除できる（はじまりは 9000）', () => {
    const t = new TimeOfDayImpl();
    const seen: DayPhase[] = [];
    const off = t.onPhaseChange((p) => seen.push(p));
    steps(t, 54000 - 9000);
    t.set(59400);
    t.set(59500);
    t.set(86400);
    expect(seen).toEqual(['dusk', 'night', 'dawn']);
    off();
    t.set(0);
    expect(seen).toHaveLength(3);
  });
});

describe('空と明るさ（AC2）', () => {
  it.fails('ひる・よる の色と明るさ（夜の外の明るさ 0.25）', () => {
    const t = new TimeOfDayImpl();
    expect(t.skyColor()).toBe('#8FD3FF');
    expect(t.brightness()).toBe(1);
    expect(t.dollBrightness()).toBe(1);
    t.set(60000);
    expect(t.skyColor()).toBe('#1B2350');
    expect(t.brightness()).toBeCloseTo(0.25);
    expect(t.dollBrightness()).toBeCloseTo(0.75);
  });
  it('ゆうがた の まん中は 0.6〜0.85、ゆうやけ色', () => {
    const t = new TimeOfDayImpl();
    t.set(56700);
    expect(t.brightness()).toBeGreaterThan(0.6);
    expect(t.brightness()).toBeLessThan(0.85);
    expect(t.skyColor()).toBe('#FF9E6B');
  });
  it('どの 2 ステップのあいだでも明るさの差は 0.01 以下（1 日ぜんぶ）', () => {
    const t = new TimeOfDayImpl();
    let prev = t.brightness();
    let prevDoll = t.dollBrightness();
    for (let i = 0; i < 91800; i++) {
      t.update();
      expect(Math.abs(t.brightness() - prev)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(t.dollBrightness() - prevDoll)).toBeLessThanOrEqual(0.01);
      prev = t.brightness();
      prevDoll = t.dollBrightness();
    }
  });
  it.fails('あさ は よる から ひる へ戻る（夜の外の明るさ 0.25）', () => {
    const t = new TimeOfDayImpl();
    t.set(86400);
    expect(t.brightness()).toBeCloseTo(0.25);
    t.set(86400 + 2700);
    expect(t.skyColor()).toBe('#FFC48A');
    t.set(91799);
    expect(t.brightness()).toBeGreaterThan(0.99);
  });
});
