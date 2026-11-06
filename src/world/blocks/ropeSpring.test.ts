import { describe, expect, it } from 'vitest';
import { ROPE_TUNING } from './rope';
import { springStep, springSettled, type SpringState } from './ropeSpring';

/** ROPE-1 版 5 AC41: ゴムの ばね（k=100・c=5）は 衝撃の あと 平衡点の まわりで ゆれて おさまる */
const K = ROPE_TUNING.springStiffness;
const C = ROPE_TUNING.springDamping;
const DT = 1 / 60;

describe('ropeSpring', () => {
  it('しょきちは k=100・c=5', () => {
    expect(K).toBe(100);
    expect(C).toBe(5);
  });
  it('衝撃（速さ）を あたえると 平衡点を こえて 上下に ゆれる（符号が かわる）', () => {
    const s: SpringState = { x: 0, v: -8 };
    let flips = 0;
    let prev = 0;
    for (let i = 0; i < 120; i++) {
      springStep(s, K, C, DT);
      const sign = Math.sign(s.x);
      if (sign !== 0 && prev !== 0 && sign !== prev) flips++;
      if (sign !== 0) prev = sign;
    }
    expect(flips).toBeGreaterThanOrEqual(3);
  });
  it('ゆれの 山は だんだん 小さく なる（減衰）', () => {
    const s: SpringState = { x: 0, v: -8 };
    const peaks: number[] = [];
    let last = 0;
    let rising = false;
    for (let i = 0; i < 180; i++) {
      springStep(s, K, C, DT);
      const a = Math.abs(s.x);
      if (a < last && rising) peaks.push(last);
      rising = a > last;
      last = a;
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
  });
  it('3 秒で おさまる。減衰 0 なら おさまらない', () => {
    const s: SpringState = { x: 0, v: -8 };
    for (let i = 0; i < 180; i++) springStep(s, K, C, DT);
    expect(springSettled(s)).toBe(true);
    const free: SpringState = { x: 0, v: -8 };
    for (let i = 0; i < 180; i++) springStep(free, K, 0, DT);
    expect(springSettled(free)).toBe(false);
  });
});
