export { CraftSystemImpl, type CraftDeps, type FurnaceView, type MakeReason, type BakeReason } from './CraftSystem';
export { ArmorSystemImpl, type ArmorInventory, type ArmorSnapshot } from './ArmorSystem';
export { CRAFT_DEFAULTS, createCraftConfig, ARMOR_SLOT_OF, type CraftConfig } from './config';
export { ALL_RECIPES, CRAFT_RECIPES, BAKE_RECIPES } from './recipes';
export { createCraftHook, createFurnaceHook, createArmorHook, createPickupHook } from './hook';
