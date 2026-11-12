import { describe, expect, it } from 'vitest';
import { COUNTRY_PLANT_IDS } from './countryPlants';
import { BLOCK_INDEX, isCrossIndex } from './blockTypes';
import { HIMAWARI, HIMAWARI_TOP, himawariPartnerDy } from './himawari';

describe('ひまわり 2 段（VOX-I-4a）', () => {
  it('相手の 段: 下 → 上へ +1、上 → 下へ −1、ひまわりで なければ null', () => {
    expect(himawariPartnerDy(HIMAWARI)).toBe(1);
    expect(himawariPartnerDy(HIMAWARI_TOP)).toBe(-1);
    expect(himawariPartnerDy('flower_y')).toBeNull();
    expect(himawariPartnerDy('air')).toBeNull();
  });

  it('国だけの物の 小さな 板 5 つは ぜんぶ 十字の 板で 描く（固くない）', () => {
    expect(COUNTRY_PLANT_IDS).toHaveLength(5);
    for (const id of COUNTRY_PLANT_IDS) expect(isCrossIndex(BLOCK_INDEX[id]), id).toBe(true);
  });
});
