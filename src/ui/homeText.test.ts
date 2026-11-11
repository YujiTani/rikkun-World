import { describe, expect, it } from 'vitest';
import { HOME_TEXT, HOME_TEXT_P2, homeTextOf } from './deathScreenModel';
import { findUnrubiedKanji } from './text';

/**
 * COOP-1 5f-2（docs/design/COOP-1.md 1.17 §3.7 (g) #14・「確かめる 層」、AC178 ①・AC146）のユニットテスト。実装の前に書いた赤のテスト。
 * 2P が 倒れて 戻る とき、2P は スタートでは なく 1P の 横に 戻る ので 文面が ちがう。UI 検査には 入れない（2P が 倒れて 戻る 画面を 作るのが 重い ため。仕様の 「確かめる 層」）。
 *
 * ---- 開発への つなぎ目の 約束 ----
 *   `src/ui/deathScreenModel.ts` に 追加:
 *     export const HOME_TEXT_P2 = 'おともだちの そばに もどったよ'       … 2P の 文面（1P の HOME_TEXT = 'スタートに もどったよ' は 今の まま）
 *     export function homeTextOf(who: 1 | 2): string                     … who 1 → HOME_TEXT、who 2 → HOME_TEXT_P2
 *   `ui/homeNotice.ts` の HomeNotice は 作る とき who（既定 1）を うけとり、文面を homeTextOf(who) で 決める（1 人の ときの `#home-notice` の 文面・動きは そのまま）。
 */

describe('AC178 ①: 復活の おしらせの 文面', () => {
  it('1P は 今の まま「スタートに もどったよ」、2P は「おともだちの そばに もどったよ」', () => {
    expect(HOME_TEXT).toBe('スタートに もどったよ');
    expect(HOME_TEXT_P2).toBe('おともだちの そばに もどったよ');
    expect(homeTextOf(1)).toBe(HOME_TEXT);
    expect(homeTextOf(2)).toBe(HOME_TEXT_P2);
  });
  it('どちらも ひらがな・カタカナだけ（漢字なし。6 さいが 読める）', () => {
    expect(findUnrubiedKanji(HOME_TEXT_P2)).toEqual([]);
    expect(findUnrubiedKanji(homeTextOf(2))).toEqual([]);
  });
  it('2 つの 文面は ちがう', () => {
    expect(homeTextOf(1)).not.toBe(homeTextOf(2));
  });
});
