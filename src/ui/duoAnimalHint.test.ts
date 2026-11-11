import { describe, expect, it } from 'vitest';
import type { AnimalEvent } from '../contracts';
import { ANIMAL_HINT_STEPS, AnimalHintModel } from './animalHintModel';
import { natsukiPulse } from './natsukiPanelModel';

/**
 * COOP-1 5c（docs/design/COOP-1.md 1.15 §3.7 (d)「合図の チップ」「なつきの パネル」、AC156）の 先行テスト（赤）。
 * 合図は「起こした 人の 半分」。出来事 hint の `by`（2P だけ `2`）で 行き先を ふりわける。チップは 人ごとに 1 つ（モデルを 人ごとに 作る）。
 *
 * ---- 実装への 約束（src/ui/animalHintModel.ts）----
 *   AnimalHintModel.feed(events, who: 1 | 2 = 1)
 *     who 1 は by の ない 出来事 hint だけ、who 2 は by が 2 の 出来事 hint だけ 拾う。who を 省くと 今までどおり（by の ない 物だけ。2 人の ときの 1P の チップ）。
 *     1 人の ときの 出来事には by が ない ので 今の 動きと かわらない。
 *   natsukiPulse(events, aimedId)（src/ui/natsukiPanelModel.ts）は 今のまま。2P の パネルには 2P が ねらった 子の id を わたす（出来事 natsukiReady は ねらわれた 子の 分が 出る）。
 */

const hint = (h: 'fullHint' | 'carryWild' | 'cantPutHere', by?: 2): AnimalEvent => (by ? { type: 'hint', hint: h, by } : { type: 'hint', hint: h });

describe('合図の チップの 行き先（人ごと）', () => {
  it('2P の 合図は 2P の チップだけ。1P の チップには 出ない', () => {
    const p1 = new AnimalHintModel();
    const p2 = new AnimalHintModel();
    const ev = [hint('carryWild', 2)];
    p1.feed(ev, 1);
    p2.feed(ev, 2);
    expect(p1.current()).toBeNull();
    expect(p2.current()).toBe('carryWild');
    expect(p2.stepsLeft()).toBe(ANIMAL_HINT_STEPS);
  });
  it('1P の 合図は 1P の チップだけ（who を 省いても 1P）', () => {
    const p1 = new AnimalHintModel();
    const p2 = new AnimalHintModel();
    const ev = [hint('fullHint')];
    p1.feed(ev);
    p2.feed(ev, 2);
    expect(p1.current()).toBe('fullHint');
    expect(p2.current()).toBeNull();
  });
  it('2 人 同時なら 両方に 出る。同じ 列に 2 つ あっても それぞれ 自分の 物だけ（あたらしい 方）', () => {
    const p1 = new AnimalHintModel();
    const p2 = new AnimalHintModel();
    const ev = [hint('fullHint'), hint('carryWild', 2), hint('cantPutHere', 2)];
    p1.feed(ev, 1);
    p2.feed(ev, 2);
    expect(p1.current()).toBe('fullHint');
    expect(p2.current()).toBe('cantPutHere');
    expect(p1.shown).toBe(1);
    expect(p2.shown).toBe(2);
  });
  it('120 ステップで 消える（人ごとに 別の 時計）', () => {
    const p2 = new AnimalHintModel();
    p2.feed([hint('carryWild', 2)], 2);
    for (let i = 0; i < ANIMAL_HINT_STEPS - 1; i++) p2.step();
    expect(p2.current()).toBe('carryWild');
    p2.step();
    expect(p2.current()).toBeNull();
  });
});

describe('なつきの パネル: 2P が ねらった 子の 動き', () => {
  it('natsukiReady は ねらった 子の 分だけ 拾う（2P の ねらいの id を わたす）', () => {
    const ev: AnimalEvent[] = [
      { type: 'natsukiReady', id: 7, which: 'bug' },
      { type: 'natsukiReady', id: 9, which: 'pet' },
    ];
    expect(natsukiPulse(ev, 9).ready).toEqual(['pet']);
    expect(natsukiPulse(ev, 7).ready).toEqual(['bug']);
    expect(natsukiPulse(ev, null).ready).toEqual([]);
  });
});
