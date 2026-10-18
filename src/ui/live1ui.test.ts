import { describe, expect, it } from 'vitest';
import type { AnimalWindowHint } from '../contracts';
import { animalIconPixels } from './animalArt';
import { ANIMAL_HINT_STEPS, ANIMAL_HINT_VIEW, AnimalHintModel } from './animalHintModel';
import { findUnrubiedKanji } from './text';

describe('LIVE-1 合図（§3.1。版 3.2 の 8 つ）', () => {
  const R = '<ruby>右<rt>みぎ</rt></ruby>';
  it('8 つの 文（仕様 §3.1 の とおり）。漢字は ふりがな付き。eggLater は 無い', () => {
    const want: Record<AnimalWindowHint, string> = {
      feedHint: `むし を もって ${R}クリック で あげよう`,
      fullHint: 'おなか いっぱい。すこし まってね',
      friendFull: 'なかま は 8 わ まで',
      treeEmpty: 'むし は おやすみ。ほか の き を さがそう',
      netHint: `あみ で き を ねらって ${R}クリック`,
      carryHint: `${R}クリック を ながく おす と だっこ`,
      carryWild: 'なかま に なったら だっこ できる よ',
      cantPutHere: 'ここ には おろせない',
    };
    expect(Object.keys(ANIMAL_HINT_VIEW).sort()).toEqual(Object.keys(want).sort());
    for (const k of Object.keys(want) as AnimalWindowHint[]) {
      expect(ANIMAL_HINT_VIEW[k].html, k).toBe(want[k]);
      expect(findUnrubiedKanji(ANIMAL_HINT_VIEW[k].html), k).toEqual([]);
      expect(ANIMAL_HINT_VIEW[k].art.length, `${k} は 絵 が 先`).toBeGreaterThan(0);
    }
    expect(JSON.stringify(ANIMAL_HINT_VIEW)).not.toContain('また あした');
  });
  it('出来事の hint だけ 拾う・120 ステップで 消え・同じ合図は のこり時間を もどすだけ', () => {
    const m = new AnimalHintModel();
    m.feed([{ type: 'pet', id: 1, friend: true }, { type: 'hint', hint: 'fullHint' }]);
    expect(m.current()).toBe('fullHint');
    for (let i = 0; i < 100; i++) m.step();
    m.show('fullHint');
    expect(m.stepsLeft()).toBe(ANIMAL_HINT_STEPS);
    for (let i = 0; i < ANIMAL_HINT_STEPS; i++) m.step();
    expect(m.current()).toBeNull();
  });
});

describe('LIVE-1 小さな 絵', () => {
  it('16x16。にわとり と たまご の しるし の リボン は 色 で 分かれる', () => {
    expect(animalIconPixels('chicken').length).toBe(256);
    expect(animalIconPixels('sun').filter((p) => p[3] > 0).length).toBeGreaterThan(40);
    const blue = (p: readonly number[]) => p[0] === 0x2f && p[2] === 0x8f;
    expect(animalIconPixels('chicken').some(blue)).toBe(false);
    expect(animalIconPixels('chickenRibbon').some(blue)).toBe(true);
  });
});

describe('版 3.2: だっこ中は 左の 案内 を 出さない', () => {
  it('carrying の とき left は 無し・right（おろす）は のこる', async () => {
    const { actionHintLines } = await import('./actionHintModel');
    const ctx = { held: null, heldIsPickaxe: false, heldIsBlade: false, carrying: true };
    const h = actionHintLines({ kind: 'putDown' } as never, 'dig', ctx);
    expect(h.left).toBeUndefined();
    expect(h.right?.word).toBe('おろす');
    expect(actionHintLines(null, 'dig', { ...ctx, carrying: false }).left?.word).toBe('ほる');
  });
});
