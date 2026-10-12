import type { BlockId, DigSettings } from '../contracts';

/**
 * ほる・おくの数値（M2 §4.1・§4.3）。ここ 1 か所にまとめる。
 * 決まり: ブロックを足すときは、かならず hardness と harvestLevel を書く。
 */
export interface DigConfig extends DigSettings {
  /**
   * はなしたあとに、ほった量がもどる速さ（ほる速さに対する倍率）。1.0 = ほったのと同じ速さ。
   * （オーナー決定。digResumeTicks のかわり）
   */
  digDecayRate: number;
}

export const DIG_DEFAULTS: Readonly<DigConfig> = {
  reach: 5.0,
  hardness: {
    air: null,
    water: null,
    bedrock: null,
    leaves: 0.25,
    grass: 0.5,
    dirt: 0.5,
    sand: 0.5,
    log: 5,
    stone: 6,
    coal_ore: 10,
    iron_ore: 15,
  } satisfies Record<BlockId, number | null>,
  harvestLevel: {
    air: 0,
    water: 0,
    bedrock: 0,
    leaves: 0,
    grass: 0,
    dirt: 0,
    sand: 0,
    log: 0,
    stone: 0,
    coal_ore: 0,
    iron_ore: 1,
  },
  handPower: 1.0,
  handLevel: 0,
  // digResumeTicks は使わない（digDecayRate に置きかえ）。contracts の型に合わせて 0 を入れておく
  digResumeTicks: 0,
  digCooldown: 6,
  placeRepeatTicks: 30,
  digDecayRate: 1.0,
};

export function createDigConfig(): DigConfig {
  return {
    ...DIG_DEFAULTS,
    hardness: { ...DIG_DEFAULTS.hardness },
    harvestLevel: { ...DIG_DEFAULTS.harvestLevel },
  };
}

/** 体の箱（M1-02 §4.1）。置く判定に使う */
export const BODY_W = 0.6;
export const BODY_H = 1.8;
