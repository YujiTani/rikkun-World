import type { BlockId, ItemType } from '../contracts';
import { ARMOR_DEFS, BOW_DEFS, BUCKET_DEFS, FARM_TOOL_DEFS, GADGET_DEFS, GOLD_DEFS, INGOT_DEFS, LEGEND_DEFS, MATERIAL_DEFS, NINJA_SAMURAI_DEFS, SEED_DEFS, SPRINKLER_DEFS, SWORD_DEFS, TOOL_DEFS, VEG_DEFS, itemTypesOf, noteDuplicates } from '../content/items/registry';
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

/** M4（docs/design/M4-craft.md §4.4）: 置けるブロック 3 種（かまど・かわら・レンガ） */
const M4_BLOCKS: readonly ItemType[] = [
  { id: 'furnace', name: 'かまど', maxStack: BLOCK_MAX_STACK, placeBlock: 'furnace' },
  { id: 'kawara', name: 'かわら', maxStack: BLOCK_MAX_STACK, placeBlock: 'kawara' },
  { id: 'brick', name: 'レンガ', maxStack: BLOCK_MAX_STACK, placeBlock: 'brick' },
  { id: 'torch', name: 'たいまつ', maxStack: BLOCK_MAX_STACK, placeBlock: 'torch' },
  // M6
  { id: 'tansu', name: 'たんす', maxStack: BLOCK_MAX_STACK, placeBlock: 'tansu' },
];

/** M4 のつづき。すねあての 次の 忍者・侍装備 8 つは 登録表（content/items/ninja.ts・samurai.ts）から（ITEM_TYPES で この 前に 入れて、並びを 変えない）。小物 6 つは この 次に 登録表から 入れる */
const M4_ITEMS_AFTER_GEAR: readonly ItemType[] = [
  // #293 試作: 間欠泉の つち（置ける。置けば どこでも 間欠泉。名前は ［漢字｜よみ］ — withRuby で 画面に 出す）
  { id: 'geyser_dirt', name: '［間欠泉｜かんけつせん］の つち', maxStack: BLOCK_MAX_STACK, placeBlock: 'geyser_dirt' },
];

/** VOX-I-1: 12 の国のブロック（置ける）。すすき・くさ は こわすと 消えるので 持ち物にならない（のばな は 持てる。FLORA-75） */
const VOX_I_BLOCKS: readonly ItemType[] = (
  ['snow', 'momiji_leaves', 'matsu_leaves', 'flower_y', 'flower_o', 'flower_p', 'bamboo', 'nobana'] as const
).map((id): ItemType => ({ id, name: BLOCK_TYPES.find((b) => b.id === id)!.name, maxStack: BLOCK_MAX_STACK, placeBlock: id }));

/** LIVE-1: たまご（なかま の にわとり が くれる。たべる。置けない） */
const LIVE_ITEMS: readonly ItemType[] = [
  { id: 'egg', name: 'たまご', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  // 版 3.2（§4.2）: むし（えさ。上限は やさい と 同じ）・むしとりあみ（1 本。こわれない）
  { id: 'mushi', name: 'むし', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'mushi_ami', name: 'むしとりあみ', maxStack: 1, placeBlock: null },
  // LIVE-2（§4.2。mushi_ami の うしろ）: こたつ（ブロック。id は nukunuku のまま）・とりごや（5×5 の 小屋 を 置く。ブロック では ない）・きん の たまご
  { id: 'nukunuku', name: 'こたつ', maxStack: BLOCK_MAX_STACK, placeBlock: 'nukunuku' },
  { id: 'toriya', name: 'とりごや', maxStack: 1, placeBlock: null },
  { id: 'kin_tamago', name: 'きん の たまご', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  // LIVE-3（仮）: もも にく（なま・やいた）
  { id: 'momo_nama', name: 'なま もも にく', maxStack: BLOCK_MAX_STACK, placeBlock: null },
  { id: 'momo_yaki', name: 'やいた もも にく', maxStack: BLOCK_MAX_STACK, placeBlock: null },
];

export const ITEM_TYPES: readonly ItemType[] = [
  ...PLACEABLE_TYPES,
  // M3・M4: ようかいだま → かみ・あぶら・いと・ぬの・ねんど・すいしょう（置けない）は 登録表（content/items/materials.ts）から
  ...itemTypesOf(MATERIAL_DEFS),
  ...M4_BLOCKS,
  // M4: つるはし 3 本・おの 3 本 → てつの かたまり（置けない） → 刀 4 つ・ゆみ・や・防具 4 つ は 登録表（content/items/）から（古い表と 同じ 位置）
  ...itemTypesOf(TOOL_DEFS),
  ...itemTypesOf(INGOT_DEFS),
  ...itemTypesOf(SWORD_DEFS),
  ...itemTypesOf(BOW_DEFS),
  ...itemTypesOf(ARMOR_DEFS),
  // NINJA-1（#299）・SAMURAI-1（#300）: 忍者装備 4 つ・侍装備 4 つは 登録表から（古い表と 同じ 位置）
  ...itemTypesOf(NINJA_SAMURAI_DEFS),
  ...M4_ITEMS_AFTER_GEAR,
  // M4: 小物 6 つ（ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ）は 登録表（content/items/misc.ts）から（間欠泉の つちの 次）
  ...itemTypesOf(GADGET_DEFS),
  // M7・M7-2・BUCKET-1: たね 4・やさい 4・くわ・じょうろ 2・スプリンクラー・バケツ 2 は 登録表（content/items/farm.ts）から（古い表と 同じ 位置）
  ...itemTypesOf(SEED_DEFS),
  ...itemTypesOf(VEG_DEFS),
  ...itemTypesOf(FARM_TOOL_DEFS),
  ...itemTypesOf(SPRINKLER_DEFS),
  ...itemTypesOf(BUCKET_DEFS),
  ...VOX_I_BLOCKS,
  ...LIVE_ITEMS,
  // WEAPON-7/8/9: レジェンダリー武器 3 つ（雷神剣・風神剣・虹）は 登録表（content/items/legend.ts）から
  ...itemTypesOf(LEGEND_DEFS),
  // GOLD-1（#222）: きん・きんの そうび 8 こ・はらぱんみみず は 登録表（content/items/gold.ts）から
  ...itemTypesOf(GOLD_DEFS),
];

noteDuplicates('ITEM_TYPES', ITEM_TYPES.map((t) => t.id));

const BY_ID = new Map<string, ItemType>(ITEM_TYPES.map((t) => [t.id, t]));

export function itemType(id: string): ItemType | undefined {
  return BY_ID.get(id);
}
