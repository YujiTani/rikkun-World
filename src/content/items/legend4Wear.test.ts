import { describe, expect, it } from 'vitest';
import { LEGEND4_ID } from './ids';
import { LEGEND4_TUNING } from './legend4Tuning';
import { bladeWearPerHit, bowWearPerShot } from './legend4Wear';

describe('LEGEND-4 たいきゅうの 数', () => {
  it('レジェンダリーの 弓・斧は 表の 数、ほかは 渡された 数', () => {
    expect(bowWearPerShot(LEGEND4_ID.kokuryu, 99)).toBe(LEGEND4_TUNING.kokuryu.wearPerShot);
    expect(bowWearPerShot(LEGEND4_ID.yatagarasu, 99)).toBe(LEGEND4_TUNING.yatagarasu.wearPerShot);
    expect(bowWearPerShot(LEGEND4_ID.tenshi_yumi, 99)).toBe(LEGEND4_TUNING.tenshi.wearPerShot);
    expect(bowWearPerShot('yumi', 99)).toBe(99);
    expect(bladeWearPerHit(LEGEND4_ID.gnome_axe, 99)).toBe(LEGEND4_TUNING.gnome.wearPerHit);
    expect(bladeWearPerHit('katana', 99)).toBe(99);
  });
});
