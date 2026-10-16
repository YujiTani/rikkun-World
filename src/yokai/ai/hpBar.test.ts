import { describe, expect, it } from 'vitest';
import { HP_BAR, HpBar, hpBarLayout, hpBarModel, hpBarState } from './hpBar';

describe('BAL-C 体力のバー（BALANCE.md §4.7 AC12）', () => {
  const table: [number, number, number, number, string][] = [
    [8, 8, 8, 8, 'white'],
    [8, 4, 8, 4, 'white'],
    [8, 3, 8, 3, 'yellow'],
    [8, 2, 8, 2, 'red'],
    [12, 4, 12, 4, 'yellow'],
    [12, 3, 12, 3, 'red'],
    [40, 20, 20, 10, 'white'],
    [40, 19, 20, 10, 'yellow'],
    [40, 13, 20, 7, 'red'],
    [72, 1, 20, 1, 'red'],
  ];
  it.each(table)('最大 %i 今 %i → 本数 %i 残り %i %s', (max, hp, bars, left, color) => {
    expect(hpBarModel(hp, max)).toEqual({ bars, left, color });
  });

  it('最大 5 残り 5 → 5 本 白。本数は 20 以下。体力が 0 より大きければ 1 本以上', () => {
    expect(hpBarModel(5, 5)).toEqual({ bars: 5, left: 5, color: 'white' });
    for (const max of [1, 5, 8, 20, 21, 40, 72, 500]) {
      for (let hp = 1; hp <= max; hp++) {
        const m = hpBarModel(hp, max);
        expect(m.bars).toBeLessThanOrEqual(20);
        expect(m.left).toBeGreaterThanOrEqual(1);
        expect(m.left).toBeLessThanOrEqual(m.bars);
      }
    }
  });

  it('いちばん長い 20 本で 横はば 1.6 ブロック以内', () => {
    for (let n = 1; n <= 20; n++) expect(hpBarLayout(n).total).toBeLessThanOrEqual(HP_BAR.maxWidth);
  });

  it('ふつうは たたかれてから（残りステップ > 0）だけ出る。二つ名は 16 ブロック以内ならいつも', () => {
    expect(hpBarState(8, 8, 'none', 1, 0).visible).toBe(false);
    expect(hpBarState(8, 8, 'none', 1, 180).visible).toBe(true);
    expect(hpBarState(8, 8, 'none', 1, 180).icon).toBeNull();
    expect(hpBarState(8, 8, 'taisho', 16, 0)).toMatchObject({ visible: true, icon: 'taisho' });
    expect(hpBarState(8, 8, 'taisho', 16.5, 0).visible).toBe(false);
    expect(hpBarState(8, 8, 'nushi', 30, 5).visible).toBe(true);
    expect(hpBarState(8, 8, 'oyabun', 3, 0).icon).toBe('oyabun');
  });

  it('絵: 長方形の数が 本数と同じ。まる（立方体）は 使わない', () => {
    const b = new HpBar();
    b.show(hpBarState(40, 40, 'none', 0, 1));
    expect(b.rectCount).toBe(20);
    for (const m of b.group.children) {
      const g = (m as any).geometry.parameters;
      expect(g.height).toBeGreaterThan(0);
      expect(g.width).toBeLessThan(0.2 * 20);
    }
    b.show(hpBarState(5, 5, 'none', 0, 1));
    expect(b.rectCount).toBe(5);
  });
});
