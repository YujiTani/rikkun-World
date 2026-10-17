import { describe, expect, it } from 'vitest';
import { W2_SETTING_DEFAULTS, createW2Settings } from '../../contracts';
import { techAdvance, techCell } from './advance';

const S = createW2Settings();
const P = W2_SETTING_DEFAULTS.bladeTech;
const total = (t: 'thrust' | 'kesa' | 'kiriage') => P[t].startup + P[t].active + P[t].recovery;

// 仕様書 §4.2 の 表（f → コマ）
const TABLE: Record<'thrust' | 'kesa' | 'kiriage', Array<[number, number, number]>> = {
  thrust: [[1, 2, 0], [3, 4, 1], [5, 5, 2], [6, 6, 3], [7, 9, 4], [10, 20, 5], [21, 24, 6], [25, 28, 7], [29, 32, 8], [33, 36, 9], [37, 41, 10]],
  kesa: [[1, 8, 0], [9, 15, 1], [16, 19, 2], [20, 23, 3], [24, 28, 4], [29, 30, 5], [31, 32, 6], [33, 34, 7], [35, 39, 8], [40, 67, 9], [68, 75, 10], [76, 83, 11], [84, 91, 12], [92, 99, 13], [100, 106, 14]],
  kiriage: [[1, 5, 0], [6, 10, 1], [11, 15, 2], [16, 20, 3], [21, 25, 4], [26, 30, 5], [31, 34, 6], [35, 38, 7], [39, 40, 8], [41, 41, 9], [42, 43, 10], [44, 51, 11], [52, 78, 12], [79, 84, 13], [85, 90, 14], [91, 96, 15], [97, 100, 16], [101, 104, 17]],
};

describe('techCell（§4.2 の コマ）', () => {
  for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
    it(`${t}: 設定の長さ = 絵の長さ なら 表どおり`, () => {
      for (const [a, b, k] of TABLE[t]) for (let f = a; f <= b; f++) expect(techCell(S.bladeAdvance[t], P[t], P[t], f), `${t} F${f}`).toBe(k);
    });
  }
  it('AC5: 切り上げ 2/1/3 → 出だし 0〜7・当たり 8〜10・もどり 11〜17、コマは へらない', () => {
    const len = { startup: 2, active: 1, recovery: 3 };
    const cells = [1, 2, 3, 4, 5, 6].map((f) => techCell(S.bladeAdvance.kiriage, P.kiriage, len, f));
    expect(cells[0]).toBeGreaterThanOrEqual(0);
    expect(cells[1]).toBeLessThanOrEqual(7);
    expect(cells[2]).toBeGreaterThanOrEqual(8);
    expect(cells[2]).toBeLessThanOrEqual(10);
    for (const c of cells.slice(3)) {
      expect(c).toBeGreaterThanOrEqual(11);
      expect(c).toBeLessThanOrEqual(17);
    }
    for (let i = 1; i < cells.length; i++) expect(cells[i]).toBeGreaterThanOrEqual(cells[i - 1]);
  });
  it('範囲の外は 両はしに おさめる', () => {
    expect(techCell(S.bladeAdvance.thrust, P.thrust, P.thrust, 0)).toBe(0);
    expect(techCell(S.bladeAdvance.thrust, P.thrust, P.thrust, 999)).toBe(10);
  });
});

describe('techAdvance（§4.5 の A）', () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  it('仕様書の 計算の確認', () => {
    const A = (t: 'thrust' | 'kesa' | 'kiriage', f: number) => techAdvance(S.bladeAdvance[t], P[t], P[t], f);
    expect(near(A('thrust', 4), 0.197)).toBe(true);
    expect(near(A('thrust', 6), 0.2675)).toBe(true);
    expect(near(A('thrust', 41), 0)).toBe(true);
    expect(near(A('kesa', 29), 0.543)).toBe(true);
    expect(near(A('kesa', 34), 0.654)).toBe(true);
    expect(near(A('kesa', 53), 0.8)).toBe(true);
    expect(near(A('kesa', 106), 0.8)).toBe(true);
    expect(near(A('kiriage', 39), 1.016)).toBe(true);
    expect(near(A('kiriage', 104), 1.04)).toBe(true);
  });
  it('1 ステップの動きは 0.12 以下（どのわざも）', () => {
    for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
      let prev = 0;
      for (let f = 1; f <= total(t); f++) {
        const a = techAdvance(S.bladeAdvance[t], P[t], P[t], f);
        expect(Math.abs(a - prev)).toBeLessThanOrEqual(0.12);
        prev = a;
      }
    }
  });
  it('設定の長さが ちがっても 最後は step、段階ごとの比でのびる', () => {
    const len = { startup: 2, active: 1, recovery: 3 };
    expect(near(techAdvance(S.bladeAdvance.kiriage, P.kiriage, len, 6), 1.04)).toBe(true);
    // 出だしの 2 ステップめ = 絵の 時 38 → A(38)
    expect(near(techAdvance(S.bladeAdvance.kiriage, P.kiriage, len, 2), techAdvance(S.bladeAdvance.kiriage, P.kiriage, P.kiriage, 38))).toBe(true);
  });
});
