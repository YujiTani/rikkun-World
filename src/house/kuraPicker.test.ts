import { describe, expect, it } from 'vitest';
import { KuraPicker } from './kuraPicker';

/** HOUSE-1A: くらの 画面の 数の えらび（マスを えらぶ → 数を 1 〜 動かせる 数 の 間で かえる）。画面の 外で 数だけ 確かめる */

describe('くらの 数の えらび', () => {
  it('はじめは 何も えらんで いない。数は 1', () => {
    const p = new KuraPicker();
    expect(p.sel).toBeNull();
    expect(p.amount).toBe(1);
    expect(p.action()).toBeNull();
  });

  it('持ち物の マスを えらぶと「あずける」だけ、くらの マスを えらぶと「とりだす」だけ。えらびなおすと 数は 1 に もどる', () => {
    const p = new KuraPicker();
    p.select('bag', 'log');
    expect(p.action()).toBe('deposit');
    p.plus(10, 30);
    expect(p.amount).toBe(11);
    p.select('store', 'log');
    expect(p.action()).toBe('withdraw');
    expect(p.amount).toBe(1);
    p.select('bag', 'stone');
    expect(p.sel).toEqual({ side: 'bag', item: 'stone' });
  });

  it('+10 / −10 / +1 / −1 は 1 〜 動かせる 数 の 間に おさまる（はみ出さない）', () => {
    const p = new KuraPicker();
    p.select('bag', 'log');
    p.plus(10, 25);
    p.plus(10, 25);
    p.plus(10, 25);
    expect(p.amount).toBe(25);
    p.plus(1, 25);
    expect(p.amount).toBe(25);
    p.plus(-10, 25);
    p.plus(-10, 25);
    p.plus(-10, 25);
    expect(p.amount).toBe(1);
    p.plus(-1, 25);
    expect(p.amount).toBe(1);
    // 1 → +10 → −1
    p.plus(10, 25);
    p.plus(-1, 25);
    expect(p.amount).toBe(10);
  });

  it('ぜんぶ = 動かせる 数。動かせる 数が 0 でも 数は 1 の まま（押しても 何も 動かない）', () => {
    const p = new KuraPicker();
    p.select('store', 'log');
    p.all(10);
    expect(p.amount).toBe(10);
    p.all(0);
    expect(p.amount).toBe(1);
  });

  it('数が 動かせる 数を こえたら（あずけた あとで へった）まるめる。0 になれば えらびを けす', () => {
    const p = new KuraPicker();
    p.select('bag', 'log');
    p.all(20);
    expect(p.amount).toBe(20);
    p.fit(8);
    expect(p.amount).toBe(8);
    expect(p.sel).not.toBeNull();
    p.fit(0);
    expect(p.sel).toBeNull();
    expect(p.amount).toBe(1);
  });

  it('clear で えらびを けす', () => {
    const p = new KuraPicker();
    p.select('bag', 'log');
    p.plus(10, 99);
    p.clear();
    expect(p.sel).toBeNull();
    expect(p.amount).toBe(1);
  });
});
