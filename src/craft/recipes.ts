import { CROP_KINDS, SEED_ITEM, VEG_ITEM } from '../contracts';
import type { ItemId, Recipe } from '../contracts';
import { ARMOR_DEFS, BOW_DEFS, GOLD_DEFS, SWORD_DEFS, TOOL_DEFS, noteDuplicates, recipesOf } from '../content/items/registry';

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
  r('lantern', 1, [['paper', 2], ['log', 1], ['oil', 1]], false),
  r('kite', 1, [['paper', 3], ['string', 2], ['log', 1]], false),
  r('futon', 1, [['cloth', 3], ['string', 1]], false),
  r('omamori', 1, [['crystal', 1], ['cloth', 1], ['string', 1]], false),
  r('waraji', 1, [['grass', 3], ['string', 1]], false),
  // M6: たんす（き 8・てつの かたまり 2）
  r('tansu', 1, [['log', 8], ['iron_ingot', 2]], true),
  // M7: くわ（き 2・いし 1。カードの いちばん うしろ）
  r('kuwa', 1, [['log', 2], ['stone', 1]], true),
  // M7-2: じょうろ・ながい じょうろ（からっぽ）・スプリンクラー（23〜25 こ目）
  r('watering_can', 1, [['iron_ingot', 1], ['stone', 2]], true),
  r('long_watering_can', 1, [['iron_ingot', 3], ['log', 1]], true),
  r('sprinkler', 1, [['iron_ingot', 4], ['stone', 2]], true),
  // BUCKET-1: バケツ（29 こ目 = スプリンクラー の すぐ うしろ）
  r('bucket', 1, [['iron_ingot', 3]], true),
  // #63: やさい 1 こ → たね 4 こ（いちばん うしろ）
  ...CROP_KINDS.map((k) => r(SEED_ITEM[k], 4, [[VEG_ITEM[k], 1]], true)),
  // LIVE-1 版 3.2: むしとりあみ（き 1・いと 2。カードの いちばん うしろ。こわれない）
  r('mushi_ami', 1, [['log', 1], ['string', 2]], true),
  // LIVE-2（§4.2）: こたつ（くさ 3・き 2・たいまつ 1）・とりごや（き 8・くさ 4）。カードの いちばん うしろ（この 順）
  r('nukunuku', 1, [['grass', 3], ['log', 2], ['torch', 1]], true),
  r('toriya', 1, [['log', 8], ['grass', 4]], true),
  // GOLD-1（#222 §4.2。きんの 装備 8 つ）は 登録表（content/items/gold.ts）から。順は 登録の 順（この 位置を かえない）
  ...recipesOf(GOLD_DEFS, 'craft'),
  // CRAFT-PAGE（#277）: たいまつの 足した作り方 2 つ（いちばん うしろ。番号を ずらさない）。カードは 元の torch の 1 枚のまま
  // （作り方は せつめい欄のページで えらぶ）。出来る物は どれも torch
  { ...r('torch', 4, [['log', 1], ['coal_ore', 1]], true), id: TORCH_COAL },
  { ...r('torch', 1, [['log', 3]], true), id: TORCH_LOG },
];

/** やく 6 こ（M4 §4.2 の 4 こ ＋ LIVE-3 の やいた もも にく ＋ GOLD-1 の きん。かまど で。ねんりょう 1 こ・60 ステップ。やいた もも にく は いちばん うしろ） */
export const BAKE_RECIPES: readonly Recipe[] = [
  r('iron_ingot', 1, [['iron_ore', 1]], true, 'furnace'),
  r('kawara', 2, [['clay', 1]], true, 'furnace'),
  r('brick', 2, [['clay', 1]], true, 'furnace'),
  r('haniwa', 1, [['clay', 2]], false, 'furnace'),
  // GOLD-1（§4.2）: きん の たまご を やく と きん 1 は 登録表（content/items/gold.ts）から
  ...recipesOf(GOLD_DEFS, 'furnace'),
  // LIVE-3（§4.2）: なま もも にく → やいた もも にく（ねんりょう 1・60 ステップ）
  r('momo_yaki', 1, [['momo_nama', 1]], true, 'furnace'),
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
