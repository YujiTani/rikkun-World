import { describe, expect, it } from 'vitest';
import type { AnimalEvent } from '../contracts';
import { NATSUKI_HINT_GAP } from './animalConsts';
import { setupDuo } from './duoKit';

/**
 * 合図 natsukiWait（もう すこし まってね）の 「600 ステップに 1 回」は 人ごと（COOP-1 5f-1 の UI 検査 'duo-animal-hud' で 見つかった）。
 * 1P が 先に 出した ために、少しあとの 2P の 合図が 出ない（2P の 半分の チップが 出ない）のは まちがい。
 */
const hints = (evs: readonly AnimalEvent[]) => evs.filter((e) => e.type === 'hint' && e.hint === 'natsukiWait');

describe('合図 natsukiWait の 間隔は 人ごと', () => {
  it('1P が 出した 少しあとでも 2P の 合図は 出る（by: 2）。同じ 人の 合図は 間隔の あいだ 1 回だけ', () => {
    const s = setupDuo();
    s.settings.animalEggChance = 0;
    s.settings.natsukiBugWaitTicks = 18000;
    const mk = (x: number) => s.m.spawn(x, 9, 20.5, { friend: true, follow: s.settings.animalFollowTicks, natsuki: 30 })!;
    const a = mk(22.5);
    const b = mk(62.5);
    // 1P: たべる → もういちど（まち中）→ 合図
    expect(s.m.feed(a, 'mushi', 1)).toBe('ate');
    expect(s.m.feed(a, 'mushi', 1)).toBe('wait');
    expect(hints(s.m.events())).toHaveLength(1);
    s.step(60);
    // 2P も 同じ 流れ。1P の 少しあとでも 出る
    expect(s.m.feed(b, 'mushi', 2)).toBe('ate');
    expect(s.m.feed(b, 'mushi', 2)).toBe('wait');
    const h2 = hints(s.m.events());
    expect(h2).toHaveLength(1);
    expect(h2[0]).toMatchObject({ by: 2 });
    // 同じ 人は 間隔の あいだ もう 出ない
    s.step(30);
    s.m.feed(b, 'mushi', 2);
    expect(hints(s.m.events())).toHaveLength(0);
    s.step(NATSUKI_HINT_GAP);
    s.m.feed(b, 'mushi', 2);
    expect(hints(s.m.events())).toHaveLength(1);
  });
});
