import type { BlockId, ItemType } from '../contracts';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';

export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;
export const BLOCK_MAX_STACK = 64;

/** 置けるブロック 8 種（M2 §4.2） */
const PLACEABLE: readonly BlockId[] = [
  'grass',
  'dirt',
  'stone',
  'sand',
  'log',
  'leaves',
  'coal_ore',
  'iron_ore',
];

const PLACEABLE_TYPES: readonly ItemType[] = PLACEABLE.map((id): ItemType => ({
  id,
  name: BLOCK_TYPES.find((b) => b.id === id)!.name,
  maxStack: BLOCK_MAX_STACK,
  placeBlock: id,
}));

/** アイテムだけのもの（置けない）。M3: ようかいだま（M4 のクラフトの材料） */
const ITEM_ONLY: readonly ItemType[] = [
  { id: 'yokai_orb', name: 'ようかいだま', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'paper', name: 'かみ', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'oil', name: 'あぶら', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'string', name: 'いと', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'cloth', name: 'ぬの', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'clay', name: 'ねんど', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'crystal', name: 'すいしょう', maxStack: BLOCK_MAX_STACK, placeBlock: null },
];

export const ITEM_TYPES: readonly ItemType[] = [...PLACEABLE_TYPES, ...ITEM_ONLY];

const BY_ID = new Map<string, ItemType>(ITEM_TYPES.map((t) => [t.id, t]));

export function itemType(id: string): ItemType | undefined {
  return BY_ID.get(id);
}
