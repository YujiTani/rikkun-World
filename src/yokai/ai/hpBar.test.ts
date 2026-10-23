import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HP_BAR, HP_BAR_COLORS, HpBar, hpBarIconPixels, hpBarLayout, hpBarModel, hpBarState } from './hpBar';
import { nickIconPixels } from '../../ui/itemArtBal';

describe('HP-CHUNK 体力のバー（decisions/2026-10-23-hp-bar-chunks.md, #259）', () => {
  // [最大, 今, 細いバーの本数, 残り, 大きな塊]
  const table: [number, number, number, number, number][] = [
    [8, 7, 8, 7, 0],
    [20, 20, 20, 20, 0],
    [40, 40, 20, 20, 1],
    [40, 25, 20, 5, 1],
    [40, 20, 20, 20, 0],
    [50, 50, 20, 20, 2],
    [50, 10, 10, 10, 0],
    [50, 11, 20, 1, 1],
    [120, 120, 20, 20, 5],
    [120, 70, 20, 10, 3],
    [180, 180, 20, 20, 8],
    [40, 0.5, 20, 1, 0],
    [8, 8, 8, 8, 0],
    [8, 0.01, 8, 1, 0],
    [21, 21, 20, 20, 1],
    [21, 1, 1, 1, 0],
    [21, 2, 20, 1, 1],
  ];
  it.each(table)('最大 %f 今 %f → 本数 %i 残り %i 塊 %i', (max, hp, bars, left, big) => {
    expect(hpBarModel(hp, max)).toEqual({ bars, left, big });
  });

  it('WEAPON-4 AC5: 体力が 小数でも 正しい。最大 8・6.5 → 8 本中 7 本、最大 8・0.01 → 1 本', () => {
    expect(hpBarModel(6.5, 8)).toEqual({ bars: 8, left: 7, big: 0 });
    expect(hpBarModel(0.01, 8)).toEqual({ bars: 8, left: 1, big: 0 });
    expect(hpBarModel(4, 8).left).toBe(4);
    expect(hpBarModel(4.5, 8).left).toBe(5);
  });

  it('最大 1〜500 のどの体力でも 本数は 20 以下・残りは 1〜本数・塊は 0 以上。最大 20 以下は 塊なし', () => {
    // 12 万通りを 1 つずつ expect すると CI で 5 秒をこえるので、まちがいだけ集めて 1 回で見る
    const bad: string[] = [];
    for (let max = 1; max <= 500; max++) {
      for (let hp = 1; hp <= max; hp++) {
        const m = hpBarModel(hp, max);
        if (
          m.bars > 20 ||
          m.bars < 1 ||
          m.left < 1 ||
          m.left > m.bars ||
          m.big < 0 ||
          (max <= 20 && m.big !== 0) ||
          // 塊は 5 で切らない: 残りの段の数
          m.big > Math.ceil(max / 20) - 1
        ) {
          bad.push(`${max}/${hp}: ${JSON.stringify(m)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(hpBarModel(500, 500)).toEqual({ bars: 20, left: 20, big: 24 });
  });

  it('色の定数: 細いバー 黄・へった分 灰・大きな塊は みどり→きみどり→黄→だいだい→赤。塊は 5 枚まで', () => {
    expect(HP_BAR_COLORS).toEqual({
      bar: 0xffd54f,
      empty: 0x555555,
      big: [0x43a047, 0x9ccc3c, 0xffd54f, 0xff9800, 0xe53935],
    });
    expect(HP_BAR.maxBig).toBe(5);
  });

  it('HpBar: 細いバーの数と 大きな塊の色（後ろから手前の順）。塊は 5 枚まで', () => {
    const big = HP_BAR_COLORS.big;
    const cases: [number, number[]][] = [
      [0, []],
      [1, [big[0]!]],
      [3, [big[0]!, big[1]!, big[2]!]],
      [5, [...big]],
      [8, [...big]],
    ];
    for (const [n, colors] of cases) {
      const b = new HpBar();
      b.show({ visible: true, bars: 20, left: 20, big: n, icon: null });
      expect(b.rectCount, `big=${n}`).toBe(20);
      expect(b.bigCards, `big=${n}`).toEqual(colors);
    }
    const b = new HpBar();
    b.show({ visible: true, bars: 8, left: 3, big: 0, icon: null });
    expect(b.rectCount).toBe(8);
    expect(b.bigCards).toEqual([]);
    // 塊がへると 枚数がへる
    b.show({ visible: true, bars: 20, left: 5, big: 3, icon: null });
    expect(b.bigCards).toHaveLength(3);
    b.show({ visible: true, bars: 20, left: 20, big: 2, icon: null });
    expect(b.bigCards).toHaveLength(2);
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
