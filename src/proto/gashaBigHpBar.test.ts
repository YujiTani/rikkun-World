import { describe, expect, it } from 'vitest';
import { ORNAMENT_D } from './gashaBigHpBar';
import { TUNE } from './gashaBigTuning';

describe('体力バー D 案', () => {
  it('既定は D', () => expect(TUNE.hit.barStyle).toBe('D'));
  it('かざりは 全部の 行が 同じ 幅で、左右 ぎゃくに ならべても 同じ（まん中の 軸）', () => {
    const w = ORNAMENT_D[0]!.length;
    expect(w % 2).toBe(1);
    for (const row of ORNAMENT_D) expect(row.length).toBe(w);
    const mirror = (r: string): string => [...r].reverse().join('').replace(/[dh]/g, (c) => c);
    ORNAMENT_D.forEach((row, y) => {
      // 色の ない/ある は 左右 そろう
      expect([...row].map((c) => c === '.')).toEqual([...mirror(row)].map((c) => c === '.'));
      expect(y).toBeGreaterThanOrEqual(0);
    });
  });
});
