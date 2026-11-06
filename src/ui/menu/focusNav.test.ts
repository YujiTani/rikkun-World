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

  describe('まとまり', () => {
    const g: FocusBox[] = [
      { id: 'tile', l: 100, t: 300, w: 60, h: 60 },
      { id: 'next', l: 900, t: 160, w: 40, h: 40 },
      { id: 'press', l: 800, t: 550, w: 150, h: 40 },
    ];
    const grouped = g.map((b) => (b.id === 'tile' ? b : { ...b, group: 'detail' }));
    it('まとまりの外から右で まとまりに入る', () => {
      expect(pickNext(grouped, 'tile', 'right')).toBe('next');
    });
    it('まとまりの中を 先にえらぶ（外に近い項目があっても）', () => {
      const withNear = [...grouped, { id: 'near', l: 890, t: 300, w: 60, h: 60 }];
      expect(pickNext(withNear, 'next', 'down')).toBe('press');
      // まとまりなしなら 近いほう（near）に 行ってしまう
      expect(pickNext(withNear.map(({ group: _g, ...b }) => b), 'next', 'down')).toBe('near');
    });
    it('まとまりの中に候補がなければ 外へ出られる', () => {
      expect(pickNext(grouped, 'next', 'left')).toBe('tile');
    });
  });
});
