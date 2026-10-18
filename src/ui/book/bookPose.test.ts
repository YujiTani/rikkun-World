import { describe, expect, it } from 'vitest';
import { bookPose } from './bookPose';

const base = { turnDir: 1 as const, closeFromE: 1 };
describe('本の 姿勢', () => {
  it('とじていて 動きなしなら 見えない。ひらいて 止まれば e ＝ 1', () => {
    expect(bookPose({ ...base, view: 'closed', anim: 'none', p: 1 }).visible).toBe(false);
    expect(bookPose({ ...base, view: 'toc', anim: 'none', p: 1 })).toMatchObject({ visible: true, e: 1, grow: 1, leaf: null });
  });
  it('あらわれる: とじた まま 大きくなる。ひらく: e が 0 → 1', () => {
    expect(bookPose({ ...base, view: 'toc', anim: 'appear', p: 0 })).toMatchObject({ e: 0, grow: 0 });
    expect(bookPose({ ...base, view: 'toc', anim: 'appear', p: 1 })).toMatchObject({ e: 0, grow: 1 });
    expect(bookPose({ ...base, view: 'toc', anim: 'open', p: 0 }).e).toBe(0);
    expect(bookPose({ ...base, view: 'toc', anim: 'open', p: 1 }).e).toBe(1);
    expect(bookPose({ ...base, view: 'toc', anim: 'open', p: 0.5 }).e).toBeCloseTo(0.5);
  });
  it('めくる: 紙が 0 → π（もどるは π → 0）', () => {
    expect(bookPose({ ...base, view: 'item', anim: 'turn', p: 0 }).leaf).toBe(0);
    expect(bookPose({ ...base, view: 'item', anim: 'turn', p: 1 }).leaf).toBeCloseTo(Math.PI);
    expect(bookPose({ ...base, turnDir: -1, view: 'item', anim: 'turn', p: 0 }).leaf).toBeCloseTo(Math.PI);
    expect(bookPose({ ...base, turnDir: -1, view: 'item', anim: 'turn', p: 1 }).leaf).toBeCloseTo(0);
  });
  it('ゆれは 1 回で もとにもどる。とじる: 途中から とじても とびはねない', () => {
    expect(bookPose({ ...base, view: 'item', anim: 'bump', p: 0 }).shake).toBe(0);
    expect(Math.abs(bookPose({ ...base, view: 'item', anim: 'bump', p: 1 }).shake)).toBeLessThan(1e-9);
    expect(bookPose({ ...base, view: 'toc', anim: 'close', p: 0, closeFromE: 0.4 }).e).toBeCloseTo(0.4);
    expect(bookPose({ ...base, view: 'toc', anim: 'close', p: 0.7 }).e).toBeCloseTo(0);
    expect(bookPose({ ...base, view: 'toc', anim: 'close', p: 1 })).toMatchObject({ e: 0, grow: 0 });
  });
});
