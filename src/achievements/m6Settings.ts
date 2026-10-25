/**
 * M6 の設定の初期値。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { M6Settings } from '../contracts/achievements';

/** `hardness.tansu`・`fixedDrop.tansu`（5・1 こ）は D が M2・M4 の設定に足す */
export const M6_SETTING_DEFAULTS: Readonly<M6Settings> = {
  craftComboTicks: 120,
  craftComboMax: 8,
  bannerTicks: 180,
  bannerInTicks: 36,
  bannerOutTicks: 30,
  achieveSmallBatch: 5,
  achieveSmallMaxWait: 18000,
  achieveCooldown: 1800,
  achieveCooldownEarly: 5400,
  achieveEarlyTicks: 18000,
  achieveCalmHurtTicks: 120,
  achieveCalmYokaiDist: 8,
  achieveCalmMaxWait: 1800,
  achieveToastTicks: 240,
  legendTelopTicks: 300,
  achieveModalRows: 5,
  achieveLowHp: 3,
  achieveChainTicks: 600,
  achieveChainCount: 3,
  dropPickupDelay: 60,
  dropThrowSpeed: 4,
  dropThrowUp: 2,
  tansuSlots: 54,
  tansuCloseDist: 6,
};

/** 設定の入れ物を作る（つなぎ込みが `createSettingsHook` の extras に渡す。毎回 新しいコピー） */
export function createM6Settings(): M6Settings {
  return { ...M6_SETTING_DEFAULTS };
}
