import type { ArmorSlot, ItemId } from '../contracts';
import { NINJA_GEAR } from './config';
import { NINJA_TUNING } from './ninjaTuning';

/**
 * NINJA-1 §4.3 黒頭巾: 着ている 防具から「水の 中で 酸素が へる 速さの 倍率」を 返す（頭巾 = 調整表の zukinOxygenDrainMul、なし = 1）。
 * 酸素の しくみは まだ 無い。酸素を 作る issue が この 関数を 使う。
 */
export function oxygenDrainMul(armor: { equipped(slot: ArmorSlot): ItemId | null }): number {
  return armor.equipped('head') === NINJA_GEAR.head ? NINJA_TUNING.zukinOxygenDrainMul : 1;
}
