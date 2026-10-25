
/**
 * マスの色分け（M6 §3.5 (7)）。アイテム id → カテゴリー → 色 を 1 か所で持つ。
 * カテゴリー名は画面には出さない。色は CSS 変数 `--rk-cat-<名前>`（tokens.css）。
 * 新しいアイテムを足すときは、ここにも 1 行足す（表に無いアイテムは `material` = そざい）。
 * 登録表（content/items/）に うつしたシリーズは、そちらの `category` に 書く（ここへは 自動で 入る）。
 */
import { ARMOR_DEFS, BOW_DEFS, BUCKET_DEFS, FARM_TOOL_DEFS, GADGET_DEFS, GOLD_DEFS, ITEM_DEFS, LEGEND_DEFS, LIVE_DEFS, NINJA_SAMURAI_DEFS, SEED_DEFS, SPRINKLER_DEFS, SWORD_DEFS, TOOL_DEFS, VEG_DEFS, noteDuplicates, pickDefs, registryCategoryIds } from '../content/items/registry';

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

/**
 * まだ 登録表（content/items/）に うつしていない アイテムの カテゴリー（§3.5 (7) の表）。
 * 古い表の 先頭・まん中に 入る 登録表の 分（道具・刀・レジェンダリー・ゆみ・防具）は ここで 場所を 書いて 差し込む（うしろに ならぶ 分は 下の CATEGORY_ITEMS）
 */
const OLD_CATEGORY_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = {
  soil: ['dirt', 'sand', 'snow', 'geyser_dirt'],
  stone: ['stone'],
  plant: ['grass', 'log', 'leaves', ...registryCategoryIds('plant', SEED_DEFS), 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', ...registryCategoryIds('plant', LIVE_DEFS), 'nobana'],
  ore: ['coal_ore', 'iron_ore'],
  build: ['kawara', 'brick'],
  // ざいりょう・てつの かたまり・すいしょうは 登録表（content/items/materials.ts）から。並びは 古い表と 同じに ここで 決める
  material: [...registryCategoryIds('material', pickDefs(ITEM_DEFS, ['paper', 'string', 'cloth', 'oil', 'clay', 'yokai_orb'])), ...registryCategoryIds('material', LIVE_DEFS)],
  metal: registryCategoryIds('metal', pickDefs(ITEM_DEFS, ['iron_ingot', 'crystal'])),
  tool: [...registryCategoryIds('tool', TOOL_DEFS), ...registryCategoryIds('tool', FARM_TOOL_DEFS), ...registryCategoryIds('tool', BUCKET_DEFS), ...registryCategoryIds('tool', LIVE_DEFS)],
  weapon: [...registryCategoryIds('weapon', SWORD_DEFS), ...registryCategoryIds('weapon', LEGEND_DEFS), ...registryCategoryIds('weapon', BOW_DEFS)], // 刀 4 つ → レジェンダリー 3 つ → ゆみ・や（古い表と 同じ 並び）
  armor: registryCategoryIds('armor', ARMOR_DEFS),
  light: ['torch', ...registryCategoryIds('light', GADGET_DEFS)],
  home: ['furnace', 'tansu', ...registryCategoryIds('home', pickDefs(GADGET_DEFS, ['futon', 'haniwa', 'kite', 'waraji', 'omamori'])), ...registryCategoryIds('home', SPRINKLER_DEFS), ...registryCategoryIds('home', LIVE_DEFS)],
  food: [...registryCategoryIds('food', VEG_DEFS), ...registryCategoryIds('food', LIVE_DEFS)],
};

/** カテゴリーごとの アイテム（§3.5 (7) の表 ＋ 忍者・侍・金。忍者・侍・金は うしろに ならぶ） */
export const CATEGORY_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = Object.fromEntries(
  ITEM_CATEGORIES.map((c) => [c, [...OLD_CATEGORY_ITEMS[c], ...registryCategoryIds(c, NINJA_SAMURAI_DEFS), ...registryCategoryIds(c, GOLD_DEFS)]]),
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
