import { describe, expect, it } from 'vitest';
import { BUILD_WORDS, buildWord } from './words';

/** AC22（決定 2026-10-31-house-build-time-words.md）: 進みが 1/3 未満・4/5 未満・それ いご で 言い方が かわる。分け目の ちょうど */
describe('のこりの 言い方（AC22）', () => {
  it('長さ 9,000: 0〜2,999 は はじめた ばかり・3,000〜7,199 は まだまだ・7,200〜8,999 は もうすぐ', () => {
    for (const [e, w] of [[0, 0], [2999, 0], [3000, 1], [7199, 1], [7200, 2], [8999, 2]] as const) expect(buildWord(e, 9000), `${e}`).toBe(BUILD_WORDS[w]);
  });
  it('長さ 16,200: 5,399 は はじめた ばかり・5,400 は まだまだ・12,959 は まだまだ・12,960 は もうすぐ', () => {
    for (const [e, w] of [[5399, 0], [5400, 1], [12959, 1], [12960, 2]] as const) expect(buildWord(e, 16200), `${e}`).toBe(BUILD_WORDS[w]);
  });
  it('3 つの 言い方は ひらがな・カタカナ・記号だけ（漢字を 使わない）', () => {
    for (const w of BUILD_WORDS) expect(/[一-鿿]/.test(w), w).toBe(false);
  });
});
