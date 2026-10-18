import { describe, expect, it } from 'vitest';
import { createW2Settings } from '../../contracts';
import { TECH_PHASES } from '../../char/techCurves';
import { techAdvance, techCell } from './advance';

const S = createW2Settings();
// 絵の 長さ（atlas.json の phases の 写し）。WEAPON-4: 設定の 初期値（切り上げ 19/3/30）とは べつ
const P = TECH_PHASES;
const total = (t: 'thrust' | 'kesa' | 'kiriage') => S.bladeTech[t].startup + S.bladeTech[t].active + S.bladeTech[t].recovery;

/** 設定の 長さ = 絵の 長さ のときの コマ: ticks の 合計が F − 1 を こえる 最初の コマ（表を 絵に 決め打ちしない） */
function cellByTicks(ticks: number[], f: number): number {
  let c = 0;
  for (let k = 0; k < ticks.length; k++) {
    c += ticks[k]!;
    if (f - 1 < c) return k;
  }
  return ticks.length - 1;
}

describe('techCell（§4.2 の コマ）', () => {
  for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
    it(`${t}: 設定の長さ = 絵の長さ なら ticks どおり`, () => {
      const ticks = S.bladeAdvance[t].ticks;
      const n = P[t].startup + P[t].active + P[t].recovery;
      for (let f = 1; f <= n; f++) expect(techCell(S.bladeAdvance[t], P[t], P[t], f), `${t} F${f}`).toBe(cellByTicks(ticks, f));
    });
  }
  it('AC5: 切り上げ 2/1/3 → 出だし・当たり・もどりの 順に コマが すすむ。へらない', () => {
    const len = { startup: 2, active: 1, recovery: 3 };
    const cells = [1, 2, 3, 4, 5, 6].map((f) => techCell(S.bladeAdvance.kiriage, P.kiriage, len, f));
    for (let i = 1; i < cells.length; i++) expect(cells[i]).toBeGreaterThanOrEqual(cells[i - 1]!);
    expect(cells[0]).toBe(0);
  });
  it('範囲の外は 両はしに おさめる', () => {
    expect(techCell(S.bladeAdvance.thrust, P.thrust, P.thrust, 0)).toBe(0);
    expect(techCell(S.bladeAdvance.thrust, P.thrust, P.thrust, 999)).toBe(S.bladeAdvance.thrust.ticks.length - 1);
  });
  it('WEAPON-4 AC6: 設定の 長さ（切り上げ 19/3/30）は 絵の 長さと べつ。初期の 設定で 出だしは 前へ すすみ、さいごの F が さいごの コマ', () => {
    const len = S.bladeTech.kiriage;
    expect(len).toEqual({ startup: 19, active: 3, recovery: 30 });
    const n = len.startup + len.active + len.recovery;
    const cells = Array.from({ length: n }, (_, i) => techCell(S.bladeAdvance.kiriage, P.kiriage, len, i + 1));
    expect(cells[0]).toBe(0);
    expect(cells[n - 1]).toBeGreaterThan(cells[len.startup + len.active - 1]!); // もどりの おわりは 当たりより あと
    for (let i = 1; i < n; i++) expect(cells[i]).toBeGreaterThanOrEqual(cells[i - 1]!);
  });
  // 仕様書 §4.6 の 表は 旧い絵（18 コマ）の 数。新しい絵（13 コマ・ticks 3,4,6,3,3,1,2,7,6,5,4,4,4・長さ 19/3/30）では 長さが 設定と 同じなので コマ = ticks の 区切り
  it('WEAPON-4 AC6: 切り上げ（新しい絵 13 コマ）→ F1→0・F19→4・F20→5・F22→6・F23→7・F52→12', () => {
    const len = { startup: 19, active: 3, recovery: 30 };
    expect(P.kiriage).toEqual(len);
    expect(S.bladeAdvance.kiriage.ticks).toHaveLength(13);
    const c = (f: number) => techCell(S.bladeAdvance.kiriage, P.kiriage, len, f);
    expect([c(1), c(19), c(20), c(22), c(23), c(52)]).toEqual([0, 4, 5, 6, 7, 12]);
  });
});

describe('techAdvance（§4.5 の A）', () => {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
  const A = (t: 'thrust' | 'kesa' | 'kiriage', f: number) => techAdvance(S.bladeAdvance[t], P[t], S.bladeTech[t], f);
  it('突き: 仕様書 CHAR-2 の 計算（今のまま）', () => {
    expect(near(A('thrust', 4), 0.197)).toBe(true);
    expect(near(A('thrust', 6), 0.2675)).toBe(true);
    expect(near(A('thrust', 41), 0)).toBe(true);
  });
  it('WEAPON-4 AC7: 大けさぎり A(28)=0.309・A(29)=0.4・A(33)=2.4・A(34)=2.6・A(36)=3.0・A(37)=3.1・A(106)=3.1', () => {
    expect(A('kesa', 28)).toBeCloseTo(0.309, 3);
    expect(A('kesa', 29)).toBeCloseTo(0.4, 3);
    expect(A('kesa', 30)).toBeCloseTo(0.9, 3);
    expect(A('kesa', 33)).toBeCloseTo(2.4, 3);
    expect(A('kesa', 34)).toBeCloseTo(2.6, 3);
    expect(A('kesa', 36)).toBeCloseTo(3.0, 3);
    expect(A('kesa', 37)).toBeCloseTo(3.1, 3);
    expect(A('kesa', 106)).toBeCloseTo(3.1, 3);
  });
  it('WEAPON-4 AC7: 切り上げは どの F でも A = 0（F1〜52）', () => {
    for (let f = 1; f <= 52; f++) expect(Math.abs(A('kiriage', f)), `F${f}`).toBeLessThan(1e-9);
  });
  it('WEAPON-4 AC7: 1 ステップの 増え方は 突き・切り上げ 0.12 以下、大けさぎり 0.5 + 0.001 以下', () => {
    for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
      let prev = 0;
      let maxStep = 0;
      for (let f = 1; f <= total(t); f++) {
        const a = A(t, f);
        maxStep = Math.max(maxStep, Math.abs(a - prev));
        prev = a;
      }
      expect(maxStep, t).toBeLessThanOrEqual(t === 'kesa' ? 0.501 : 0.12);
    }
    // 大けさぎりは 「一気に」: F30〜33 は 1 ステップ 0.5 ぐらい 進む
    expect(A('kesa', 31) - A('kesa', 30)).toBeGreaterThan(0.4);
  });
  it('大けさぎりは 出だし（F1〜28）で 0.31 まで、当たり（F29〜34）で 2.6 まで、すこしずつ 単調に ふえる', () => {
    let prev = 0;
    for (let f = 1; f <= 106; f++) {
      const a = A('kesa', f);
      expect(a, `F${f}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = a;
    }
    expect(A('kesa', 28)).toBeLessThan(0.32);
  });
  it('設定の長さが ちがっても 最後は step、段階ごとの比でのびる（切り上げ 以外の 大けさぎりで）', () => {
    const len = { startup: 2, active: 1, recovery: 3 };
    expect(near(techAdvance(S.bladeAdvance.kesa, P.kesa, len, 6), 3.1)).toBe(true);
    // 出だしの 2 ステップめ = 絵の 時 28 → A(28)
    expect(near(techAdvance(S.bladeAdvance.kesa, P.kesa, len, 2), techAdvance(S.bladeAdvance.kesa, P.kesa, P.kesa, 28))).toBe(true);
  });
});
