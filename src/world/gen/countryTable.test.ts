import { describe, expect, it } from 'vitest';
import { findUnrubiedKanji } from '../../ui/text';
import { createYokaiConfig } from '../../yokai/ai/config';
import { COUNTRY_KINDS } from './biome';
import { COUNTRY_TABLE, countryRow } from './countryTable';

/** #291 COUNTRY-1 AC1〜AC3（docs/design/COUNTRY-1.md §3） */
const YOMI: Record<string, string> = {
  harappa: 'はじまりの はらっぱ',
  mori: 'もり',
  ookina: 'おおきな きの もり',
  hana: 'はなばたけ',
  sunahama: 'すなはま',
  susuki: 'すすきの はら',
  take: 'たけやぶ',
  kappa: 'かっぱの ぬま',
  iwayama: 'いわやま',
  tengu: 'てんぐの やま',
  momiji: 'もみじやま',
  yuki: 'ゆきやま',
};
const BOSS: Record<string, string> = {
  harappa: 'tsuchigumo', mori: 'tsuchigumo', take: 'tsuchigumo',
  iwayama: 'omukade', kappa: 'omukade', sunahama: 'omukade',
  tengu: 'itsumade', susuki: 'itsumade', momiji: 'itsumade',
  yuki: 'byakko', hana: 'byakko', ookina: 'byakko',
};
// からかさ・ちょうちん・ろくろくび・ぬりかべ（§3.2）
const WEIGHTS: Record<string, number[]> = {
  harappa: [30, 25, 25, 20],
  mori: [25, 20, 40, 15],
  ookina: [25, 20, 40, 15],
  hana: [25, 40, 20, 15],
  sunahama: [45, 20, 20, 15],
  susuki: [25, 40, 20, 15],
  take: [45, 20, 20, 15],
  kappa: [45, 20, 20, 15],
  iwayama: [25, 20, 20, 35],
  tengu: [25, 20, 20, 35],
  momiji: [25, 40, 20, 15],
  yuki: [25, 20, 20, 35],
};
const KEYS = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'] as const;

describe('国の表（AC1〜AC3）', () => {
  it('AC1: 12 行・並びは COUNTRY_KINDS・よみ・4 大は ちょうど 3 国ずつ', () => {
    expect(COUNTRY_TABLE.map((r) => r.kind)).toEqual([...COUNTRY_KINDS]);
    for (const r of COUNTRY_TABLE) {
      expect(r.yomi).toBe(YOMI[r.kind]);
      expect(r.boss).toBe(BOSS[r.kind]);
      expect(countryRow(r.kind)).toBe(r);
    }
    expect(Math.max(...COUNTRY_TABLE.map((r) => r.yomi.length))).toBe(10);
    for (const b of ['tsuchigumo', 'omukade', 'itsumade', 'byakko']) expect(COUNTRY_TABLE.filter((r) => r.boss === b)).toHaveLength(3);
  });
  it('AC2: name は ruby の外に 漢字が 0・ruby の読みが よみと つながる', () => {
    for (const r of COUNTRY_TABLE) {
      expect(findUnrubiedKanji(r.name), r.kind).toEqual([]);
      // ruby の 外の かな ＋ rt の よみ を つなぐと よみ（空白をのぞく）と 同じ
      const plain = r.name.replace(/<ruby>[^<]*<rt>([^<]*)<\/rt><\/ruby>/g, '$1').replace(/<[^>]*>/g, '');
      expect(plain.replace(/ /g, ''), r.kind).toBe(r.yomi.replace(/ /g, ''));
    }
  });
  it('AC3: 重みは 表のとおり・合計 100・15 以上。config.yokaiWeights の既定は 4 種とも 1', () => {
    for (const r of COUNTRY_TABLE) {
      const w = KEYS.map((k) => r.yokai[k] ?? 0);
      expect(w, r.kind).toEqual(WEIGHTS[r.kind]);
      expect(w.reduce((a, b) => a + b, 0)).toBe(100);
      for (const v of w) expect(v).toBeGreaterThanOrEqual(15);
    }
    expect(createYokaiConfig().yokaiWeights).toEqual({ karakasa: 1, chochin: 1, rokurokubi: 1, nurikabe: 1 });
  });
});
