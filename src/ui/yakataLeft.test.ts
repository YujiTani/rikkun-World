import { describe, expect, it } from 'vitest';
import { yakataMotion } from '../fx/yakataMotion';
import { yakataLeftText } from './yakataLeft';
import { findUnrubiedKanji } from './text';

/** MINE-1F §3.6・§3.8: のこりの 札の 文字〔ひらがな・漢字なし〕・はねの コマ〔表から〕 */
describe('のこりの 札', () => {
  it('文字は「のこり N」・漢字なし・0 いかは 0', () => {
    expect(yakataLeftText(7)).toBe('のこり 7');
    expect(yakataLeftText(-1)).toBe('のこり 0');
    expect(findUnrubiedKanji(yakataLeftText(3))).toEqual([]);
  });
  it('はねは 上へ 6 コマ・もどる 12 コマ〔§3.8〕・動きを へらす では 0 点', () => {
    expect(yakataMotion(false).labelHop).toMatchObject({ upFrames: 6, backFrames: 12 });
    expect(yakataMotion(false).labelHop.hopPoints).toBeGreaterThan(0);
    expect(yakataMotion(true).labelHop.hopPoints).toBe(0);
  });
});
