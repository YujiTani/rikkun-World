import type { ArmorSlot, ItemId } from '../contracts';
import { BLADE_ITEMS } from '../tools/blade/BladeSystem';
import { SAMURAI_GEAR } from './config';
import { NINJA_TUNING } from './ninjaTuning';

/** 防具の マスを 見る ための 最小の 形（ArmorSystem の 一部） */
type Wearing = { equipped(slot: ArmorSlot): ItemId | null };

const SLOTS: readonly ArmorSlot[] = ['head', 'body', 'arms', 'legs'];

/**
 * SAMURAI-1 §4.4 共通の「とばされにくさ」: 着て いる 防具の 表（NINJA_TUNING.knockbackMul）の 値の いちばん 小さい 値（かけ算に しない）。
 * 何も 無い → 1。0〜1 に おさめる。プレイヤーの 押される しくみ（PlayerCombat）と がしゃどくろの はじき（BigShock・GashaBig）の
 * 両方が この 関数 だけを 読む。呼ぶ たびに 防具の マスを 4 つ 見る だけ。
 */
export function knockbackMulOf(armor: Wearing): number {
  const table = NINJA_TUNING.knockbackMul;
  let m = 1;
  for (const slot of SLOTS) {
    const id = armor.equipped(slot);
    const v = id === null ? undefined : table[id];
    if (v !== undefined && v < m) m = v;
  }
  return Math.min(1, Math.max(0, m));
}

/** SAMURAI-1 §4.5 手甲: 刀（BLADE_ITEMS）の 強さに かける 倍率（手甲 + 刀 = 調整表 tekkoBladeMul、ほか 1）。素手・弓・なぎなた・つるはし／おのは 1 */
export function tekkoBladeMulOf(armor: Wearing, item: ItemId | null | undefined): number {
  if (armor.equipped('arms') !== SAMURAI_GEAR.arms) return 1;
  return item && BLADE_ITEMS.has(item) ? NINJA_TUNING.tekkoBladeMul : 1;
}

/** SAMURAI-1 §4.5 手甲: 相手の 防御力から ひく 量（手甲 = 調整表 tekkoDefIgnore、ほか 0） */
export function tekkoDefIgnoreOf(armor: Wearing): number {
  return armor.equipped('arms') === SAMURAI_GEAR.arms ? NINJA_TUNING.tekkoDefIgnore : 0;
}
