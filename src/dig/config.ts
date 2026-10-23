import { defaultDropMax } from '../drops/rarityTable';
import type { BlockId, DigSettings, ItemId, Rarity } from '../contracts';

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
    // LIVE-2（§2.3）: こたつ は ふとん で やわらかい（手 で 2 秒）。小屋 の ブロック は たんす と 同じ 時間
    nukunuku: 2,
    nukunuku_e: 2,
    nukunuku_s: 2,
    nukunuku_se: 2,
    toriya_fence: 5,
    toriya_gate: 5,
    toriya_nest: 5,
    toriya_box: 5,
    // M7（仮。C が §4.1 のとおりに直す: 作物・やせいの やさい は ほれない〈しゅうかく〉、かかし は こわれない）
    farmland: 0.5,
    farmland_wet: 0.5,
    crop_onion: null,
    crop_tomato: null,
    crop_pumpkin: null,
    crop_eggplant: null,
    wild_onion: null,
    wild_tomato: null,
    wild_pumpkin: null,
    wild_eggplant: null,
    kakashi: null,
    kakashi_head: null,
    saku: 1,
    sprinkler: 3,
    // VOX-I-1（12 の国）
    snow: 0.5,
    momiji_leaves: 0.25,
    matsu_leaves: 0.25,
    flower_y: 0.05,
    flower_o: 0.05,
    flower_p: 0.05,
    bamboo: 1.5,
    susuki: 0.05,
    kusa: 0.05,
    nobana: 0.05,
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
    nukunuku: 0,
    nukunuku_e: 0,
    nukunuku_s: 0,
    nukunuku_se: 0,
    toriya_fence: 0,
    toriya_gate: 0,
    toriya_nest: 0,
    toriya_box: 0,
    farmland: 0,
    farmland_wet: 0,
    crop_onion: 0,
    crop_tomato: 0,
    crop_pumpkin: 0,
    crop_eggplant: 0,
    wild_onion: 0,
    wild_tomato: 0,
    wild_pumpkin: 0,
    wild_eggplant: 0,
    kakashi: 0,
    kakashi_head: 0,
    saku: 0,
    sprinkler: 0,
    snow: 0,
    momiji_leaves: 0,
    matsu_leaves: 0,
    flower_y: 0,
    flower_o: 0,
    flower_p: 0,
    bamboo: 0,
    susuki: 0,
    kusa: 0,
    nobana: 0,
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
    nukunuku: 'uncommon',
    nukunuku_e: 'uncommon',
    nukunuku_s: 'uncommon',
    nukunuku_se: 'uncommon',
    toriya_fence: 'uncommon',
    toriya_gate: 'uncommon',
    toriya_nest: 'uncommon',
    toriya_box: 'uncommon',
    // M7（仮。C が決める）
    farmland: 'common',
    farmland_wet: 'common',
    crop_onion: 'common',
    crop_tomato: 'common',
    crop_pumpkin: 'common',
    crop_eggplant: 'common',
    wild_onion: 'common',
    wild_tomato: 'common',
    wild_pumpkin: 'common',
    wild_eggplant: 'common',
    kakashi: 'common',
    kakashi_head: 'common',
    saku: 'common',
    sprinkler: 'uncommon',
    // VOX-I-1（12 の国）
    snow: 'common',
    momiji_leaves: 'common',
    matsu_leaves: 'common',
    flower_y: 'common',
    flower_o: 'common',
    flower_p: 'common',
    bamboo: 'common',
    susuki: 'common',
    kusa: 'common',
    nobana: 'common',
  } satisfies Record<BlockId, Rarity>,
  dropMax: defaultDropMax(),
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

/** M7: こわすと 決まった もの 1 こ（はたけ = つち、さく = き） */
export const FARM_BREAK_DROP: Readonly<Partial<Record<BlockId, { item: ItemId; count: number }>>> = {
  farmland: { item: 'dirt', count: 1 },
  farmland_wet: { item: 'dirt', count: 1 },
  saku: { item: 'log', count: 1 },
  sprinkler: { item: 'sprinkler', count: 1 },
  // FLORA-75: のばな は いつも 1 こ（ランダムな数にしない）
  nobana: { item: 'nobana', count: 1 },
};

/** VOX-I-1: こわすと 持ち物がふえない ブロック（すすき・FLORA-75 の くさ。ふえるのは ひろえる物だけ） */
export const NO_DROP_BLOCKS: ReadonlySet<BlockId> = new Set<BlockId>(['susuki', 'kusa']);

/** 体の箱（M1-02 §4.1）。置く判定に使う */
export const BODY_W = 0.6;
export const BODY_H = 1.8;
