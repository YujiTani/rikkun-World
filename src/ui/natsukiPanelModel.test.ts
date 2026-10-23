import { describe, expect, it } from 'vitest';
import type { AnimalEvent, NatsukiView } from '../contracts';
import { findUnrubiedKanji } from './text';
import { NATSUKI_TITLE, natsukiLook, natsukiPulse } from './natsukiPanelModel';
import { ANIMAL_HINT_VIEW } from './animalHintModel';

const view = (o: Partial<NatsukiView> = {}): NatsukiView => ({ shown: true, hearts: 4, gold: false, bugFill: 0.5, bugReady: false, petFill: 0.25, petReady: false, ...o }) as NatsukiView;

describe('なかよし パネル の 見せかた（GOLD-1 §3.2）', () => {
  it('見えない・null は かくす', () => {
    expect(natsukiLook(null).hidden).toBe(true);
    expect(natsukiLook(view({ shown: false })).hidden).toBe(true);
  });
  it('ハート・色・たまご の しるし', () => {
    const a = natsukiLook(view());
    expect(a).toMatchObject({ hidden: false, tone: 'pink', full: 4, egg: 'gray' });
    expect(a.bug).toEqual({ fill: 0.5, ready: false });
    expect(a.pet).toEqual({ fill: 0.25, ready: false });
    const g = natsukiLook(view({ gold: true, hearts: 10, bugReady: true, petReady: true }));
    expect(g).toMatchObject({ tone: 'gold', full: 10, egg: 'lit' });
    expect(g.bug).toEqual({ fill: 1, ready: true });
  });
  it('ハート は 0〜10 に おさめる', () => {
    expect(natsukiLook(view({ hearts: 99 })).full).toBe(10);
    expect(natsukiLook(view({ hearts: -3 })).full).toBe(0);
  });
  it('出来事: ねらって いる 子 だけ ひろう', () => {
    const ev = [
      { type: 'natsukiWait', id: 1, which: 'bug' },
      { type: 'natsukiWait', id: 2, which: 'pet' },
      { type: 'natsukiReady', id: 1, which: 'pet' },
      { type: 'natsukiGold', id: 1 },
    ] as unknown as AnimalEvent[];
    expect(natsukiPulse(ev, 1)).toEqual({ shake: ['bug'], ready: ['pet'], gold: true });
    expect(natsukiPulse(ev, 3)).toEqual({ shake: [], ready: [], gold: false });
    expect(natsukiPulse(ev, null).gold).toBe(false);
  });
  it('字: ルビ なし の 漢字 が 無い（AC21）', () => {
    expect(findUnrubiedKanji(NATSUKI_TITLE)).toEqual([]);
    for (const k of ['natsukiWait', 'harapanFull', 'harapanFriend'] as const) expect(findUnrubiedKanji(ANIMAL_HINT_VIEW[k].html), k).toEqual([]);
  });
});
