import { describe, expect, it } from 'vitest';
import { PAD_CHOICE_KEY, decidePadChoice, defaultPadChoice, listPads, readPadChoice, writePadChoice, type PadChoice } from './padChoice';
import { FakeStorage, fakePad } from './testPad';

/**
 * COOP-1 作業 2.5（#401。docs/design/COOP-1.md §2.7・§9.6）の 先行テスト（赤）。AC48・AC49・名前（§2.7）。
 * 部品の 形は src/input/gamepad/padChoice.ts の 先頭の 約束。
 */

describe('AC48: 保存を 読む（こわれた 値は null = はじめの 動き。エラーも 書きかえも しない）', () => {
  const broken: Array<[string, string | null]> = [
    ['保存なし', null],
    ['JSON でない', 'not json{'],
    ['文字だけ', '"abc"'],
    ['配列', '[0,1]'],
    ['数', '3'],
    ['p2 が ない', '{"p1":0}'],
    ['知らない 値（4）', '{"p1":4,"p2":0}'],
    ['知らない 値（-1）', '{"p1":-1,"p2":0}'],
    ['小数', '{"p1":0.5,"p2":1}'],
    ['文字の 番号', '{"p1":"0","p2":1}'],
    ['1P と 2P が 同じ 番号', '{"p1":1,"p2":1}'],
    ['2 人とも パッドなし', '{"p1":null,"p2":null}'],
    ['undefined 相当（キーなし）', '{}'],
  ];
  for (const [name, raw] of broken) {
    it(`${name} → null。何も 書かない`, () => {
      const st = new FakeStorage(raw === null ? {} : { [PAD_CHOICE_KEY]: raw });
      expect(readPadChoice(st)).toBeNull();
      expect(st.writes).toBe(0);
      expect(st.data.get(PAD_CHOICE_KEY) ?? null).toBe(raw);
    });
  }

  it('localStorage が 投げても・つかえなくても（null）エラーに ならない', () => {
    expect(readPadChoice(new FakeStorage({}, { get: true }))).toBeNull();
    expect(readPadChoice(null)).toBeNull();
  });

  it('正しい 値は そのまま 読める（null は パッドなし）', () => {
    expect(readPadChoice(new FakeStorage({ [PAD_CHOICE_KEY]: '{"p1":3,"p2":2}' }))).toEqual({ p1: 3, p2: 2 });
    expect(readPadChoice(new FakeStorage({ [PAD_CHOICE_KEY]: '{"p1":null,"p2":0}' }))).toEqual({ p1: null, p2: 0 });
    expect(readPadChoice(new FakeStorage({ [PAD_CHOICE_KEY]: '{"p1":2,"p2":null}' }))).toEqual({ p1: 2, p2: null });
  });

  it('write は §9.6 の 形（{"p1","p2"}）で 1 つの キーに 入れる。投げる storage でも 投げ返さない', () => {
    const st = new FakeStorage();
    writePadChoice(st, { p1: 1, p2: null });
    expect(PAD_CHOICE_KEY).toBe('rikkun.duo.pads.v1');
    expect(JSON.parse(st.data.get(PAD_CHOICE_KEY)!)).toEqual({ p1: 1, p2: null });
    expect([...st.data.keys()]).toEqual([PAD_CHOICE_KEY]);
    expect(() => writePadChoice(new FakeStorage({}, { set: true }), { p1: 0, p2: 1 })).not.toThrow();
    expect(() => writePadChoice(null, { p1: 0, p2: 1 })).not.toThrow();
  });
});

describe('AC48: はじめの 動き（1P＝番号の いちばん 小さい 物、2P＝その つぎ）', () => {
  it('つながっている 番号から きまる', () => {
    expect(defaultPadChoice([])).toEqual({ p1: null, p2: null });
    expect(defaultPadChoice([3])).toEqual({ p1: 3, p2: null });
    expect(defaultPadChoice([0, 1])).toEqual({ p1: 0, p2: 1 });
    expect(defaultPadChoice([1, 3])).toEqual({ p1: 1, p2: 3 });
    expect(defaultPadChoice([0, 1, 2, 3])).toEqual({ p1: 0, p2: 1 });
  });
});

describe('AC49: 入れかえ', () => {
  it('(a) つながり 0・1、{p1:0,p2:1} で 1P に 1 → {p1:1,p2:0}。相手が かわった', () => {
    expect(decidePadChoice({ p1: 0, p2: 1 }, 1, 1, [0, 1])).toEqual({ choice: { p1: 1, p2: 0 }, swapped: true });
  });
  it('(b) つながり 0 だけ、{p1:0,p2:null} で 2P に 0 → {p1:null,p2:0}', () => {
    expect(decidePadChoice({ p1: 0, p2: null }, 2, 0, [0])).toEqual({ choice: { p1: null, p2: 0 }, swapped: true });
  });
  it('(c) つながり 0・1・2、{p1:0,p2:2} で 2P に 0 → {p1:1,p2:0}', () => {
    expect(decidePadChoice({ p1: 0, p2: 2 }, 2, 0, [0, 1, 2])).toEqual({ choice: { p1: 1, p2: 0 }, swapped: true });
  });
  it('相手と ぶつからないときは 相手は そのまま。swapped は false（「きまったよ！」）', () => {
    expect(decidePadChoice({ p1: 0, p2: 1 }, 2, 2, [0, 1, 2])).toEqual({ choice: { p1: 0, p2: 2 }, swapped: false });
    expect(decidePadChoice({ p1: null, p2: 0 }, 1, 1, [0, 1])).toEqual({ choice: { p1: 1, p2: 0 }, swapped: false });
  });
  it('もう 決まっている 物を 決めても かわらない（swapped も false）', () => {
    expect(decidePadChoice({ p1: 0, p2: 1 }, 1, 0, [0, 1])).toEqual({ choice: { p1: 0, p2: 1 }, swapped: false });
  });

  it('つながり 1〜4 本 × こわれていない 決まり方 × 1P・2P × 決める 物: 同じ 番号に ならない・2 つとも null に ならない・決めた 物が 入る', () => {
    const all = [0, 1, 2, 3];
    const subsets: number[][] = [];
    for (let m = 1; m < 16; m++) subsets.push(all.filter((i) => (m >> i) & 1));
    const slots: Array<number | null> = [null, 0, 1, 2, 3];
    let checked = 0;
    for (const connected of subsets) {
      for (const p1 of slots) {
        for (const p2 of slots) {
          if (p1 === p2) continue; // 同じ番号・両方 null は こわれた 値
          const cur: PadChoice = { p1, p2 };
          for (const who of [1, 2] as const) {
            for (const index of connected) {
              const r = decidePadChoice(cur, who, index, connected);
              const label = JSON.stringify({ connected, cur, who, index, r });
              const mine = who === 1 ? r.choice.p1 : r.choice.p2;
              const other = who === 1 ? r.choice.p2 : r.choice.p1;
              expect(mine, label).toBe(index);
              expect(other === mine, label).toBe(false);
              expect(r.choice.p1 === null && r.choice.p2 === null, label).toBe(false);
              const before = who === 1 ? cur.p2 : cur.p1;
              const expectedOther = before !== index ? before : (connected.find((c) => c !== index) ?? null);
              expect(other, label).toBe(expectedOther);
              expect(r.swapped, label).toBe(other !== before);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('§2.7: 名前（つながった 並びで「コントローラー 1・2…」）', () => {
  it('つながっている 物だけ。番号の 小さい 順に 1 から', () => {
    expect(listPads([fakePad(0), fakePad(1)])).toEqual([
      { index: 0, name: 'コントローラー 1' },
      { index: 1, name: 'コントローラー 2' },
    ]);
  });
  it('[null, b] は 番号 1 だけ。名前は「コントローラー 1」（名前は いつも 今の 並び）', () => {
    expect(listPads([null, fakePad(1)])).toEqual([{ index: 1, name: 'コントローラー 1' }]);
  });
  it('connected = false と null は 数えない。0 本は 空', () => {
    expect(listPads([fakePad(0, { connected: false }), null, fakePad(2), fakePad(3)])).toEqual([
      { index: 2, name: 'コントローラー 1' },
      { index: 3, name: 'コントローラー 2' },
    ]);
    expect(listPads([])).toEqual([]);
  });
});
