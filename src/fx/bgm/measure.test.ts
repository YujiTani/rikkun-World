import { describe, expect, it } from 'vitest';
import { levelStats, seamStats } from './measure';

const SR = 44100;
const sine = (sec: number, amp: number, f = 440): Float32Array => Float32Array.from({ length: Math.round(SR * sec) }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / SR));

describe('数で見る', () => {
  it('ピーク・平均・いちばん大きい 50ms（sine 0.5 → ピーク -6.02 dB・平均 -9.03 dB）', () => {
    const r = levelStats(sine(1, 0.5), SR);
    expect(r.peakDb).toBeCloseTo(-6.02, 1);
    expect(r.rmsDb).toBeCloseTo(-9.03, 1);
    expect(r.loud50Db).toBeCloseTo(-9.03, 1);
  });
  it('無音は -Infinity', () => {
    expect(levelStats(new Float32Array(SR), SR).peakDb).toBe(-Infinity);
  });
  it('いちばん大きい 50ms は 短い大きな音をひろう', () => {
    const x = new Float32Array(SR);
    x.set(sine(0.05, 0.8), SR / 2);
    expect(levelStats(x, SR).loud50Db).toBeGreaterThan(levelStats(x, SR).rmsDb + 10);
  });
  it('つなぎ目: なめらかにつながる sine は 急ではない・段差のある波は 急', () => {
    const smooth = sine(2, 0.5, 441);
    const s = seamStats(smooth, SR, 1);
    expect(s.stepRatio).toBeLessThan(1.001);
    expect(s.levelDiffDb).toBeLessThan(0.1);
    const jump = Float32Array.from(smooth);
    for (let i = SR; i < jump.length; i++) jump[i] += 0.4; // つなぎ目で急に上がる
    const j = seamStats(jump, SR, 1);
    expect(j.stepRatio).toBeGreaterThan(5);
  });
});
