import type { ItemId } from '../contracts';
import { randInt, type Rng } from '../world/gen/random';
import { SAMURAI_IDS, isSamuraiGear } from './SamuraiBook';
import { NINJA_TUNING } from './ninjaTuning';

/**
 * SAMURAI-1 §4.2: 侍装備を 1 つ えらぶ。
 *  ・まだ 手に 入れた ことの ない 物（book に 無い）が あれば その 中から 1 つ。
 *  ・4 つ そろった あと（5 回目から）は 今 持って いない 物（have に 無い）から 1 つ。ぜんぶ 持って いれば null。
 * 乱数は シード付き（毎回 同じ 順に しない）。
 * book = 手に 入れた ことの ある 物、have = いま 持って いる 物（もちもの・防具の マス・手に もった 物）。
 */
export function pickSamuraiGear(rng: Rng, book: readonly ItemId[], have: readonly ItemId[]): ItemId | null {
  const fresh = SAMURAI_IDS.filter((i) => !book.includes(i));
  const pool = fresh.length > 0 ? fresh : SAMURAI_IDS.filter((i) => !have.includes(i));
  if (pool.length === 0) return null;
  return pool[randInt(rng, 0, pool.length - 1)]!;
}

/**
 * ヌシの 表（pickNushiDrop）に わたす 「選べるか」の 関数。侍装備でない 物は いつも true（武器の 行は 持って いるかを 見ない）、
 * 侍装備は pickSamuraiGear が えらべる 物（まだの 物、そろった あとは 持って いない 物）だけ true。
 */
export function samuraiSelectable(book: readonly ItemId[], have: readonly ItemId[]): (item: ItemId) => boolean {
  const fresh = SAMURAI_IDS.filter((i) => !book.includes(i));
  const pool = fresh.length > 0 ? fresh : SAMURAI_IDS.filter((i) => !have.includes(i));
  return (item) => !isSamuraiGear(item) || pool.includes(item);
}

/** 宝箱の くじ: 当たりか。乱数を ちょうど 1 つ 使う（chance 割合で 当たり） */
export function samuraiChestHit(rng: Rng, chance: number = NINJA_TUNING.samuraiChestChance): boolean {
  return rng() < chance;
}

/** 宝箱を 開けた とき: くじに 当たったら 侍装備を 1 つ（なければ null）。宝箱は まだ 無い ので 関数だけ（GOLD-1 の harapanChest と 同じ 扱い） */
export function rollSamuraiChest(rng: Rng, book: readonly ItemId[], have: readonly ItemId[], chance: number = NINJA_TUNING.samuraiChestChance): ItemId | null {
  return samuraiChestHit(rng, chance) ? pickSamuraiGear(rng, book, have) : null;
}
