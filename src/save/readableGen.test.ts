import { describe, expect, it } from 'vitest';
import { OLDEST_READABLE_GEN, SAVE_GEN, isReadableGen } from './SaveManager';

/**
 * MINE-1A（docs/design/MINE-1.md §4.8）の 内がわの 部品: 読める 保存の 版。
 * 「つづきから」（lastWorld.ts）と ファイルの 読みこみ（portable.ts）は この 1 か所の 決まりを 使う（#304）。
 * 外から 見える ふるまいは mineSave.test.ts・lastWorld.test.ts。
 */
describe('読める 保存の 版（3 から 今の 版まで）', () => {
  it('いちばん 古い 読める 版は 3（仕様の 数）。今の 版は それより 新しい', () => {
    expect(OLDEST_READABLE_GEN).toBe(3);
    expect(SAVE_GEN).toBeGreaterThan(OLDEST_READABLE_GEN);
  });

  it('版 2 いかは 読まない・3 から 今の 版までは 読む・今の 版より 新しい 物は 読まない', () => {
    expect(isReadableGen(1)).toBe(false);
    expect(isReadableGen(2)).toBe(false);
    expect(isReadableGen(OLDEST_READABLE_GEN)).toBe(true);
    for (let g = OLDEST_READABLE_GEN; g <= SAVE_GEN; g++) expect(isReadableGen(g), `版 ${g}`).toBe(true);
    expect(isReadableGen(SAVE_GEN + 1)).toBe(false);
  });

  it('整数でない・数でない 版は 読まない', () => {
    expect(isReadableGen(3.5)).toBe(false);
    expect(isReadableGen(Number.NaN)).toBe(false);
  });
});
