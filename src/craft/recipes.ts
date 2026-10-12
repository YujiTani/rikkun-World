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

/** つくる 20 こ（M4 §4.1。カードの順） */
export const CRAFT_RECIPES: readonly Recipe[] = [
  r('wood_pickaxe', 1, [['log', 3]], true),
  r('stone_pickaxe', 1, [['stone', 3], ['log', 2]], true),
  r('iron_pickaxe', 1, [['iron_ingot', 3], ['log', 2]], true),
  r('furnace', 1, [['stone', 5]], true),
  r('bokuto', 1, [['log', 2]], true),
  r('katana', 1, [['iron_ingot', 2], ['log', 1]], true),
  r('naginata', 1, [['iron_ingot', 1], ['log', 3]], true),
  r('crystal_katana', 1, [['crystal', 1], ['iron_ingot', 1], ['log', 1]], true),
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
];

/** やく 4 こ（M4 §4.2。かまど で。ねんりょう 1 こ・60 ステップ） */
export const BAKE_RECIPES: readonly Recipe[] = [
  r('iron_ingot', 1, [['iron_ore', 1]], true, 'furnace'),
  r('kawara', 2, [['clay', 1]], true, 'furnace'),
  r('brick', 2, [['clay', 1]], true, 'furnace'),
  r('haniwa', 1, [['clay', 2]], false, 'furnace'),
];

export const ALL_RECIPES: readonly Recipe[] = [...CRAFT_RECIPES, ...BAKE_RECIPES];
