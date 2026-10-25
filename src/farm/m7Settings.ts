/**
 * M7 の設定の初期値。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import { registryCan } from '../content/items/registry';
import type { M7Settings, WateringCanId } from '../contracts/farm';

export const M7_SETTING_DEFAULTS: Readonly<M7Settings> = {
  farmGrowDays: {
    dry: { onion: 1.875, tomato: 1.125, pumpkin: 3, eggplant: 1.875 },
    wet: { onion: 1.275, tomato: 0.75, pumpkin: 1.95, eggplant: 1.275 },
  },
  farmMinLight: 9,
  farmMaxWaitFactor: 3,
  farmWetRange: 4,
  farmWetRecheckTicks: 60,
  farmHandTillPresses: 3,
  farmHandTillResetTicks: 120,
  farmYield: { onion: [1, 2], tomato: [1, 2], pumpkin: [1, 1], eggplant: [1, 2] },
  farmSeedYield: [1, 2],
  farmGrassSeedChance: 0.125,
  farmGrassSeedWeight: 4,
  eatHeal: { onion: 2, tomato: 2, pumpkin: 4, eggplant: 2 },
  farmRipeMinBrightness: 0,
  farmWaterDays: 1,
  // じょうろの 水の 回数・まく マス数は 登録表（content/items/farm.ts の `can`）から
  farmCanCapacity: registryCan('capacity') as Record<WateringCanId, number>,
  farmCanTiles: registryCan('tiles') as Record<WateringCanId, number>,
  farmCanYReach: 1,
  farmPourRepeatTicks: 30,
  farmWetSoonRatio: 0.25,
  farmSprinklerRadius: 2,
  farmSprinklerSprayTicks: 120,
  farmPetDays: 1,
  farmPetGrowBonus: 0.1,
  farmHeartEvery: 180,
  farmHeartRange: 16,
  farmHeartMax: 32,
  farmSparkleEvery: 45,
  farmSparkleRange: 24,
  farmSparkleMax: 96,
};

/** 設定の入れ物を作る（毎回 ふかい コピー。つなぎ込みが `createSettingsHook` の extras に渡す） */
export function createM7Settings(): M7Settings {
  const d = M7_SETTING_DEFAULTS;
  return {
    ...d,
    farmGrowDays: { dry: { ...d.farmGrowDays.dry }, wet: { ...d.farmGrowDays.wet } },
    farmYield: {
      onion: [...d.farmYield.onion],
      tomato: [...d.farmYield.tomato],
      pumpkin: [...d.farmYield.pumpkin],
      eggplant: [...d.farmYield.eggplant],
    },
    farmSeedYield: [...d.farmSeedYield],
    eatHeal: { ...d.eatHeal },
    farmCanCapacity: { ...d.farmCanCapacity },
    farmCanTiles: { ...d.farmCanTiles },
  };
}
