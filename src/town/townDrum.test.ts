import { describe, expect, it } from 'vitest';
import { TownDrum } from './townDrum';

/** TOWN-1 1B-2 AC47: ゴールの 太鼓。はじめて たたいた 人だけ cleared・「ゴール！」は 人ごとに 1 回・保存 */
const AT = { x: 100, y: 20, z: 50 };

describe('太鼓', () => {
  it('はじめは 2 人とも false。ねらいの マスだけ 太鼓', () => {
    const d = new TownDrum(AT);
    expect(d.cleared(1)).toBe(false);
    expect(d.cleared(2)).toBe(false);
    expect(d.isDrum(100, 20, 50)).toBe(true);
    expect(d.isDrum(101, 20, 50)).toBe(false);
    expect(d.isDrum(100, 21, 50)).toBe(false);
  });

  it('はじめて たたくと ゴール 1 回、2 回目は なし（音だけ）。1P が たたいても 2P は false', () => {
    const d = new TownDrum(AT);
    expect(d.hit(1)).toEqual({ first: true });
    expect(d.hit(1)).toEqual({ first: false });
    expect(d.hit(1)).toEqual({ first: false });
    expect(d.cleared(1)).toBe(true);
    expect(d.cleared(2)).toBe(false);
    expect(d.hit(2)).toEqual({ first: true });
    expect(d.cleared(2)).toBe(true);
  });

  it('セーブして 開きなおしても 同じ。古い・こわれた 記録は 2 人とも false', () => {
    const d = new TownDrum(AT);
    d.hit(2);
    const e = new TownDrum(AT);
    e.deserialize(JSON.parse(JSON.stringify(d.serialize())));
    expect(e.cleared(1)).toBe(false);
    expect(e.cleared(2)).toBe(true);
    expect(e.hit(2)).toEqual({ first: false });
    for (const bad of [null, undefined, 5, { v: 9 }, { v: 1, cleared: 'x' }]) {
      const f = new TownDrum(AT);
      f.deserialize(bad);
      expect(f.cleared(1) || f.cleared(2)).toBe(false);
    }
  });
});
