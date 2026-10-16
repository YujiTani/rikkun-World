import type { ItemId, Rarity } from '../contracts';
import { RARITY_TIERS, itemRarity, rarityAtLeast, rarityTier } from './rarity';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** テスト用の窓口 `window.__rikkun.rarity`（RARITY-7 §4.4）。dropMax は 今の設定の値 */
export function createRarityHook(dropMax: () => Readonly<Record<Rarity, number>>) {
  return {
    tiers: () =>
      RARITY_TIERS.map((t) => ({
        index: t.index,
        id: t.id,
        stars: t.stars,
        word: t.word,
        color: hex(t.color),
        cssVar: t.cssVar,
        gem: t.gem,
        dropMax: dropMax()[t.id],
      })),
    of: (item: ItemId) => {
      const t = rarityTier(itemRarity(item));
      return { id: t.id, index: t.index, stars: t.stars, word: t.word, color: hex(t.color), gem: t.gem };
    },
    atLeast: (item: ItemId, id: Rarity): boolean => rarityAtLeast(item, id),
  };
}
