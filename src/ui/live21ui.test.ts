import { describe, expect, it } from 'vitest';
import { actionHintLines } from './actionHintModel';
import { ANIMAL_HINT_VIEW, AnimalHintModel } from './animalHintModel';
import { findUnrubiedKanji } from './text';

const ctx = { held: null, heldIsPickaxe: false, heldIsBlade: false };
const right = (kind: string, item: string | null = null) => actionHintLines({ kind, item } as never, null, ctx).right;

describe('LIVE-2.1 文字（§3.1・AC16）', () => {
  it('合図 3 つ の 文・絵（漢字 なし・小屋／大人 の 漢字 なし）', () => {
    expect(ANIMAL_HINT_VIEW.coopNoRoom.html).toBe('ここ には おけない よ');
    expect(ANIMAL_HINT_VIEW.kitMax.html).toBe('あたためる たまご は 6 こ まで');
    expect(ANIMAL_HINT_VIEW.kitFull.html).toBe('この こたつ は いっぱい');
    expect(ANIMAL_HINT_VIEW.coopNoRoom.art[0]).toBe('toriya');
    for (const k of ['coopNoRoom', 'kitMax', 'kitFull'] as const) {
      expect(findUnrubiedKanji(ANIMAL_HINT_VIEW[k].html), k).toEqual([]);
      expect(ANIMAL_HINT_VIEW[k].art.length, k).toBeGreaterThan(0);
    }
  });

  it('合図 kitFull を チップ の もと に 出せる（120 ステップ）', () => {
    const m = new AnimalHintModel();
    m.show('kitFull');
    expect(m.current()).toBe('kitFull');
    expect(m.stepsLeft()).toBeGreaterThan(0);
  });

  it('照準 の 下: だっこ 中 は なげる（遠い）／おろす（d が 1 より 近い）／なげられない 所 は うすく', () => {
    const c = (throwSpot: { ok: boolean; toss: boolean } | null) => actionHintLines({ kind: 'putDown', item: null }, null, { ...ctx, carrying: true, throwSpot }).right;
    expect(c({ ok: true, toss: true })).toEqual({ icon: 'chicken', word: 'なげる' });
    expect(c({ ok: false, toss: true })).toEqual({ icon: 'chicken', word: 'なげる', disabled: true });
    expect(c({ ok: true, toss: false })).toEqual({ icon: 'chicken', word: 'おろす' });
    // 着地点 の 答え が 無い とき は 今 まで どおり おろす
    expect(c(null)).toEqual({ icon: 'chicken', word: 'おろす' });
  });

  it('こたつ ＋ たまご: 3 こ より 少なければ いれる、3 こ なら いっぱい', () => {
    expect(right('kitPut', 'egg')).toEqual({ icon: 'egg', word: 'いれる' });
    expect(right('kitFull', 'kin_tamago')).toEqual({ icon: 'kin_tamago', word: 'いっぱい' });
  });
});
