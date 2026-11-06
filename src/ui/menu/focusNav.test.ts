import { describe, expect, it } from 'vitest';
import { pickNext, type FocusBox } from './focusNav';

const boxes: FocusBox[] = [
  { id: 'a', l: 0, t: 0, w: 100, h: 40 },
  { id: 'b', l: 0, t: 50, w: 100, h: 40 },
  { id: 'c', l: 0, t: 100, w: 100, h: 40 },
];

describe('メニューのフォーカス', () => {
  it('今の位置がなければ先頭', () => {
    expect(pickNext(boxes, null, 'down')).toBe('a');
  });
  it('下で次の行、上で前の行', () => {
    expect(pickNext(boxes, 'a', 'down')).toBe('b');
    expect(pickNext(boxes, 'b', 'up')).toBe('a');
  });
  it('端ではその場', () => {
    expect(pickNext(boxes, 'a', 'up')).toBe('a');
    expect(pickNext(boxes, 'c', 'down')).toBe('c');
  });
  it('横に項目がなければ動かない', () => {
    expect(pickNext(boxes, 'b', 'left')).toBe('b');
    expect(pickNext(boxes, 'b', 'right')).toBe('b');
  });
});
