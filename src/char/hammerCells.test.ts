import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../content/items/legend4Tuning';
import { HAMMER_RAISED_CELL, HAMMER_TICKS, hammerSwingCell } from './hammerCells';

const T = LEGEND4_TUNING.daichi;

describe('hammerCells', () => {
  it('コマの 長さの 合計 = 1 振りの ながさ（出だし ＋ 当たり ＋ 後すき）', () => {
    expect(HAMMER_TICKS.reduce((a, b) => a + b, 0)).toBe(T.startup + T.active + T.recovery);
  });
  it('出だしは ふりかぶりの コマで おわり、F43 から 当たりの コマに 入る', () => {
    expect(hammerSwingCell(1)).toBe(0);
    expect(hammerSwingCell(T.startup)).toBe(HAMMER_RAISED_CELL);
    expect(hammerSwingCell(T.startup + 1)).toBeGreaterThan(HAMMER_RAISED_CELL);
    expect(hammerSwingCell(159)).toBe(HAMMER_TICKS.length - 1);
    expect(hammerSwingCell(9999)).toBe(HAMMER_TICKS.length - 1);
  });
});
