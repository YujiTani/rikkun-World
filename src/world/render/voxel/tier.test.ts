import { describe, expect, it } from 'vitest';
import { BOX_OUTER, DEFAULT_MICRO_R, MICRO_RADII, columnDistance, nextTier, normalizeMicroR, type Tier } from './tier';

describe('近さの段 nextTier（VOX-E）', () => {
  it('はじめ（いまの段なし）は 境目そのもので決める。既定は r=32', () => {
    expect(DEFAULT_MICRO_R).toBe(32);
    expect(nextTier(0, null, 32)).toBe('micro');
    expect(nextTier(32, null, 32)).toBe('micro');
    expect(nextTier(32.1, null, 32)).toBe('box');
    expect(nextTier(BOX_OUTER, null, 32)).toBe('box');
    expect(nextTier(BOX_OUTER + 0.1, null, 32)).toBe('lod');
  });

  it.each(MICRO_RADII)('r=%i: 小ブロックから出るのは r+2、入るのは r−2（±2 のずらし）', (r) => {
    expect(nextTier(r + 2, 'micro', r)).toBe('micro');
    expect(nextTier(r + 2.01, 'micro', r)).toBe('box');
    expect(nextTier(r - 2, 'box', r)).toBe('micro');
    expect(nextTier(r - 1.99, 'box', r)).toBe('box');
    // 境目のあたりで行ったり来たりしても 段は変わらない（チラつかない）
    let t: Tier = 'micro';
    for (const d of [r - 1, r, r + 1, r + 2, r + 1, r, r - 1]) t = nextTier(d, t, r);
    expect(t).toBe('micro');
    t = 'box';
    for (const d of [r + 1, r, r - 1, r - 2, r - 1, r, r + 1]) t = nextTier(d, t, r);
    expect(t).toBe('micro'); // r−2 に入った 1 回だけ micro になり、そのあと r+1 までは micro のまま
  });

  it('箱から LOD に出るのは 48+2、入るのは 48−2', () => {
    expect(nextTier(50, 'box', 32)).toBe('box');
    expect(nextTier(50.01, 'box', 32)).toBe('lod');
    expect(nextTier(46, 'lod', 32)).toBe('box');
    expect(nextTier(46.01, 'lod', 32)).toBe('lod');
  });

  it('いっきに遠くへ（テレポート）: 小ブロックから LOD、LOD から小ブロックにも なれる', () => {
    expect(nextTier(100, 'micro', 32)).toBe('lod');
    expect(nextTier(3, 'lod', 32)).toBe('micro');
    expect(nextTier(40, 'micro', 32)).toBe('box');
  });

  it('r を 16 / 24 / 32 に切りかえると 同じ距離でも段が変わる', () => {
    expect(nextTier(20, 'micro', 32)).toBe('micro');
    expect(nextTier(20, 'micro', 16)).toBe('box'); // 18 をこえた
    expect(nextTier(20, 'micro', 24)).toBe('micro');
    expect(nextTier(27, 'micro', 24)).toBe('box');
    expect(nextTier(27, 'box', 32)).toBe('micro');
    expect(nextTier(31, 'box', 32)).toBe('box'); // 入るのは 30 まで
  });

  it('段の幅は テストが見る範囲に入る（小ブロック ≤ r+2、箱 r−2 〜 48+2）', () => {
    let microMax = 0;
    let boxMin = Infinity;
    let boxMax = 0;
    let prev: Tier | null = null;
    for (let d = 0; d <= 120; d += 0.5) {
      const t = nextTier(d, prev, 32);
      prev = t;
      if (t === 'micro') microMax = Math.max(microMax, d);
      if (t === 'box') {
        boxMin = Math.min(boxMin, d);
        boxMax = Math.max(boxMax, d);
      }
    }
    expect(microMax).toBeLessThanOrEqual(34);
    expect(boxMin).toBeGreaterThanOrEqual(30);
    expect(boxMax).toBeLessThanOrEqual(50);
  });
});

describe('normalizeMicroR / columnDistance', () => {
  it('16 / 24 / 32 のどれかに直す', () => {
    expect(normalizeMicroR(16)).toBe(16);
    expect(normalizeMicroR(24)).toBe(24);
    expect(normalizeMicroR(32)).toBe(32);
    expect(normalizeMicroR(10)).toBe(16);
    expect(normalizeMicroR(1000)).toBe(32);
    expect(normalizeMicroR(27)).toBe(24);
  });

  it('列の中にいれば 0、外なら いちばん近い点まで（水平）', () => {
    expect(columnDistance(2, 2, 40, 40)).toBe(0);
    expect(columnDistance(0, 0, 32, 8)).toBe(16);
    expect(columnDistance(0, 0, 19, 19)).toBeCloseTo(Math.hypot(3, 3), 6);
  });
});
