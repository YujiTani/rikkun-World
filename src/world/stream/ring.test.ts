import { afterEach, describe, expect, it } from 'vitest';
import { RING_FULL, RING_SMALL, decideRing, getRing, setRing } from './ring';

describe('decideRing（#203）', () => {
  it('なにも無ければ full', () => {
    expect(decideRing('', undefined)).toBe(RING_FULL);
    expect(RING_FULL).toMatchObject({ draw: 6, light: 7, gen: 8, keep: 10, drawDrop: 7, maxColumns: 441 });
  });
  it('環境変数 small なら small', () => {
    expect(decideRing('', 'small')).toBe(RING_SMALL);
    expect(RING_SMALL).toMatchObject({ draw: 4, light: 5, gen: 6, keep: 8, drawDrop: 5, maxColumns: 289 });
  });
  it('URL が環境変数に勝つ', () => {
    expect(decideRing('?ring=full', 'small')).toBe(RING_FULL);
    expect(decideRing('?a=1&ring=small', undefined)).toBe(RING_SMALL);
  });
  it('ほかの値は無いのと同じ', () => {
    expect(decideRing('?ring=big', 'small')).toBe(RING_SMALL);
    expect(decideRing('?ring=', 'x')).toBe(RING_FULL);
  });
  it('開始の条件 K1（半径 4）より描く輪が小さくならない', () => {
    expect(RING_SMALL.draw).toBeGreaterThanOrEqual(4);
  });
  describe('setRing', () => {
    afterEach(() => setRing(RING_FULL));
    it('決めた値を読める', () => {
      expect(getRing()).toBe(RING_FULL);
      setRing(RING_SMALL);
      expect(getRing()).toBe(RING_SMALL);
    });
  });
});
