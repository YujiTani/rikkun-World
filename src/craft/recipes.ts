import type { ItemId, Recipe } from '../contracts';
import { ARMOR_DEFS, BOW_DEFS, BUCKET_DEFS, FARM_TOOL_DEFS, GADGET_DEFS, GOLD_DEFS, INGOT_DEFS, LIVE_DEFS, SEED_DEFS, SPRINKLER_DEFS, SWORD_DEFS, TOOL_DEFS, noteDuplicates, recipesOf } from '../content/items/registry';

const r = (
  id: ItemId,
  count: number,
  inputs: Array<[ItemId, number]>,
  works: boolean,
  station: 'craft' | 'furnace' = 'craft',
): Recipe => ({
  id,
  output: { item: id, count },
  inputs: inputs.map(([item, n]) => ({ item, count: n })),
  works,
  station,
});

/** たいまつの 足した作り方の id（もとの `torch` は き 1・あぶら 1 → 4） */
export const TORCH_COAL = 'torch_coal';
export const TORCH_LOG = 'torch_log';

/** つくる 38 こ（カードは 36 枚。たいまつの 作り方が 3 つ）（M4 §4.1 の 22 こ + BAL-D の おの 3 こ + M7-2 の 3 こ + #63 の たね 4 こ + むしとりあみ + こたつ・とりごや。カードの順） */
export const CRAFT_RECIPES: readonly Recipe[] = [
  // M4・BAL-D: つるはし 3 本・おの 3 本は 登録表（content/items/tools.ts）から。順は 登録の 順
  ...recipesOf(TOOL_DEFS, 'craft'),
  r('furnace', 1, [['stone', 5]], true),
  // M4: ぼくとう・かたな・なぎなた・きらめく カタナ・ゆみ・や・かぶと・よろい・こて・すねあては 登録表（content/items/weapons.ts・armor.ts）から。順は 刀 → ゆみ・や → 防具
  ...recipesOf(SWORD_DEFS, 'craft'),
  ...recipesOf(BOW_DEFS, 'craft'),
  ...recipesOf(ARMOR_DEFS, 'craft'),
  r('torch', 4, [['log', 1], ['oil', 1]], true),
  // 小物（ちょうちん・たこ・ふとん・おまもり・わらじ。はにわは かまど）は 登録表（content/items/misc.ts）から。順は 登録の 順
  ...recipesOf(GADGET_DEFS, 'craft'),
  // M6: たんす（き 8・てつの かたまり 2）
  r('tansu', 1, [['log', 8], ['iron_ingot', 2]], true),
  // 畑は 登録表（content/items/farm.ts）から。順は くわ → じょうろ → ながい じょうろ → スプリンクラー → バケツ（29 こ目）→ たね 4 こ（やさい 1 こ → たね 4 こ。作物の 順）
  ...recipesOf(FARM_TOOL_DEFS, 'craft'),
  ...recipesOf(SPRINKLER_DEFS, 'craft'),
  ...recipesOf(BUCKET_DEFS, 'craft'),
  ...recipesOf(SEED_DEFS, 'craft'),
  // 生き物は 登録表（content/items/live.ts）から。むしとりあみ（き 1・いと 2。こわれない）→ こたつ（くさ 3・き 2・たいまつ 1）→ とりごや（き 8・くさ 4）の 順。カードの いちばん うしろ
  ...recipesOf(LIVE_DEFS, 'craft'),
  // GOLD-1（#222 §4.2。きんの 装備 8 つ）は 登録表（content/items/gold.ts）から。順は 登録の 順（この 位置を かえない）
  ...recipesOf(GOLD_DEFS, 'craft'),
  // CRAFT-PAGE（#277）: たいまつの 足した作り方 2 つ（いちばん うしろ。番号を ずらさない）。カードは 元の torch の 1 枚のまま
  // （作り方は せつめい欄のページで えらぶ）。出来る物は どれも torch
  { ...r('torch', 4, [['log', 1], ['coal_ore', 1]], true), id: TORCH_COAL },
  { ...r('torch', 1, [['log', 3]], true), id: TORCH_LOG },
];

/** やく 6 こ（M4 §4.2 の 4 こ ＋ LIVE-3 の やいた もも にく ＋ GOLD-1 の きん。かまど で。ねんりょう 1 こ・60 ステップ。やいた もも にく は いちばん うしろ） */
export const BAKE_RECIPES: readonly Recipe[] = [
  // てつの かたまりは 登録表（content/items/materials.ts）から。かわら・レンガの 次の はにわは 登録表（content/items/misc.ts）から
  ...recipesOf(INGOT_DEFS, 'furnace'),
  r('kawara', 2, [['clay', 1]], true, 'furnace'),
  r('brick', 2, [['clay', 1]], true, 'furnace'),
  ...recipesOf(GADGET_DEFS, 'furnace'),
  // GOLD-1（§4.2）: きん の たまご を やく と きん 1 は 登録表（content/items/gold.ts）から
  ...recipesOf(GOLD_DEFS, 'furnace'),
  // LIVE-3（§4.2）: なま もも にく → やいた もも にく（ねんりょう 1・60 ステップ）は 登録表（content/items/live.ts）から
  ...recipesOf(LIVE_DEFS, 'furnace'),
];

export const ALL_RECIPES: readonly Recipe[] = [...CRAFT_RECIPES, ...BAKE_RECIPES];
noteDuplicates('ALL_RECIPES', ALL_RECIPES.map((x) => x.id));

/** カード 1 枚に まとまる作り方の グループ（同じ台・同じ出来る物）。先頭の id（カードの id）→ 作り方の id（先頭が元の作り方、あとは足した順） */
export function groupRecipes(recipes: readonly Recipe[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const r of recipes) {
    const key = `${r.station}:${r.output.item}`;
    const g = byKey.get(key);
    if (g) g.push(r.id);
    else byKey.set(key, [r.id]);
  }
  const out = new Map<string, string[]>();
  for (const ids of byKey.values()) out.set(ids[0], ids);
  return out;
}

const PRIMARY_OF = new Map<string, string>();
for (const [primary, ids] of groupRecipes(ALL_RECIPES)) for (const id of ids) PRIMARY_OF.set(id, primary);

/** 作り方の id → カードの id（足した作り方は 元の id。実績・「つくった」の記録で 同じ物として数える） */
export const baseRecipeId = (id: string): string => PRIMARY_OF.get(id) ?? id;
