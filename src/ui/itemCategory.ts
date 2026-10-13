import type { Rarity } from '../contracts';

/**
 * マスの色分け（M6 §3.5 (7)）。アイテム id → カテゴリー → 色 を 1 か所で持つ。
 * カテゴリー名は画面には出さない。色は CSS 変数 `--rk-cat-<名前>`（tokens.css）。
 * 新しいアイテムを足すときは、ここにも 1 行足す（表に無いアイテムは `material` = そざい）。
 */
export type ItemCategory =
  | 'soil'
  | 'stone'
  | 'plant'
  | 'ore'
  | 'build'
  | 'material'
  | 'metal'
  | 'tool'
  | 'weapon'
  | 'armor'
  | 'light'
  | 'home'
  | 'food';

export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'soil',
  'stone',
  'plant',
  'ore',
  'build',
  'material',
  'metal',
  'tool',
  'weapon',
  'armor',
  'light',
  'home',
  'food',
];

/** カテゴリーごとの アイテム（§3.5 (7) の表 そのまま） */
export const CATEGORY_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = {
  soil: ['dirt', 'sand'],
  stone: ['stone'],
  plant: ['grass', 'log', 'leaves', 'seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant'],
  ore: ['coal_ore', 'iron_ore'],
  build: ['kawara', 'brick'],
  material: ['paper', 'string', 'cloth', 'oil', 'clay', 'yokai_orb'],
  metal: ['iron_ingot', 'crystal'],
  tool: ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'kuwa'],
  weapon: ['bokuto', 'katana', 'naginata', 'crystal_katana', 'yumi', 'ya'],
  armor: ['kabuto', 'yoroi', 'kote', 'suneate'],
  light: ['torch', 'lantern'],
  home: ['furnace', 'tansu', 'futon', 'haniwa', 'kite', 'waraji', 'omamori'],
  food: ['onion', 'tomato', 'pumpkin', 'eggplant'],
};

const BY_ITEM = new Map<string, ItemCategory>();
for (const cat of ITEM_CATEGORIES) for (const id of CATEGORY_ITEMS[cat]) BY_ITEM.set(id, cat);

/** アイテムのカテゴリー（表に無いものは そざい） */
export function itemCategory(item: string): ItemCategory {
  return BY_ITEM.get(item) ?? 'material';
}

/** カテゴリーの色の CSS 変数名（先頭の -- つき） */
export function categoryVar(cat: ItemCategory): string {
  return `--rk-cat-${cat}`;
}

/** めずらしさ → 0〜3（--rk-rarity-N と 宝石の印の形） */
export function rarityIndex(r: Rarity): 0 | 1 | 2 | 3 {
  return r === 'common' ? 0 : r === 'uncommon' ? 1 : r === 'rare' ? 2 : 3;
}
