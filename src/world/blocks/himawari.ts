import type { BlockId } from '../../contracts';

/**
 * ひまわり（VOX-I-4a #187。仕様 §2.5・§5）。2 段で立つ: 下の 段 = くき（`himawari`。持ち物の アイテムも この id）・上の 段 = 花（`himawari_top`）。
 * どちらの 段を こわしても 2 段とも 消えて himawari 1 こ。置くには 上の 1 マスが あいて いる こと。
 * 何も import しない 葉（型だけ）。
 */
export const HIMAWARI: BlockId = 'himawari';
export const HIMAWARI_TOP: BlockId = 'himawari_top';

/** 相手の 段の 高さ（下の 段 → 上へ +1、上の 段 → 下へ −1）。ひまわりで なければ null */
export function himawariPartnerDy(id: string): 1 | -1 | null {
  return id === HIMAWARI ? 1 : id === HIMAWARI_TOP ? -1 : null;
}
