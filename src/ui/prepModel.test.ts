import { describe, expect, it } from 'vitest';
import { prepDone, prepDots, showPrepCard } from './prepModel';

describe('じゅんびちゅうの 決まり', () => {
  it('できた数 = floor(p × 5)', () => {
    expect([0, 0.19, 0.2, 0.5, 0.99, 1].map(prepDone)).toEqual([0, 0, 1, 2, 4, 5]);
    expect(prepDone(NaN)).toBe(0);
    expect(prepDone(1.2)).toBe(5);
  });
  it('「・」は 0.5 秒ごとに 0〜3', () => {
    expect([0, 499, 500, 1000, 1500, 2000].map(prepDots)).toEqual([0, 0, 1, 2, 3, 0]);
  });
  it('カードは 待ちが 30 コマを こえたとき', () => {
    expect(showPrepCard('wait', 30)).toBe(false);
    expect(showPrepCard('wait', 31)).toBe(true);
    expect(showPrepCard('boot', 99)).toBe(false);
    expect(showPrepCard('play', 99)).toBe(false);
  });
});
