
/**
 * マスの色分け（M6 §3.5 (7)）。アイテム id → カテゴリー → 色 を 1 か所で持つ。
 * カテゴリー名は画面には出さない。色は CSS 変数 `--rk-cat-<名前>`（tokens.css）。
 * 新しいアイテムを足すときは、ここにも 1 行足す（表に無いアイテムは `material` = そざい）。
 * 登録表（content/items/）に うつしたシリーズは、そちらの `category` に 書く（ここへは 自動で 入る）。
 */
import { LEGEND_DEFS, noteDuplicates, registryCategoryIds } from '../content/items/registry';

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

/** まだ 登録表（content/items/）に うつしていない アイテムの カテゴリー（§3.5 (7) の表）。レジェンダリーだけは 古い表の まん中に 登録表の 分が 入る */
const OLD_CATEGORY_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = {
  soil: ['dirt', 'sand', 'snow', 'geyser_dirt'],
  stone: ['stone'],
  plant: ['grass', 'log', 'leaves', 'seed_onion', 'seed_tomato', 'seed_pumpkin', 'seed_eggplant', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'mushi', 'nobana'],
  ore: ['coal_ore', 'iron_ore'],
  build: ['kawara', 'brick'],
  material: ['paper', 'string', 'cloth', 'oil', 'clay', 'yokai_orb', 'kin_tamago'],
  metal: ['iron_ingot', 'crystal'],
  tool: ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'wood_axe', 'stone_axe', 'iron_axe', 'kuwa', 'watering_can', 'long_watering_can', 'bucket', 'water_bucket', 'mushi_ami'],
  weapon: ['bokuto', 'katana', 'naginata', 'crystal_katana', ...registryCategoryIds('weapon', LEGEND_DEFS), 'yumi', 'ya'], // レジェンダリー 3 つは 登録表（content/items/legend.ts）から（古い表と 同じ 位置）
  armor: ['kabuto', 'yoroi', 'kote', 'suneate'],
  light: ['torch', 'lantern'],
  home: ['furnace', 'tansu', 'futon', 'haniwa', 'kite', 'waraji', 'omamori', 'sprinkler', 'nukunuku', 'toriya'],
  food: ['onion', 'tomato', 'pumpkin', 'eggplant', 'egg', 'momo_nama', 'momo_yaki'],
};

/** カテゴリーごとの アイテム（§3.5 (7) の表 ＋ 登録表から 作った分。登録表の 分は うしろに ならぶ） */
export const CATEGORY_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = Object.fromEntries(
  ITEM_CATEGORIES.map((c) => [c, [...OLD_CATEGORY_ITEMS[c], ...registryCategoryIds(c)]]),
) as unknown as Record<ItemCategory, readonly string[]>;

noteDuplicates('CATEGORY_ITEMS', ITEM_CATEGORIES.flatMap((c) => CATEGORY_ITEMS[c]));

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

export { rarityIndex } from '../drops/rarityTable';
