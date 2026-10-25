/**
 * CRAFT2 の設定の初期値。`src/contracts.ts` から分けた（中身は移しただけ）。
 */

import type { Craft2Settings } from '../contracts/craft';

export const CRAFT2_SETTING_DEFAULTS: Readonly<Craft2Settings> = {
  logHistoryMax: 100,
  logMergeTicks: 180,
  logScrollRows: 3,
  uiPanelAlpha: 0.8,
  uiHudAlpha: 0.6,
  uiScrimAlpha: 0.2,
  uiAlphaMin: 0.6,
  craftTansuRange: 40,
};

export function createCraft2Settings(): Craft2Settings {
  return { ...CRAFT2_SETTING_DEFAULTS };
}
