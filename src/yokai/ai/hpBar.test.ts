import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HP_BAR, HpBar, hpBarIconPixels, hpBarLayout, hpBarModel, hpBarState } from './hpBar';
import { nickIconPixels } from '../../ui/itemArtBal';

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

  it('BAL-G 寸法（DESIGN 13.3）: 1 本 はば 0.06・すきま 0.02・高さ 0.18。20 本で 1.58', () => {
    expect(HP_BAR.barHeight).toBe(0.18);
    expect(hpBarLayout(1)).toMatchObject({ pitch: 0.08, width: 0.06 });
    expect(hpBarLayout(20).total).toBeCloseTo(0.06 * 20 + 0.02 * 19, 9);
    expect(hpBarLayout(20).total).toBeCloseTo(1.58, 9);
    expect(hpBarLayout(8).total).toBeCloseTo(0.06 * 8 + 0.02 * 7, 9);
  });

  it('BAL-G アイコン: 絵は nickIconPixels（★ の文字ではない）。ドットのまま（ぼかさない）。高さ 0.27 以下・バーとの あいだ 0.05', () => {
    for (const t of ['oyabun', 'taisho', 'nushi'] as const) {
      expect(hpBarIconPixels(t)).toEqual(nickIconPixels(t));
      const b = new HpBar();
      b.show(hpBarState(40, 40, t, 0, 1));
      const info = b.iconInfo;
      expect(info, t).not.toBeNull();
      expect(info!.tier).toBe(t);
      expect(info!.nearest).toBe(true);
      expect(info!.height).toBeLessThanOrEqual(0.18 * 1.5 + 1e-9);
      expect(info!.height).toBeGreaterThan(0.18);
      expect(info!.width).toBeCloseTo(info!.height, 9); // 16x16 の丸いバッジ
      // 左はしは バーの左はしから 0.05 はなれる
      expect(info!.gap).toBeCloseTo(0.05, 9);
    }
    const none = new HpBar();
    none.show(hpBarState(8, 8, 'none', 0, 1));
    expect(none.iconInfo).toBeNull();
  });

  it('BAL-G うしろの下じき: #10141F 55%', () => {
    const b = new HpBar();
    b.show(hpBarState(40, 40, 'none', 0, 1));
    const u = b.underlay;
    expect(u).not.toBeNull();
    const m = u!.material as THREE.MeshBasicMaterial;
    expect(m.color.getHex()).toBe(0x10141f);
    expect(m.opacity).toBeCloseTo(0.55, 9);
    expect(m.transparent).toBe(true);
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
