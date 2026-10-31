import { describe, expect, it } from 'vitest';
import { HouseCelebrate } from './celebrate';
import { CELEBRATE } from './tuning';

describe('AC36 完成の 盛り上げ', () => {
  it('はじめは 0 回・帯なし。fire で ちょうど 1 ふえ、帯が 出て、時間で 消える。そのあと ふえない', () => {
    const c = new HouseCelebrate();
    expect(c.view()).toEqual({ confetti: 0, banner: null });
    c.fire('ももの いえ');
    expect(c.view()).toEqual({ confetti: 1, banner: { text: 'ももの いえ が できた！', ticksLeft: CELEBRATE.bannerTicks } });
    for (let i = 0; i < CELEBRATE.bannerTicks; i++) c.step();
    expect(c.view()).toEqual({ confetti: 1, banner: null });
  });
});
