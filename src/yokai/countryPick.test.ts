import { describe, expect, it } from 'vitest';
import { COUNTRY_TABLE, countryRow } from '../world/gen/countryTable';
import { createRng } from '../world/gen/random';
import { effectiveRow, pickYokaiKind } from './countryPick';

/** #291 COUNTRY-1 AC5・AC7（docs/design/COUNTRY-1.md §3.3） */
const ONE = { karakasa: 1, chochin: 1, rokurokubi: 1, nurikabe: 1 };
const KEYS = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'] as const;

describe('pickYokaiKind', () => {
  it('AC5: 12 国の行で 100,000 こ ずつ → 4 種の 割合が 表の値 ± 1 ポイント', () => {
    for (const row of COUNTRY_TABLE) {
      const rng = createRng(12345);
      const n = 100_000;
      const cnt: Record<string, number> = { karakasa: 0, chochin: 0, rokurokubi: 0, nurikabe: 0 };
      for (let i = 0; i < n; i++) cnt[pickYokaiKind(row.yokai, ONE, false, rng())!]!++;
      for (const k of KEYS) expect(Math.abs((cnt[k]! / n) * 100 - (row.yokai[k] ?? 0)), `${row.kind}.${k}`).toBeLessThanOrEqual(1);
    }
  });
  it('AC7: 行に ない 種類は 10,000 回中 0 回', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const k = pickYokaiKind({ chochin: 10 }, ONE, false, rng());
      expect(k).toBe('chochin');
    }
  });
  it('AC7: ぬりかべ が いる間は ぬりかべ 0 回', () => {
    const rng = createRng(8);
    for (let i = 0; i < 10_000; i++) expect(pickYokaiKind(countryRow('iwayama')!.yokai, ONE, true, rng())).not.toBe('nurikabe');
  });
  it('倍率 0 / null の種類は でない・2 倍で 2 倍', () => {
    const rng = createRng(9);
    for (let i = 0; i < 5000; i++) {
      expect(pickYokaiKind(countryRow('harappa')!.yokai, { ...ONE, karakasa: 0, chochin: null }, false, rng())).not.toBe('karakasa');
    }
    let c = 0;
    for (let i = 0; i < 20_000; i++) if (pickYokaiKind({ karakasa: 50, chochin: 50 }, { ...ONE, karakasa: 3 }, false, rng()) === 'karakasa') c++;
    expect(c / 20_000).toBeGreaterThan(0.72);
    expect(c / 20_000).toBeLessThan(0.78);
  });
  it('AC7: 全部 0 なら null。r = 0 と 1 に近い値でも 範囲の中', () => {
    expect(pickYokaiKind({}, ONE, false, 0.5)).toBeNull();
    expect(pickYokaiKind({ nurikabe: 5 }, ONE, true, 0.5)).toBeNull();
    expect(pickYokaiKind(countryRow('mori')!.yokai, ONE, false, 0)).toBe('karakasa');
    expect(pickYokaiKind(countryRow('mori')!.yokai, ONE, false, 0.999999)).toBe('nurikabe');
  });
  it('AC7: 行の合計が 0 なら はらっぱ の 行を つかう（effectiveRow）。それも 0 なら 0 のまま', () => {
    const harappa = countryRow('harappa')!.yokai;
    expect(effectiveRow({ nurikabe: 5 }, { ...ONE, nurikabe: 0 }, harappa)).toBe(harappa);
    expect(effectiveRow({ nurikabe: 5 }, ONE, harappa)).toEqual({ nurikabe: 5 });
    const none = { karakasa: 0, chochin: 0, rokurokubi: 0, nurikabe: 0 };
    const r = effectiveRow({ nurikabe: 5 }, none, harappa);
    expect(pickYokaiKind(r, none, false, 0.3)).toBeNull();
  });
});
