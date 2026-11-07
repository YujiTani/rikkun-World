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
  // COOP-1 4a（§3.3・AC78・AC88）: 2 人用 もちもの画面の「やめる」（パネルの はばいっぱいの ボタン）へ、はしの マスからも 十字の 下で 行ける
  describe('はばの 広い ボタンは 今の 物の まっすぐ 先に 入っていれば 行ける', () => {
    const wide: FocusBox[] = [
      { id: 'slot0', l: 20, t: 400, w: 48, h: 48 },
      { id: 'slot8', l: 420, t: 400, w: 48, h: 48 },
      { id: 'quit', l: 10, t: 520, w: 480, h: 56 },
    ];
    it('左はしの マスからも 右はしの マスからも 下で やめる に 行ける（中心が 遠くても）', () => {
      expect(pickNext(wide, 'slot0', 'down')).toBe('quit');
      expect(pickNext(wide, 'slot8', 'down')).toBe('quit');
    });
    it('やめる から 上へ もどれる', () => {
      expect(['slot0', 'slot8']).toContain(pickNext(wide, 'quit', 'up'));
    });
  });

  describe('1 人の 全面の もちもの・つくる（実際の 寸法。gamepad1 e2e の 道すじ）', () => {
    const full: FocusBox[] = [
      { id: 'equip', l: 414, t: 102, w: 30, h: 30 },
      { id: 'slot13', l: 448, t: 152, w: 30, h: 30 },
      { id: 'slot35', l: 584, t: 220, w: 30, h: 30 },
      { id: 'tile1', l: 649, t: 110, w: 34, h: 34 },
      { id: 'tile4', l: 751, t: 110, w: 34, h: 34 },
      { id: 'tileY', l: 649, t: 212, w: 34, h: 34 },
      { id: 'tileY4', l: 751, t: 212, w: 34, h: 34 },
      { id: 'close', l: 887, t: 37, w: 82, h: 56 },
      { id: 'next', l: 907, t: 171, w: 45, h: 56 },
    ];
    it('そうびの マスから 右へ は、遠い 一覧の タイルへ とばず 近い もちものの マスへ', () => {
      expect(pickNext(full, 'equip', 'right')).toBe('slot13');
    });
    it('もちものの マスから 右へ 同じ 行の タイルへ', () => {
      expect(pickNext(full, 'slot35', 'right')).toBe('tileY');
    });
    it('一覧の 右はしの タイルから 右へ せつめいの ボタンへ', () => {
      expect(pickNext(full, 'tileY4', 'right')).toBe('next');
    });
  });
});
