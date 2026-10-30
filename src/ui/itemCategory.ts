
/**
 * マスの色分け（M6 §3.5 (7)）。アイテム id → カテゴリー → 色。
 * カテゴリー名は画面には出さない。色は CSS 変数 `--rk-cat-<名前>`（tokens.css）。
 * 分類は 登録表（content/items/）の ItemDef の `category` に 書く（書き忘れは 型エラー）。ここは 色分けの 並びを 決めるだけ。
 */
import type { ItemDefId } from '../content/items/types';
import { ARMOR_DEFS, BOW_DEFS, BUCKET_DEFS, FARM_TOOL_DEFS, GADGET_DEFS, GOLD_DEFS, ITEM_DEFS, KONGO_DEFS, LEGEND_DEFS, LIVE_DEFS, NINJA_SAMURAI_DEFS, SEED_DEFS, SPRINKLER_DEFS, SWORD_DEFS, TOOL_DEFS, VEG_DEFS, itemDef, pickDefs, registryCategoryIds } from '../content/items/registry';

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

/** 登録表の 置ける ブロックのうち、ids の 順に cat の 分類の 物だけ（登録に 無い id は 書きまちがいなので 投げる） */
const blocksIn = (cat: ItemCategory, ids: readonly ItemDefId[]): string[] => registryCategoryIds(cat, pickDefs(ITEM_DEFS, ids));

/**
 * 色分けの 中の 並び（§3.5 (7)）。登録表の シリーズを どの 順に ならべるかを ここで 決める
 * （マスの 色の グループ内の 並びは 画面の 順なので かえない）。忍者・侍・金は うしろに ならぶ
 */
const ORDER_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = {
  // 置ける ブロックの 分類は 登録表（content/items/blocks.ts）の category から
  soil: blocksIn('soil', ['dirt', 'sand', 'snow', 'geyser_dirt']),
  stone: blocksIn('stone', ['stone']),
  plant: [...blocksIn('plant', ['grass', 'log', 'leaves']), ...registryCategoryIds('plant', SEED_DEFS), ...blocksIn('plant', ['momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo']), ...registryCategoryIds('plant', LIVE_DEFS), ...blocksIn('plant', ['nobana'])],
  ore: blocksIn('ore', ['coal_ore', 'iron_ore']),
  build: blocksIn('build', ['kawara', 'brick']),
  // ざいりょう・てつの かたまり・すいしょうも 登録表（content/items/materials.ts）から
  material: [...registryCategoryIds('material', pickDefs(ITEM_DEFS, ['paper', 'string', 'cloth', 'oil', 'clay', 'yokai_orb', 'sumi'])), ...registryCategoryIds('material', LIVE_DEFS)],
  metal: registryCategoryIds('metal', pickDefs(ITEM_DEFS, ['iron_ingot', 'crystal'])),
  tool: [...registryCategoryIds('tool', TOOL_DEFS), ...registryCategoryIds('tool', FARM_TOOL_DEFS), ...registryCategoryIds('tool', BUCKET_DEFS), ...registryCategoryIds('tool', LIVE_DEFS)],
  weapon: [...registryCategoryIds('weapon', SWORD_DEFS), ...registryCategoryIds('weapon', LEGEND_DEFS), ...registryCategoryIds('weapon', BOW_DEFS)], // 刀 4 つ → レジェンダリー 3 つ → ゆみ・や（古い表と 同じ 並び）
  armor: registryCategoryIds('armor', ARMOR_DEFS),
  light: [...blocksIn('light', ['torch']), ...registryCategoryIds('light', GADGET_DEFS)],
  home: [...blocksIn('home', ['furnace', 'tansu']), ...registryCategoryIds('home', pickDefs(GADGET_DEFS, ['futon', 'haniwa', 'kite', 'waraji', 'omamori', 'omamori_torn'])), ...registryCategoryIds('home', SPRINKLER_DEFS), ...registryCategoryIds('home', LIVE_DEFS)],
  food: [...registryCategoryIds('food', VEG_DEFS), ...registryCategoryIds('food', LIVE_DEFS)],
};

/** カテゴリーごとの アイテム（色分けの 並び。登録表の 全アイテムが ちょうど 1 回ずつ 入る = itemCategory.test.ts が 確かめる） */
export const CATEGORY_ITEMS: Readonly<Record<ItemCategory, readonly string[]>> = Object.fromEntries(
  ITEM_CATEGORIES.map((c) => [c, [...ORDER_ITEMS[c], ...registryCategoryIds(c, NINJA_SAMURAI_DEFS), ...registryCategoryIds(c, GOLD_DEFS), ...registryCategoryIds(c, KONGO_DEFS)]]),
) as unknown as Record<ItemCategory, readonly string[]>;

/** アイテムのカテゴリー（登録表の `category`）。アイテムに ならない ブロックの id（みず など）と、セーブや 外から 来た 知らない id は そざい（型では 守れないので 残す） */
export function itemCategory(item: string): ItemCategory {
  return itemDef(item)?.category ?? 'material';
}

/** カテゴリーの色の CSS 変数名（先頭の -- つき） */
export function categoryVar(cat: ItemCategory): string {
  return `--rk-cat-${cat}`;
}

export { rarityIndex } from '../drops/rarityTable';
