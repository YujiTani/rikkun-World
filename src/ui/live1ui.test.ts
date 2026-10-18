import { describe, expect, it } from 'vitest';
import { animalIconPixels } from './animalArt';
import { ANIMAL_HINT_STEPS, ANIMAL_HINT_VIEW, AnimalHintModel } from './animalHintModel';
import { findUnrubiedKanji } from './text';

describe('LIVE-1 合図（§3.1）', () => {
  it('feedHint・eggLater・friendFull の 文。漢字は ふりがな付き', () => {
    for (const k of ['feedHint', 'eggLater', 'friendFull'] as const) expect(findUnrubiedKanji(ANIMAL_HINT_VIEW[k].html), k).toEqual([]);
    expect(ANIMAL_HINT_VIEW.feedHint.html).toBe('やさい を もって <ruby>右<rt>みぎ</rt></ruby>クリック で あげよう');
    expect(ANIMAL_HINT_VIEW.eggLater.html).toBe('たまご は また あした');
    expect(ANIMAL_HINT_VIEW.friendFull.html).toBe('なかま は 8 わ まで');
  });
  it('出来事の hint だけ 拾う・120 ステップで 消え・同じ合図は のこり時間を もどすだけ', () => {
    const m = new AnimalHintModel();
    m.feed([{ type: 'pet', id: 1, friend: true }, { type: 'hint', hint: 'eggLater' }]);
    expect(m.current()).toBe('eggLater');
    for (let i = 0; i < 100; i++) m.step();
    m.show('eggLater');
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
