// START-1 AC3: シードの 入力（仕様 §2.2・§4.2）。
// 窓口の 名前（実装は これに 合わせる）: src/start/seedInput.ts の
//   SEED_MAX_DIGITS = 9
//   appendSeedDigit(text: string, digit: string): { text: string; rejected: boolean }
//     digit は '0'〜'9' の 1 字。9 けたの あとは text そのまま・rejected: true（まどが ゆれる 合図）。
//     先の 0 は のこさない（text が '' か '0' の ときに 数字を 足すと その数字だけ になる。'0' の あとの '0' は '0'）。
//   backspaceSeed(text: string): string          空で 呼んでも 空
//   seedFromText(text: string): number           空 → GEN_CONFIG.defaultSeed（20261012）。ほかは Number(text)
//   randomSeed(rng: () => number): number        rng は [0,1)。1〜9999 の 整数（どれも 同じ 割合）
//   seedTextFromUrl(search: string): string      ?seed=5 → '5'。ない・整数でない・負・9 けたを こえる → ''
import { describe, expect, it } from 'vitest';
import { GEN_CONFIG } from '../world/gen/config';
import { SEED_MAX_DIGITS, appendSeedDigit, backspaceSeed, randomSeed, seedFromText, seedTextFromUrl } from './seedInput';

const type = (digits: string, from = ''): string => [...digits].reduce((t, d) => appendSeedDigit(t, d).text, from);

/** テスト用の シード付き 乱数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('AC3 シードの 入力', () => {
  it('9 けたまで', () => expect(SEED_MAX_DIGITS).toBe(9));

  it('空 → ふだんの シード 20261012', () => {
    expect(seedFromText('')).toBe(GEN_CONFIG.defaultSeed);
    expect(seedFromText('')).toBe(20261012);
  });
  it('1・2・3 → "123"（数は 123）', () => {
    const t = type('123');
    expect(t).toBe('123');
    expect(seedFromText(t)).toBe(123);
  });
  it('0 → "0"、そのあと 5 → "5"（先の 0 は のこさない）', () => {
    expect(appendSeedDigit('', '0')).toEqual({ text: '0', rejected: false });
    expect(appendSeedDigit('0', '5')).toEqual({ text: '5', rejected: false });
    expect(seedFromText('0')).toBe(0);
  });
  it('0 を 2 回 押しても "0" のまま（"007" に ならない）', () => {
    expect(type('007')).toBe('7');
    expect(type('00')).toBe('0');
  });
  it('0 は 先頭以外なら 足す（"10" "100"）', () => {
    expect(type('100')).toBe('100');
  });
  it('9 けた の あと 1 → 9 けたの まま。ゆれの 合図 1 回（rejected）', () => {
    const nine = type('123456789');
    expect(nine).toBe('123456789');
    expect(nine.length).toBe(9);
    const r = appendSeedDigit(nine, '1');
    expect(r).toEqual({ text: '123456789', rejected: true });
    expect(appendSeedDigit(nine.slice(0, 8), '1').rejected).toBe(false);
  });
  it('いちばん大きい 999999999 は 今の 整数の シードに 入る（2,147,483,647 より 小さい）', () => {
    expect(seedFromText(type('999999999'))).toBe(999_999_999);
    expect(999_999_999).toBeLessThan(2_147_483_647);
  });
  it('⌫ で 1 字 へる。空で ⌫ は 空のまま', () => {
    expect(backspaceSeed('123')).toBe('12');
    expect(backspaceSeed('1')).toBe('');
    expect(backspaceSeed('')).toBe('');
    expect(backspaceSeed('0')).toBe('');
  });
  it('数字の 列を 打ってから けして 打ち直せる', () => {
    expect(type('9', backspaceSeed(type('12')))).toBe('19');
  });

  it('ランダム: rng の 両はし（0・1 に 近い）で 1 と 9999', () => {
    expect(randomSeed(() => 0)).toBe(1);
    expect(randomSeed(() => 0.9999999999)).toBe(9999);
  });
  it('ランダムを 1,000 回 → どれも 1〜9999 の 整数', () => {
    const r = rng(20261012);
    for (let i = 0; i < 1000; i++) {
      const n = randomSeed(r);
      expect(Number.isInteger(n), String(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(9999);
    }
  });
  it('ランダムは かたよらない（10 万回で 4 つの 区間が だいたい 同じ）', () => {
    const r = rng(7);
    const bins = [0, 0, 0, 0];
    for (let i = 0; i < 100_000; i++) bins[Math.min(3, Math.floor(((randomSeed(r) - 1) / 9999) * 4))]!++;
    for (const b of bins) expect(Math.abs(b - 25_000)).toBeLessThan(1000);
  });
  it('ランダムで 出た 数は 4 けたまで（書きうつせる）', () => {
    expect(String(randomSeed(() => 0.9999999999)).length).toBeLessThanOrEqual(4);
  });

  it('?menu=1&seed=5 → まどの はじめは "5"（§5）', () => {
    expect(seedTextFromUrl('?menu=1&seed=5')).toBe('5');
    expect(seedTextFromUrl('?seed=0')).toBe('0');
    expect(seedTextFromUrl('?seed=123456789')).toBe('123456789');
  });
  it('?seed が ない・数でない・小数・負・9 けた こえ → 空', () => {
    expect(seedTextFromUrl('')).toBe('');
    expect(seedTextFromUrl('?menu=1')).toBe('');
    expect(seedTextFromUrl('?seed=abc')).toBe('');
    expect(seedTextFromUrl('?seed=1.5')).toBe('');
    expect(seedTextFromUrl('?seed=-3')).toBe('');
    expect(seedTextFromUrl('?seed=1234567890')).toBe('');
    expect(seedTextFromUrl('?seed=')).toBe('');
  });
});
