import { describe, expect, it } from 'vitest';
import { FrameStats } from './frameStats';

describe('FrameStats', () => {
  it('空のときは 0', () => {
    const s = new FrameStats();
    expect(s.averageMs).toBe(0);
    expect(s.fps).toBe(0);
  });

  it('平均・最悪値・fps を出す', () => {
    const s = new FrameStats();
    [10, 20, 30].forEach((ms) => s.add(ms));
    expect(s.averageMs).toBe(20);
    expect(s.worstMs).toBe(30);
    expect(s.fps).toBe(50);
  });

  it('古いサンプルは捨てる', () => {
    const s = new FrameStats(2);
    [100, 10, 10].forEach((ms) => s.add(ms));
    expect(s.count).toBe(2);
    expect(s.averageMs).toBe(10);
  });
});
