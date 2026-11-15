import { afterEach, describe, expect, it } from 'vitest';
import { terrainFor } from '../world/gen/terrain';
import { TownPlan } from './townPlan';
import { chooseTown } from './townPlace';
import { deactivateTown } from './townState';
import { TOWN } from './townTuning';

/** 1B-2: こやの 建築士さん・だいくさんの 立つ 高さは、4 つの 向きの どれでも こやの ゆか（地面〔か 台〕の 1 マス 上の ブロックの 上面）。屋根の 上では ない */
afterEach(() => deactivateTown());

describe('こやの 立つ 高さ', () => {
  it('4 つの 向きの どれでも home の y は ゆかの 上面（地面 + 2）で、ふだの 高さと 同じ', () => {
    const seed = 20261012;
    const sp = terrainFor(seed).spawn();
    const rec = chooseTown(seed)!;
    for (const facing of ['n', 'e', 's', 'w'] as TownPlan['rec']['facing'][]) {
      const plan = new TownPlan({ ...rec, facing }, { x: sp.x, z: sp.z });
      const h = plan.carpenterHome();
      const rise = Math.round(h.y) - (rec.groundY + 2);
      expect([0, TOWN.terrace.rise], `向き ${facing}`).toContain(rise);
      expect(h.y, `向き ${facing}: 整数（ゆかの 上面）`).toBe(Math.round(h.y));
      expect(plan.carpenterSign().y).toBe(h.y);
    }
  });
});
