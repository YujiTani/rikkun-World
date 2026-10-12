import type { BlockId, DigSettings, Rarity } from '../contracts';

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
  /** ひびの段階の数（3）。段階 = 1 + floor(段階の数 × ほった量 ÷ ほる時間) */
  crackStages: number;
  /** ブロックごとのめずらしさ。ブロックを足すときは hardness と同じく必ず決める */
  rarity: Record<BlockId, Rarity>;
  /** めずらしさごとの、こわしたとき手に入る数の最大（1〜最大の一様ランダム） */
  dropMax: Record<Rarity, number>;
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
    // M4（§4.4）
    furnace: 6,
    torch: 0.05, // ほぼすぐこわれる
    start_torch: null, // こわれない
    kawara: 4,
    brick: 6,
    // M6
    tansu: 5,
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
    // M4（§4.4）
    furnace: 0,
    torch: 0,
    start_torch: 0,
    kawara: 0,
    brick: 0,
    tansu: 0,
  },
  handPower: 1.0,
  handLevel: 0,
  // digResumeTicks は使わない（digDecayRate に置きかえ）。contracts の型に合わせて 0 を入れておく
  digResumeTicks: 0,
  digCooldown: 6,
  placeRepeatTicks: 30,
  digDecayRate: 1.0,
  crackStages: 3,
  rarity: {
    air: 'common',
    water: 'common',
    bedrock: 'common',
    leaves: 'common',
    grass: 'common',
    dirt: 'common',
    sand: 'common',
    stone: 'common',
    log: 'uncommon',
    coal_ore: 'uncommon',
    iron_ore: 'rare',
    // M4（docs/design/M4-craft.md §4.4）
    furnace: 'uncommon',
    torch: 'common',
    start_torch: 'common',
    kawara: 'uncommon',
    brick: 'uncommon',
    tansu: 'uncommon',
  } satisfies Record<BlockId, Rarity>,
  dropMax: { common: 4, uncommon: 3, rare: 2, superRare: 1 },
};

export function createDigConfig(): DigConfig {
  return {
    ...DIG_DEFAULTS,
    hardness: { ...DIG_DEFAULTS.hardness },
    harvestLevel: { ...DIG_DEFAULTS.harvestLevel },
    rarity: { ...DIG_DEFAULTS.rarity },
    dropMax: { ...DIG_DEFAULTS.dropMax },
  };
}

/** 体の箱（M1-02 §4.1）。置く判定に使う */
export const BODY_W = 0.6;
export const BODY_H = 1.8;
