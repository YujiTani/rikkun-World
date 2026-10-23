// START-1 AC4: つよさ（やさしい・ふつう・つよい）の 計算（仕様 §4.3）。
// 窓口の 名前（実装は これに 合わせる）: src/yokai/stats.ts に 足す
//   export type StrengthLevel = 'easy' | 'normal' | 'hard'
//   export const STRENGTH_LEVELS: readonly StrengthLevel[]            // ['easy', 'normal', 'hard']
//   export const STRENGTH_MUL: Record<StrengthLevel, { hp: number; attack: number }>   // 0.5/0.5・1/1・1.5/1.25
//   yokaiStrength(kind, m = 1, title = 'none', level: StrengthLevel = 'normal'): StrengthResult
//     4 つ目の 引数が ない（'normal'）ときは 今と ぜんぶ 同じ。
//     hp   = 最低 1、切り上げ（元の体力 × M × 二つ名の体力 × S体）
//     attack = 最低 1、小さい方（16、切り上げ（元の攻撃力 × （1 ＋（M − 1）÷ 2）× S攻）＋ 二つ名の足し）
//     xp・fear・strength・speedMul・dropRolls は つよさで かわらない
import { describe, expect, it } from 'vitest';
import type { YokaiKind, YokaiTitle } from '../contracts';
import { STRENGTH_LEVELS, STRENGTH_MUL, yokaiStrength, type StrengthLevel } from './stats';
import { TITLE_RULES } from './title';

const KINDS: YokaiKind[] = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'];
const TITLES: YokaiTitle[] = ['none', 'oyabun', 'taisho', 'nushi'];
const LEVELS: StrengthLevel[] = ['easy', 'normal', 'hard'];

/** [体力, 攻撃力] */
const hpAtk = (k: YokaiKind, level: StrengthLevel, m = 1, t: YokaiTitle = 'none'): [number, number] => {
  const r = yokaiStrength(k, m, t, level);
  return [r.hp, r.attack];
};

describe('AC4 つよさの 倍率', () => {
  it('3 段', () => expect([...STRENGTH_LEVELS]).toEqual(LEVELS));
  it('体力 0.5・1・1.5、攻撃 0.5・1・1.25', () => {
    expect(STRENGTH_MUL.easy).toEqual({ hp: 0.5, attack: 0.5 });
    expect(STRENGTH_MUL.normal).toEqual({ hp: 1, attack: 1 });
    expect(STRENGTH_MUL.hard).toEqual({ hp: 1.5, attack: 1.25 });
  });
});

describe('AC4 §4.3 の 表（M = 1・二つ名なし）と ぜんぶ 同じ', () => {
  const table: Array<[YokaiKind, [number, number], [number, number], [number, number]]> = [
    // [種類, やさしい, ふつう, つよい]（体力, 攻撃）
    ['karakasa', [4, 1], [8, 2], [12, 3]],
    ['chochin', [3, 1], [5, 2], [8, 3]],
    ['rokurokubi', [6, 1], [12, 2], [18, 3]],
    ['nurikabe', [20, 8], [40, 16], [60, 16]],
  ];
  for (const [k, e, n, h] of table) {
    it(`${k}: やさしい ${e.join('/')}・ふつう ${n.join('/')}・つよい ${h.join('/')}`, () => {
      expect(hpAtk(k, 'easy')).toEqual(e);
      expect(hpAtk(k, 'normal')).toEqual(n);
      expect(hpAtk(k, 'hard')).toEqual(h);
    });
  }
  it('からかさの ヌシ: 12/3・24/4・36/5', () => {
    expect(hpAtk('karakasa', 'easy', 1, 'nushi')).toEqual([12, 3]);
    expect(hpAtk('karakasa', 'normal', 1, 'nushi')).toEqual([24, 4]);
    expect(hpAtk('karakasa', 'hard', 1, 'nushi')).toEqual([36, 5]);
  });
  it('M = 3 の からかさ: 12/2・24/4・36/5', () => {
    expect(hpAtk('karakasa', 'easy', 3)).toEqual([12, 2]);
    expect(hpAtk('karakasa', 'normal', 3)).toEqual([24, 4]);
    expect(hpAtk('karakasa', 'hard', 3)).toEqual([36, 5]);
  });
  it('計算の 例: つよい ちょうちん 8（7.5 を 切り上げ）、つよい ぬりかべ 攻撃は 16 で 止まる、やさしい ぬりかべ 8', () => {
    expect(yokaiStrength('chochin', 1, 'none', 'hard').hp).toBe(8);
    expect(yokaiStrength('nurikabe', 1, 'none', 'hard').attack).toBe(16);
    expect(yokaiStrength('nurikabe', 1, 'none', 'easy').attack).toBe(8);
  });
  it('物さし「からかさ 8 回」: すでで たおす 回数 4・8・12、やられる 回数（20 ÷ 攻撃）20・10・7', () => {
    const times = LEVELS.map((l) => yokaiStrength('karakasa', 1, 'none', l)).map((r) => [r.hp, Math.ceil(20 / r.attack)]);
    expect(times).toEqual([[4, 20], [8, 10], [12, 7]]);
  });
});

describe('AC4 ふつう は 今の BALANCE と ぜんぶ 同じ', () => {
  for (const k of KINDS) {
    for (const t of TITLES) {
      for (const m of [1, 1.5, 2, 3, 4]) {
        it(`${k}・${t}・M=${m}: 4 つ目を 渡さなくても 'normal' でも 同じ`, () => {
          expect(yokaiStrength(k, m, t, 'normal')).toEqual(yokaiStrength(k, m, t));
        });
      }
    }
  }
  it('今の 表（BAL-A AC1）', () => {
    expect(hpAtk('karakasa', 'normal')).toEqual([8, 2]);
    expect(hpAtk('chochin', 'normal')).toEqual([5, 2]);
    expect(hpAtk('rokurokubi', 'normal')).toEqual([12, 2]);
    expect(hpAtk('nurikabe', 'normal')).toEqual([40, 16]);
  });
});

describe('AC4 つよさで かわらない 物', () => {
  for (const k of KINDS) {
    for (const t of TITLES) {
      it(`${k}・${t}: 経験値・こわさ・はやさ・ドロップの 回数は 3 つとも 同じ`, () => {
        const base = yokaiStrength(k, 2, t, 'normal');
        for (const l of LEVELS) {
          const r = yokaiStrength(k, 2, t, l);
          expect(r.xp, l).toBe(base.xp);
          expect(r.fear, l).toBe(base.fear);
          expect(r.strength, l).toBe(base.strength);
          expect(r.speedMul, l).toBe(base.speedMul);
          expect(r.dropRolls, l).toBe(base.dropRolls);
        }
      });
    }
  }
  it('二つ名の 確率（TITLE_RULES.chance）は つよさの 窓口に 出てこない（M だけで 決める）', () => {
    // つよさを 渡しても TITLE_RULES は そのまま
    yokaiStrength('karakasa', 1, 'nushi', 'hard');
    expect(TITLE_RULES.nushi.chance).toBe(0.003);
    expect(TITLE_RULES.oyabun.chance).toBe(0.03);
    expect(TITLE_RULES.taisho.chance).toBe(0.01);
  });
});

describe('AC4 体力・攻撃は 最低 1、攻撃は 16 まで', () => {
  for (const l of LEVELS) {
    for (const k of KINDS) {
      for (const t of TITLES) {
        for (const m of [1, 2, 3]) {
          it(`${k}・${t}・M=${m}・${l}`, () => {
            const [hp, atk] = hpAtk(k, l, m, t);
            expect(hp).toBeGreaterThanOrEqual(1);
            expect(Number.isInteger(hp)).toBe(true);
            expect(atk).toBeGreaterThanOrEqual(1);
            expect(atk).toBeLessThanOrEqual(16);
            expect(Number.isInteger(atk)).toBe(true);
          });
        }
      }
    }
  }
});

describe('AC4 安全（BALANCE §2.7）', () => {
  const nonWall = KINDS.filter((k) => k !== 'nurikabe');
  const hits = (k: YokaiKind, l: StrengthLevel, t: YokaiTitle = 'none') => Math.ceil(20 / yokaiStrength(k, 1, t, l).attack);

  for (const l of ['easy', 'normal'] as const) {
    describe(`${l}: ぜんぶ 満たす`, () => {
      it('ぬりかべ 以外の 二つ名なし: すでで 12 回以下・やられる 8 回以上', () => {
        for (const k of nonWall) {
          expect(yokaiStrength(k, 1, 'none', l).hp, k).toBeLessThanOrEqual(12);
          expect(hits(k, l), k).toBeGreaterThanOrEqual(8);
        }
      });
      it('M = 1 の ヌシ（ぬりかべ は ヌシに ならない）: やられる 4 回以上', () => {
        for (const k of nonWall) expect(hits(k, l, 'nushi'), k).toBeGreaterThanOrEqual(4);
      });
      it('4 種 × 二つ名（なし・おやぶん・たいしょう・ヌシ）の 攻撃力は 16 以下', () => {
        for (const k of KINDS) for (const t of TITLES) expect(yokaiStrength(k, 1, t, l).attack, `${k}/${t}`).toBeLessThanOrEqual(16);
      });
    });
  }

  describe('hard: ゆるす 2 つ（やられる 7 回・ろくろくび すで 18 回）の ほかは 満たす', () => {
    it('やられる 回数: からかさ・ちょうちん・ろくろくび は 7 回（8 回以上を 1 回 下まわる）', () => {
      for (const k of nonWall) expect(hits(k, 'hard'), k).toBe(7);
    });
    it('すでで たおす 回数: からかさ 12・ちょうちん 8 は 12 回以下。ろくろくび は 18 回', () => {
      expect(yokaiStrength('karakasa', 1, 'none', 'hard').hp).toBeLessThanOrEqual(12);
      expect(yokaiStrength('chochin', 1, 'none', 'hard').hp).toBeLessThanOrEqual(12);
      expect(yokaiStrength('rokurokubi', 1, 'none', 'hard').hp).toBe(18);
    });
    it('M = 1 の ヌシは やられる 4 回以上（守る）', () => {
      for (const k of nonWall) expect(hits(k, 'hard', 'nushi'), k).toBeGreaterThanOrEqual(4);
    });
    it('攻撃力 16 以下（守る）', () => {
      for (const k of KINDS) for (const t of TITLES) expect(yokaiStrength(k, 1, t, 'hard').attack, `${k}/${t}`).toBeLessThanOrEqual(16);
    });
    it('ぬりかべ は 60/16（やられる 2 回）', () => {
      expect(hpAtk('nurikabe', 'hard')).toEqual([60, 16]);
      expect(hits('nurikabe', 'hard')).toBe(2);
    });
  });
});
