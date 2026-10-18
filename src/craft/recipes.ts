import { CROP_KINDS, SEED_ITEM, VEG_ITEM } from '../contracts';
import type { ItemId, Recipe } from '../contracts';

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

/** つくる 34 こ（M4 §4.1 の 22 こ + BAL-D の おの 3 こ + M7-2 の 3 こ + #63 の たね 4 こ + むしとりあみ。カードの順） */
export const CRAFT_RECIPES: readonly Recipe[] = [
  r('wood_pickaxe', 1, [['log', 3]], true),
  r('stone_pickaxe', 1, [['stone', 3], ['log', 2]], true),
  r('iron_pickaxe', 1, [['iron_ingot', 3], ['log', 2]], true),
  // BAL-D: おの 3 本（てつの つるはし のすぐ後ろ）
  r('wood_axe', 1, [['log', 3]], true),
  r('stone_axe', 1, [['stone', 3], ['log', 2]], true),
  r('iron_axe', 1, [['iron_ingot', 3], ['log', 2]], true),
  r('furnace', 1, [['stone', 5]], true),
  r('bokuto', 1, [['log', 2]], true),
  r('katana', 1, [['iron_ingot', 2], ['log', 1]], true),
  r('naginata', 1, [['iron_ingot', 1], ['log', 3]], true),
  r('crystal_katana', 1, [['crystal', 2], ['iron_ingot', 3], ['log', 1]], true),
  r('yumi', 1, [['log', 3], ['string', 3]], true),
  r('ya', 4, [['log', 1], ['stone', 1], ['paper', 1]], true),
  r('kabuto', 1, [['iron_ingot', 2], ['cloth', 1]], true),
  r('yoroi', 1, [['iron_ingot', 3], ['string', 2], ['cloth', 2]], true),
  r('kote', 1, [['iron_ingot', 1], ['cloth', 1]], true),
  r('suneate', 1, [['iron_ingot', 2], ['string', 1]], true),
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
];

/** やく 4 こ（M4 §4.2。かまど で。ねんりょう 1 こ・60 ステップ） */
export const BAKE_RECIPES: readonly Recipe[] = [
  r('iron_ingot', 1, [['iron_ore', 1]], true, 'furnace'),
  r('kawara', 2, [['clay', 1]], true, 'furnace'),
  r('brick', 2, [['clay', 1]], true, 'furnace'),
  r('haniwa', 1, [['clay', 2]], false, 'furnace'),
];

export const ALL_RECIPES: readonly Recipe[] = [...CRAFT_RECIPES, ...BAKE_RECIPES];
