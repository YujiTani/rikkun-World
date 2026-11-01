import type { ItemType } from '../contracts';
import { ARMOR_DEFS, BOW_DEFS, BUCKET_DEFS, FARM_TOOL_DEFS, GADGET_DEFS, GEYSER_DEFS, GOLD_DEFS, HOUSE_BLOCK_DEFS, HOUSE_FURNITURE_DEFS, HOUSE_PLAN_DEFS, HOUSE_TOOL_DEFS, INGOT_DEFS, ROPE_DEFS, KONGO_DEFS, LEGEND_DEFS, LIVE_DEFS, M4_BLOCK_DEFS, MATERIAL_DEFS, MINE_DEFS, NINJA_SAMURAI_DEFS, PLACEABLE_DEFS, SEED_DEFS, SPRINKLER_DEFS, SWORD_DEFS, TOOL_DEFS, VEG_DEFS, VOX_I_DEFS, itemTypesOf } from '../content/items/registry';

export const INVENTORY_SIZE = 36;
export const HOTBAR_SIZE = 9;
export const BLOCK_MAX_STACK = 64;

export const ITEM_TYPES: readonly ItemType[] = [
  // 置ける ブロック 8 つ（くさ・つち・いし・すな・き・はっぱ・せきたん・てつ）は 登録表（content/items/blocks.ts）から。名前は BLOCK_TYPES の まま
  ...itemTypesOf(PLACEABLE_DEFS),
  // M3・M4: ようかいだま → かみ・あぶら・いと・ぬの・ねんど・すいしょう（置けない）は 登録表（content/items/materials.ts）から
  ...itemTypesOf(MATERIAL_DEFS),
  // M4・M6: かまど・かわら・レンガ・たいまつ・たんす（置ける）も 登録表（content/items/blocks.ts）から
  ...itemTypesOf(M4_BLOCK_DEFS),
  // M4: つるはし 3 本・おの 3 本 → てつの かたまり（置けない） → 刀 4 つ・ゆみ・や・防具 4 つ は 登録表（content/items/）から（古い表と 同じ 位置）
  ...itemTypesOf(TOOL_DEFS),
  ...itemTypesOf(INGOT_DEFS),
  ...itemTypesOf(SWORD_DEFS),
  ...itemTypesOf(BOW_DEFS),
  ...itemTypesOf(ARMOR_DEFS),
  // NINJA-1（#299）・SAMURAI-1（#300）: 忍者装備 4 つ・侍装備 4 つは 登録表から（古い表と 同じ 位置）
  ...itemTypesOf(NINJA_SAMURAI_DEFS),
  // #293 試作: 間欠泉の つち（置ける。名前は ［漢字｜よみ］ — withRuby で 画面に 出す）も 登録表（content/items/blocks.ts）から
  ...itemTypesOf(GEYSER_DEFS),
  // M4: 小物 6 つ（ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ）は 登録表（content/items/misc.ts）から（間欠泉の つちの 次）
  ...itemTypesOf(GADGET_DEFS),
  // M7・M7-2・BUCKET-1: たね 4・やさい 4・くわ・じょうろ 2・スプリンクラー・バケツ 2 は 登録表（content/items/farm.ts）から（古い表と 同じ 位置）
  ...itemTypesOf(SEED_DEFS),
  ...itemTypesOf(VEG_DEFS),
  ...itemTypesOf(FARM_TOOL_DEFS),
  ...itemTypesOf(SPRINKLER_DEFS),
  ...itemTypesOf(BUCKET_DEFS),
  // VOX-I-1: 12 の国の ブロック 8 つ（置ける。すすき・くさ は こわすと 消えるので 持ち物にならない）も 登録表（content/items/blocks.ts）から
  ...itemTypesOf(VOX_I_DEFS),
  // LIVE-1〜3: たまご・むし・むしとりあみ・こたつ（ブロック）・とりごや・きんの たまご・もも にく 2 つ は 登録表（content/items/live.ts）から（古い表と 同じ 位置）
  ...itemTypesOf(LIVE_DEFS),
  // WEAPON-7/8/9: レジェンダリー武器 3 つ（雷神剣・風神剣・虹）は 登録表（content/items/legend.ts）から
  ...itemTypesOf(LEGEND_DEFS),
  // GOLD-1（#222）: きん・きんの そうび 8 こ・はらぱんみみず は 登録表（content/items/gold.ts）から
  ...itemTypesOf(GOLD_DEFS),
  // KONGO-1: ダイヤ・こんごうの そうび 8 こ（金の すぐ うしろ）は 登録表（content/items/kongo.ts）から
  ...itemTypesOf(KONGO_DEFS),
  // HOUSE-1A（#338）: みずもり・どうづき（建築士さんが くれる 道具）は 登録表（content/items/house.ts）から
  ...itemTypesOf(HOUSE_TOOL_DEFS),
  // MINE-1B（#349）: せっかいせき・ほたるいし・きんの いし・しっくい・チョーク・いしばいは 登録表（content/items/blocks.ts・mine.ts）から
  ...itemTypesOf(MINE_DEFS),
  // HOUSE-1B（#339）: 新しい 家具・せっけいず も 登録表（content/items/houseEditor.ts）から（いちばん うしろ）
  ...itemTypesOf(HOUSE_FURNITURE_DEFS),
  ...itemTypesOf(HOUSE_PLAN_DEFS),
  // HOUSE-1C PR-1（#340）: 家の ブロック 5 つ（ゆか・かべ・やね・しょうじ・戸）は 登録表（content/items/houseBlocks.ts）から
  ...itemTypesOf(HOUSE_BLOCK_DEFS),
  ...itemTypesOf(ROPE_DEFS), // ROPE-1: いちばん うしろ
];

const BY_ID = new Map<string, ItemType>(ITEM_TYPES.map((t) => [t.id, t]));

export function itemType(id: string): ItemType | undefined {
  return BY_ID.get(id);
}
