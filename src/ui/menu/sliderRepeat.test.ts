import { describe, expect, it } from 'vitest';
import { RepeatCounter, SLIDER_REPEAT, repeatStepCount, repeatTotal } from './sliderRepeat';

const DT = 1 / 60;

/** 1/60 秒ずつ 押しつづけて、各ステップで 動かした 回数を 返す */
function hold(seconds: number, c = new RepeatCounter()): number[] {
  const out: number[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) out.push(c.step(DT));
  return out;
}

describe('つまみの 長押し くりかえし', () => {
  it('0.3 秒より前は 0 回', () => {
    expect(repeatTotal(0)).toBe(0);
    expect(repeatTotal(0.29)).toBe(0);
    expect(hold(0.29).every((n) => n === 0)).toBe(true);
  });
  it('0.3 秒を すぎると 動きはじめ、だんだん 速くなる', () => {
    expect(repeatTotal(0.5)).toBe(2);
    expect(repeatTotal(0.8)).toBe(5);
    expect(repeatTotal(1.3)).toBe(15);
    expect(repeatTotal(1.3 + 1)).toBe(75);
  });
  it('0.4 秒から 押しつづけると 2 秒以内に 0 から 18 までとどく（1 押し 0.5 = 36 回）', () => {
    // 0.4 秒の ぶん（0.1 秒）は すでに 押していた 扱いなので、2 秒 ぶんの 差を 数える
    const need = 18 / 0.5;
    expect(repeatTotal(0.4 + 2) - repeatTotal(0.4)).toBeGreaterThanOrEqual(need);
    // 1 ステップずつ 回しても、2.4 秒で 足りる
    expect(hold(0.4 + 2).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(need);
  });
  it('reset で もどる', () => {
    const c = new RepeatCounter();
    const first = hold(1, c).reduce((a, b) => a + b, 0);
    expect(first).toBeGreaterThan(0);
    c.reset();
    expect(hold(0.29, c).every((n) => n === 0)).toBe(true);
    expect(hold(1, new RepeatCounter()).reduce((a, b) => a + b, 0)).toBe(first);
  });
  it('1 ステップの 回数に 上限がある', () => {
    expect(repeatStepCount(10, 0)).toBe(SLIDER_REPEAT.maxPerStep);
    for (const n of hold(5)) expect(n).toBeLessThanOrEqual(SLIDER_REPEAT.maxPerStep);
  });
});
