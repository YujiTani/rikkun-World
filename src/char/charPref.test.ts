// CHAR-5 AC1・AC2: はじめの キャラの 決め方と おぼえ方（仕様 §4.1）。
// 窓口の 名前（実装は これに 合わせる）: src/char/charPref.ts の
//   CHAR_STORAGE_KEY・decideChar(search, store)・createCharController({ search, store, onSwitch })
// （SHADOW の shadowPref.ts と 同じ 形）
import { describe, expect, it, vi } from 'vitest';
import { CHAR_STORAGE_KEY, createCharController, decideChar, type KeyValueStore } from './charPref';

type Stored = string | null | 'THROW';
const URLS = ['', '?char=boy', '?char=girl', '?char=block', '?char=xyz'] as const;
const STORED: Stored[] = [null, 'boy', 'girl', 'abc', 'THROW'];

function fakeStore(stored: Stored, writeThrows = false) {
  const writes: string[] = [];
  const reads: string[] = [];
  const store: KeyValueStore = {
    getItem: (k) => {
      reads.push(k);
      if (stored === 'THROW') throw new Error('storage disabled');
      return stored;
    },
    setItem: (k, v) => {
      if (writeThrows) throw new Error('quota');
      writes.push(`${k}=${v}`);
    },
  };
  return { store, writes, reads };
}
const withNosave = (u: string, nosave: boolean): string => (nosave ? (u ? `${u}&nosave=1` : '?nosave=1') : u);

/** 仕様 §4.1 の 表を そのまま 書いた 答え */
function expected(url: string, stored: Stored, nosave: boolean): 'girl' | 'boy' | 'block' {
  const v = new URLSearchParams(url).get('char');
  if (v === 'block') return 'block';
  if (v === 'boy' || v === 'girl') return v;
  if (!nosave && (stored === 'boy' || stored === 'girl')) return stored;
  return 'girl';
}

describe('AC1 はじめの キャラ（URL × おぼえた値 × nosave の ぜんぶ）', () => {
  for (const url of URLS) {
    for (const stored of STORED) {
      for (const nosave of [false, true]) {
        const q = withNosave(url, nosave);
        it(`URL「${q}」・おぼえた値 ${String(stored)} → ${expected(url, stored, nosave)}`, () => {
          const { store } = fakeStore(stored);
          expect(decideChar(q, store)).toBe(expected(url, stored, nosave));
        });
      }
    }
  }
  it('仕様の 例', () => {
    expect(decideChar('', fakeStore('boy').store)).toBe('boy');
    expect(decideChar('?nosave=1', fakeStore('boy').store)).toBe('girl');
    expect(decideChar('?char=girl', fakeStore('boy').store)).toBe('girl');
    expect(decideChar('?char=xyz', fakeStore('boy').store)).toBe('boy');
    expect(decideChar('?char=block', fakeStore('boy').store)).toBe('block');
  });
  it('おぼえる所が 使えない（null）なら 毎回 女の子。URL が あれば その キャラ', () => {
    expect(decideChar('', null)).toBe('girl');
    expect(decideChar('?char=boy', null)).toBe('boy');
  });
  it('?nosave=1 のときは おぼえた値を 読みにも いかない', () => {
    const { store, reads } = fakeStore('boy');
    decideChar('?nosave=1', store);
    expect(reads).toEqual([]);
  });
});

describe('AC2 おぼえる', () => {
  const key = CHAR_STORAGE_KEY;
  it('キーは rikkun.char.v1', () => expect(key).toBe('rikkun.char.v1'));

  for (const nosave of [false, true]) {
    for (const url of URLS) {
      it(`始めたとき「${withNosave(url, nosave)}」: ?char=boy|girl で nosave でなければ だけ 書く`, () => {
        const f = fakeStore(null);
        const onSwitch = vi.fn();
        createCharController({ search: withNosave(url, nosave), store: f.store, onSwitch });
        const v = new URLSearchParams(url).get('char');
        const want = !nosave && (v === 'boy' || v === 'girl') ? [`${key}=${v}`] : [];
        expect(f.writes).toEqual(want);
        expect(onSwitch).not.toHaveBeenCalled(); // 始めるときは 切りかえない（START で 決める）
      });
    }
  }

  it('char.get は {kind}。char.set で 変えると 書いて 読みこみ口(onSwitch)を 1 回', () => {
    const f = fakeStore(null);
    const onSwitch = vi.fn();
    const c = createCharController({ search: '', store: f.store, onSwitch });
    expect(c.get()).toEqual({ kind: 'girl' });
    c.set('boy');
    expect(c.get()).toEqual({ kind: 'boy' });
    expect(f.writes).toEqual([`${key}=boy`]);
    expect(onSwitch.mock.calls).toEqual([['boy']]);
    c.set('girl');
    expect(f.writes).toEqual([`${key}=boy`, `${key}=girl`]);
    expect(onSwitch.mock.calls).toEqual([['boy'], ['girl']]);
  });

  it('同じ キャラの char.set は 書かない・読みこみ口も 呼ばない', () => {
    const f = fakeStore('boy');
    const onSwitch = vi.fn();
    const c = createCharController({ search: '', store: f.store, onSwitch });
    expect(c.get().kind).toBe('boy');
    c.set('boy');
    expect(f.writes).toEqual([]);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('?nosave=1 では char.set でも 書かない（切りかえは する）', () => {
    const f = fakeStore('boy');
    const onSwitch = vi.fn();
    const c = createCharController({ search: '?nosave=1', store: f.store, onSwitch });
    expect(c.get().kind).toBe('girl');
    c.set('boy');
    expect(c.get().kind).toBe('boy');
    expect(onSwitch.mock.calls).toEqual([['boy']]);
    expect(f.writes).toEqual([]);
  });

  it('書くと 例外でも 止まらない（切りかえは できる）', () => {
    const f = fakeStore(null, true);
    const onSwitch = vi.fn();
    expect(() => {
      const c = createCharController({ search: '?char=boy', store: f.store, onSwitch });
      c.set('girl');
      expect(c.get().kind).toBe('girl');
    }).not.toThrow();
    expect(onSwitch.mock.calls).toEqual([['girl']]);
  });

  it('?char=block の char.set は 何もしない（おぼえた値も 書きかえない）', () => {
    const f = fakeStore('girl');
    const onSwitch = vi.fn();
    const c = createCharController({ search: '?char=block', store: f.store, onSwitch });
    expect(c.get().kind).toBe('block');
    c.set('boy');
    c.set('girl');
    expect(c.get().kind).toBe('block');
    expect(f.writes).toEqual([]);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('おぼえる所が null でも 動く', () => {
    const onSwitch = vi.fn();
    const c = createCharController({ search: '?char=boy', store: null, onSwitch });
    c.set('girl');
    expect(c.get().kind).toBe('girl');
  });
});
