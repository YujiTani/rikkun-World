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

/** M4（docs/design/M4-craft.md §4.4）: 置けるブロック 3 種（かまど・かわら・レンガ） */
const M4_BLOCKS: readonly ItemType[] = [
  { id: 'furnace', name: 'かまど', maxStack: BLOCK_MAX_STACK, placeBlock: 'furnace' },
  { id: 'kawara', name: 'かわら', maxStack: BLOCK_MAX_STACK, placeBlock: 'kawara' },
  { id: 'brick', name: 'レンガ', maxStack: BLOCK_MAX_STACK, placeBlock: 'brick' },
  { id: 'torch', name: 'たいまつ', maxStack: BLOCK_MAX_STACK, placeBlock: 'torch' },
  // M6
  { id: 'tansu', name: 'たんす', maxStack: BLOCK_MAX_STACK, placeBlock: 'tansu' },
];

/** M4: 道具・武器・防具・作れるだけのもの 19 種（置けない） */
const M4_ITEMS: readonly ItemType[] = [
  { id: 'wood_pickaxe', name: 'きの つるはし', maxStack: 1, placeBlock: null },
  { id: 'stone_pickaxe', name: 'いしの つるはし', maxStack: 1, placeBlock: null },
  { id: 'iron_pickaxe', name: 'てつの つるはし', maxStack: 1, placeBlock: null },
  { id: 'iron_ingot', name: 'てつの かたまり', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'bokuto', name: 'ぼくとう', maxStack: 1, placeBlock: null },
  { id: 'katana', name: 'かたな', maxStack: 1, placeBlock: null },
  { id: 'naginata', name: 'なぎなた', maxStack: 1, placeBlock: null },
  { id: 'crystal_katana', name: 'きらめく カタナ', maxStack: 1, placeBlock: null },
  { id: 'yumi', name: 'ゆみ', maxStack: 1, placeBlock: null },
  { id: 'ya', name: 'や', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'kabuto', name: 'かぶと', maxStack: 1, placeBlock: null },
  { id: 'yoroi', name: 'よろい', maxStack: 1, placeBlock: null },
  { id: 'kote', name: 'こて', maxStack: 1, placeBlock: null },
  { id: 'suneate', name: 'すねあて', maxStack: 1, placeBlock: null },
  { id: 'lantern', name: 'ちょうちん', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'kite', name: 'たこ', maxStack: 1, placeBlock: null },
  { id: 'futon', name: 'ふとん', maxStack: 1, placeBlock: null },
  { id: 'omamori', name: 'おまもり', maxStack: 1, placeBlock: null },
  { id: 'waraji', name: 'わらじ', maxStack: 1, placeBlock: null },
  { id: 'haniwa', name: 'はにわ', maxStack: BLOCK_MAX_STACK, placeBlock: null },
];

/** M7: たね 4・やさい 4・くわ（置けない。たねは はたけ に まく） */
const M7_ITEMS: readonly ItemType[] = [
  { id: 'seed_onion', name: 'たまねぎの たね', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'seed_tomato', name: 'トマトの たね', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'seed_pumpkin', name: 'かぼちゃの たね', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'seed_eggplant', name: 'なすの たね', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'onion', name: 'たまねぎ', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'tomato', name: 'トマト', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'pumpkin', name: 'かぼちゃ', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'eggplant', name: 'なす', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'kuwa', name: 'くわ', maxStack: 1, placeBlock: null },
];

/** M7-2: じょうろ 2 しゅるい（置けない・上限 1）と スプリンクラー（ブロック・64） */
const M72_ITEMS: readonly ItemType[] = [
  { id: 'watering_can', name: 'じょうろ', maxStack: 1, placeBlock: null },
  { id: 'long_watering_can', name: 'ながい じょうろ', maxStack: 1, placeBlock: null },
  { id: 'sprinkler', name: 'スプリンクラー', maxStack: BLOCK_MAX_STACK, placeBlock: 'sprinkler' },
];

export const ITEM_TYPES: readonly ItemType[] = [
  ...PLACEABLE_TYPES,
  ...ITEM_ONLY,
  ...M4_BLOCKS,
  ...M4_ITEMS,
  ...M7_ITEMS,
  ...M72_ITEMS,
];

const BY_ID = new Map<string, ItemType>(ITEM_TYPES.map((t) => [t.id, t]));

export function itemType(id: string): ItemType | undefined {
  return BY_ID.get(id);
}
