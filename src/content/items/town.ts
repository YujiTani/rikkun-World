import type { TownItemId } from './ids';
import type { ItemDef } from './types';

/**
 * 街の 物（TOWN-1 1E #381。仕様 docs/design/TOWN-1-shop.md §2.10・§4.7）。値は ここ 1 か所（ルール #304）。
 * かえりの おふだ: よろずやで 買う（ねだんは `town/shop/shopTable.ts`）。手に もって 右クリックで ため の あと 街の ひろばへ。
 * ため の 長さ・もどる 所の はんいは `town/vendor/vendorTable.ts` の `OFUDA_TUNING`。宝箱の くじには 入れない（`world/gen/mineChest.ts` の EXCLUDED）。
 * 絵は ui/itemArtTown.ts。
 */
export const TOWN_ITEMS = {
  kaeri_ofuda: {
    name: 'かえりの おふだ',
    zukan: 'まちの ふんすいの ［力｜ちから］が こもった おふだ。もって つかうと からだが ふわっと ひかって、どんなに とおくからでも まちの ひろばへ ひとっとび。',
    maxStack: 16, // かさなる 数（§4.7）
    rarity: 'common', // ノーマル ★1（§4.7）
    category: 'tool',
    info: { use: 'つかうと まち の ひろば へ かえれる', how: 'てに もって みぎクリック。ひかって いる あいだ まってね', buttons: ['1-9', 'right'] },
    source: 'まち の よろずや で こうかん',
  },
} satisfies Record<TownItemId, ItemDef>;
