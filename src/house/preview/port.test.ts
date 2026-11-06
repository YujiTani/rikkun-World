import { describe, expect, it } from 'vitest';
import { STEPS } from '../editor/tuning';
import { previewModeOf } from './port';

/** 「すすみ → 見本の 見せ方」の 対応は ここ 1 か所 */
describe('previewModeOf', () => {
  it('① そと ＝ outside、② なか ＝ inside、③ なまえ ＝ 見本なし', () => {
    expect(previewModeOf('soto')).toBe('outside');
    expect(previewModeOf('naka')).toBe('inside');
    expect(previewModeOf('namae')).toBeNull();
  });

  it('すすみ ぜんぶに 答えが ある', () => {
    for (const step of STEPS) expect(previewModeOf(step)).not.toBeUndefined();
  });
});
