import { describe, expect, it } from 'vitest';
import { bagVia } from './whoPort';

describe('bagVia（話した 人の もちものへ とりつぐ）', () => {
  it('呼ぶ たびに いまの もちものへ。かわれば かわった 方へ', () => {
    const a = { n: 1, get: () => 'a' };
    const b = { n: 2, get: () => 'b' };
    let cur = a;
    const v = bagVia(() => cur);
    expect(v.n).toBe(1);
    expect(v.get()).toBe('a');
    cur = b;
    expect(v.n).toBe(2);
    expect(v.get()).toBe('b');
  });
  it('メソッドの 包みは 使いまわす（読む たびに 新しい 関数を 作らない）', () => {
    const v = bagVia(() => ({ get: () => 1 }));
    expect(v.get).toBe(v.get);
  });
  it('書きこみは エラー', () => {
    const v = bagVia(() => ({ n: 1 }));
    expect(() => {
      v.n = 2;
    }).toThrow();
  });
});
