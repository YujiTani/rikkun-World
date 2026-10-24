import type { ItemId } from '../contracts';
import { randInt, type Rng } from '../world/gen/random';
import { NINJA_IDS } from './NinjaBook';
import { NINJA_TUNING } from './ninjaTuning';

/**
 * NINJA-1 §4.2: 忍者装備を 1 つ えらぶ。
 *  ・まだ 手に 入れた ことの ない 物（book に 無い）が あれば その 中から 1 つ。
 *  ・4 つ そろった あと（5 回目から）は 今 持って いない 物（have に 無い）から 1 つ。ぜんぶ 持って いれば null。
 * 乱数は シード付き（毎回 同じ 順に しない）。
 * book = 手に 入れた ことの ある 物、have = いま 持って いる 物（もちもの・防具の マス・手に もった 物）。
 */
export function pickNinjaGear(rng: Rng, book: readonly ItemId[], have: readonly ItemId[]): ItemId | null {
  const fresh = NINJA_IDS.filter((i) => !book.includes(i));
  const pool = fresh.length > 0 ? fresh : NINJA_IDS.filter((i) => !have.includes(i));
  if (pool.length === 0) return null;
  return pool[randInt(rng, 0, pool.length - 1)]!;
}

/** 宝箱の くじ: 当たりか。乱数を ちょうど 1 つ 使う（chance 割合で 当たり） */
export function ninjaChestHit(rng: Rng, chance: number = NINJA_TUNING.ninjaChestChance): boolean {
  return rng() < chance;
}

/** 宝箱を 開けた とき: くじに 当たったら 忍者装備を 1 つ（なければ null）。宝箱は まだ 無い ので 関数だけ（GOLD-1 の harapanChest と 同じ 扱い） */
export function rollNinjaChest(rng: Rng, book: readonly ItemId[], have: readonly ItemId[], chance: number = NINJA_TUNING.ninjaChestChance): ItemId | null {
  return ninjaChestHit(rng, chance) ? pickNinjaGear(rng, book, have) : null;
}
