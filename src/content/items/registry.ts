import type { ArmorSlot, BladeTrailStyle, DamageKind, ItemId, ItemType, LegendaryDef, Recipe } from '../../contracts';
import type { InfoRow } from '../../craft/info/table';
import type { ToolFamily } from '../../dig/toolFamily';
import type { ItemCategory } from '../../ui/itemCategory';
import { ARMOR } from './armor';
import { GEYSER, M4_BLOCKS, MINE_BLOCKS, PLACEABLE, VOX_I } from './blocks';
import { BUCKETS, FARM_TOOLS, SEEDS, SPRINKLER, VEGGIES } from './farm';
import { GOLD } from './gold';
import { HOUSE_TOOLS } from './house';
import { HOUSE_FURNITURE, HOUSE_PLANS } from './houseEditor';
import { LEGEND } from './legend';
import { KONGO } from './kongo';
import { KOTATSU, LIVE } from './live';
import { INGOT, MATERIALS, ORB } from './materials';
import { MINE_ITEMS } from './mine';
import { GADGETS } from './misc';
import { NINJA } from './ninja';
import { SAMURAI } from './samurai';
import { TOOLS } from './tools';
import type { ItemDef, ItemDefId } from './types';
import { BOWS, SWORDS } from './weapons';

/**
 * アイテムの登録表（#306・ルール #304「1 つのデータは 1 か所」）。
 * シリーズごとの定義（gold.ts …）を ならべ、窓口の 表（ITEM_TYPES・ITEM_INFO・TOOL_DEFAULTS…）が
 * 登録表だけから 作れるように 「見せ方」の 関数を 出す。
 * 実行時に contracts.ts を import しない（import の輪を 作らない）。型だけを読む。
 *
 * 新しい金を足すとき: ids.ts に id → gold.ts に値 → ui/itemArtGold.ts に絵（Record<GoldId> なので 書き忘れは 型エラー）。
 * 忍者・侍も 同じ（ninja.ts・samurai.ts。絵は ui/itemArtNinja.ts・itemArtSamurai.ts）。
 * レジェンダリー武器（雷神剣・風神剣・虹）は legend.ts（ためわざ・効果は `legend` の部品。絵は ui/itemArtW7.ts）。
 * ふつうの 道具・武器・防具（M4）は tools.ts（つるはし・おの）・weapons.ts（刀・なぎなた／ゆみ・や）・armor.ts。絵は ui/itemArtM4.ts。
 * 畑（たね・やさい・くわ・じょうろ・スプリンクラー・バケツ 14 個）は farm.ts。絵は ui/itemArtM7.ts・itemArtM72.ts・bucketArt.ts。
 * ざいりょう（ようかいだま・かみ・あぶら・いと・ぬの・ねんど・すいしょう・てつの かたまり）は materials.ts、小物（ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ）は misc.ts。
 * 生き物（たまご・むし・むしとりあみ・こたつ・とりごや・きんの たまご・もも にく 2 つ）は live.ts（食べた ときの 回復量は `food` 部品）。絵は ui/itemArtLive1〜3.ts。
 * 建築士さんが くれる 道具（みずもり・どうづき）は house.ts。絵は ui/itemArtHouse.ts。
 * 置ける ブロック 22 個（くさ・つち・いし・すな・き・はっぱ・せきたん・てつ・かまど・かわら・レンガ・たいまつ・たんす・間欠泉の つち・12 の国の ブロック 8 つ）は blocks.ts（ブロックとしての 性質は BLOCK_TYPES と DIG_DEFAULTS のまま）。
 * ITEM_DEFS は Record<ItemDefId, ItemDef>（全件を 型で 強制）。ItemId の うち アイテムに ならない ブロック（BLOCK_ONLY_IDS）以外は
 * 1 つでも 書き忘れると 型エラー。
 */
/** シリーズ（登録表の 一部） */
export type ItemDefs = Readonly<Partial<Record<ItemDefId, ItemDef>>>;

/**
 * シリーズごとの定義（ITEM_TYPES・作業台のカード・色分けの 順は どの 位置に 入れるかで 決まるので、シリーズ単位でも 出す。
 * 並びを 決める 側（inventory/items.ts・craft/recipes.ts・ui/itemCategory.ts）が、どの 並びで 入れるかを 自分で 書く）
 */
export const GOLD_DEFS: ItemDefs = GOLD;
/** ダイヤ・こんごうの そうび 8 こ（金の 次。並びも 金の すぐ うしろ） */
export const KONGO_DEFS: ItemDefs = KONGO;
/** つるはし 3 本・おの 3 本（これまでと 同じ 位置（M4 の 先頭）に 入れる） */
export const TOOL_DEFS: ItemDefs = TOOLS;
/** ぼくとう・かたな・なぎなた・きらめく カタナ（てつの かたまりの 次） */
export const SWORD_DEFS: ItemDefs = SWORDS;
/** ゆみ・や（刀の 次。武器の 色分けでは レジェンダリーの 次） */
export const BOW_DEFS: ItemDefs = BOWS;
/** かぶと・よろい・こて・すねあて（ゆみ・やの 次） */
export const ARMOR_DEFS: ItemDefs = ARMOR;
/** 忍者・侍（ITEM_TYPES では これまでと 同じ 位置（すねあての 次）に 入れる） */
export const NINJA_SAMURAI_DEFS: ItemDefs = { ...NINJA, ...SAMURAI };

/** 畑のたね 4（ITEM_TYPES では これまでと 同じ 位置（M7）の 先頭。作業台では ずっと うしろ（バケツの 次）） */
export const SEED_DEFS: ItemDefs = SEEDS;
/** 畑のやさい 4（たねの 次） */
export const VEG_DEFS: ItemDefs = VEGGIES;
/** くわ・じょうろ・ながい じょうろ（やさいの 次。道具の 色分けでは つるはしの 次） */
export const FARM_TOOL_DEFS: ItemDefs = FARM_TOOLS;
/** スプリンクラー（置ける ブロック。じょうろの 次） */
export const SPRINKLER_DEFS: ItemDefs = SPRINKLER;
/** バケツ・みずの バケツ（スプリンクラーの 次。道具の 色分けでは じょうろの 次） */
export const BUCKET_DEFS: ItemDefs = BUCKETS;

/** ようかいだま・かみ・あぶら・いと・ぬの・ねんど・すいしょう 7（ITEM_TYPES では これまでと 同じ 位置（道具の 前の 先頭）に 入れる。色分けの 並びは 呼び出し側で 決める） */
export const MATERIAL_DEFS: ItemDefs = { ...ORB, ...MATERIALS };
/** てつの かたまり（つるはし・おの 6 本の 次。かまどで やく 作り方） */
export const INGOT_DEFS: ItemDefs = INGOT;
/** ちょうちん・たこ・ふとん・おまもり・わらじ・はにわ（ITEM_TYPES では 間欠泉の つちの 次。作業台では たいまつの 次） */
export const GADGET_DEFS: ItemDefs = GADGETS;

/**
 * たまご・むし・むしとりあみ・こたつ・とりごや・きんの たまご・なま／やいた もも にく（ITEM_TYPES では これまでと 同じ 位置（花の ブロックの 次）。
 * この 並びは ITEM_TYPES の 順。こたつ（nukunuku）は 置ける ブロック（BlockId 側）なので 別の 表 KOTATSU から 入れる）
 */
export const LIVE_DEFS: ItemDefs = pickDefs({ ...LIVE, ...KOTATSU }, ['egg', 'mushi', 'mushi_ami', 'nukunuku', 'toriya', 'kin_tamago', 'momo_nama', 'momo_yaki']);

/** 置ける ブロック 8 つ（くさ・つち・いし・すな・き・はっぱ・せきたん・てつ。ITEM_TYPES の 先頭） */
export const PLACEABLE_DEFS: ItemDefs = PLACEABLE;
/** かまど・かわら・レンガ・たいまつ・たんす（ITEM_TYPES では ざいりょうの 次。作業台では かまど → たいまつ → たんすが 別々の 位置に 入る） */
export const M4_BLOCK_DEFS: ItemDefs = M4_BLOCKS;
/** 間欠泉の つち（ITEM_TYPES では 侍装備の 次） */
export const GEYSER_DEFS: ItemDefs = GEYSER;
/** 12 の国の ブロック 8 つ（ITEM_TYPES では バケツの 次） */
export const VOX_I_DEFS: ItemDefs = VOX_I;

/** みずもり・どうづき（HOUSE-1A。ITEM_TYPES では 金の 次。道具の 色分けでは 金の 道具の 次） */
export const HOUSE_TOOL_DEFS: ItemDefs = HOUSE_TOOLS;
/** 家の 新しい 家具（HOUSE-1B。数は ids.ts の HOUSE_FURNITURE_IDS。ITEM_TYPES では MINE-1B の 次。家具の 色分けは ふとんの 次） */
export const HOUSE_FURNITURE_DEFS: ItemDefs = HOUSE_FURNITURE;
/** せっけいず（HOUSE-1B。ITEM_TYPES では 新しい 家具の 次） */
export const HOUSE_PLAN_DEFS: ItemDefs = HOUSE_PLANS;

/** レジェンダリー武器（ITEM_TYPES・武器の 色分けでは これまでと 同じ 位置（crystal_katana の 次）に 入れる） */
export const LEGEND_DEFS: ItemDefs = LEGEND;

/**
 * MINE-1B（#349）: せっかいせき・しっくい・ほたるいし・きんの いし（置ける）・チョーク・いしばい。
 * ITEM_TYPES・色分けでは いちばん うしろ（家づくりの 道具の 次）。作業台・かまどの カードも いちばん うしろ（チョーク → しっくい／いしばい）
 */
export const MINE_DEFS: ItemDefs = pickDefs({ ...MINE_BLOCKS, ...MINE_ITEMS }, ['sekkaiseki', 'hotaruishi', 'kin_ore', 'shikkui', 'chalk', 'ishibai']);

/**
 * 登録された 全アイテム（置ける ブロック・道具・刀・ゆみ・防具・忍者・侍・畑・ざいりょう・小物・生き物・レジェンダリー・金。刀の集まり BLADE_ITEMS の 並びは この 順）。
 * 全件 Record なので、ItemId を 足して ここに 書き忘れる（シリーズの ファイルに 入れ忘れる）と 型エラー。
 * 同じ id が 2 つの シリーズに あると あとの 物が かつので、registry.test.ts が シリーズごとの 数の 合計と 突き合わせる。
 */
export const ITEM_DEFS: Readonly<Record<ItemDefId, ItemDef>> = {
  ...PLACEABLE, ...M4_BLOCKS, ...GEYSER, ...VOX_I,
  ...TOOLS, ...SWORDS, ...BOWS, ...ARMOR, ...NINJA, ...SAMURAI,
  ...SEEDS, ...VEGGIES, ...FARM_TOOLS, ...SPRINKLER, ...BUCKETS,
  ...ORB, ...MATERIALS, ...INGOT, ...GADGETS, ...LIVE, ...KOTATSU, ...LEGEND, ...GOLD, ...KONGO, ...HOUSE_TOOLS,
  ...MINE_BLOCKS, ...MINE_ITEMS, ...HOUSE_FURNITURE, ...HOUSE_PLANS,
};

/** 登録の 中から、ids の 順に 取り出した 登録（並びを 呼び出し側で 決めたい とき。登録に 無い id は 書きまちがいなので 投げる） */
export function pickDefs(defs: ItemDefs, ids: readonly ItemDefId[]): ItemDefs {
  const out: Partial<Record<ItemDefId, ItemDef>> = {};
  for (const id of ids) {
    const d = defs[id];
    if (!d) throw new Error(`登録表に ${id} が ない`);
    out[id] = d;
  }
  return out;
}

const BY_ID = new Map<string, ItemDef>(Object.entries(ITEM_DEFS) as Array<[string, ItemDef]>);

/** 文字列の id の 登録（アイテムに ならない ブロックの id・知らない id は undefined。id の 型が わかる なら ITEM_DEFS[id] を 直接 読む） */
export function itemDef(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}

/** 持ち物 全体で 持てる 数（おまもり = 1。制限なし = null）。ItemType には のせない（登録表だけに 持つ） */
export function maxOwnedOf(id: string): number | null {
  return BY_ID.get(id)?.maxOwned ?? null;
}

const entriesOf = (defs: ItemDefs): Array<[ItemId, ItemDef]> => Object.entries(defs) as Array<[ItemId, ItemDef]>;

/** 各アイテムから 値を 1 つ 取り出して { id: 値 } に する（値が ない アイテムは 入れない） */
function pickAll<T>(defs: ItemDefs, pick: (d: ItemDef) => T | undefined): Partial<Record<ItemId, T>> {
  const out: Partial<Record<ItemId, T>> = {};
  for (const [id, d] of entriesOf(defs)) {
    const v = pick(d);
    if (v !== undefined) out[id] = v;
  }
  return out;
}

// ---------------------------------------------------------------- 見せ方（窓口の 表に 合わせる形）。どれも 新しい コピーを 返す

/** ITEM_TYPES の 行（置けない = null） */
export function itemTypesOf(defs: ItemDefs): ItemType[] {
  return entriesOf(defs).map(([id, d]) => ({ id, name: d.name, maxStack: d.maxStack, placeBlock: d.placeBlock ?? null }));
}

/** 作り方。station の ものだけ、登録の 順に（作業台のカードの 順 = この順） */
export function recipesOf(defs: ItemDefs, station: 'craft' | 'furnace'): Recipe[] {
  const out: Recipe[] = [];
  for (const [id, d] of entriesOf(defs)) {
    const r = d.recipe;
    if (!r || (r.station ?? 'craft') !== station) continue;
    out.push({
      id,
      output: { item: id, count: r.count },
      inputs: r.inputs.map(([item, count]) => ({ item, count })),
      works: r.works ?? true,
      station,
    });
  }
  return out;
}

/** カテゴリー別の id（defs の 登録の 順。CATEGORY_ITEMS の どこに 入れるかは 呼ぶ 側が 決める） */
export function registryCategoryIds(cat: ItemCategory, defs: ItemDefs): string[] {
  return entriesOf(defs).filter(([, d]) => d.category === cat).map(([id]) => id);
}

/** 説明の行（ITEM_INFO に 合わせる） */
export function registryInfo(): Record<string, InfoRow> {
  const out: Record<string, InfoRow> = {};
  for (const [id, d] of entriesOf(ITEM_DEFS)) if (d.info) out[id] = { ...d.info, buttons: [...d.info.buttons] };
  return out;
}

/** たいきゅうの 新品の 値（W2 toolDurability） */
export function registryWear(): Partial<Record<ItemId, number>> {
  return pickAll(ITEM_DEFS, (d) => (typeof d.wear === 'number' ? d.wear : undefined));
}

/** こわれない 物（durability.ts の PERMANENT に 足す） */
export function registryPermanent(): ItemId[] {
  return entriesOf(ITEM_DEFS).filter(([, d]) => d.wear === 'permanent').map(([id]) => id);
}

/** 道具の数（TOOL_DEFAULTS の toolPower・toolLevel・weaponDamage・weaponReach・weaponTicks） */
export function registryTool(key: 'power' | 'level' | 'damage' | 'reach' | 'ticks'): Partial<Record<ItemId, number>> {
  return pickAll(ITEM_DEFS, (d) => d.tool?.[key]);
}

/** 道具の あう ブロックの なかま（dig/toolFamily.ts の TOOL_FAMILY） */
export function registryToolFamily(): Partial<Record<ItemId, ToolFamily>> {
  return pickAll(ITEM_DEFS, (d) => d.tool?.family);
}

/** じょうろ: 水の 入る 回数・いちどに まく マス数（M7 の farmCanCapacity・farmCanTiles。じょうろの 登録の 順） */
export function registryCan(key: 'capacity' | 'tiles'): Partial<Record<ItemId, number>> {
  return pickAll(ITEM_DEFS, (d) => d.can?.[key]);
}

/** たべもの: たべた ときに もどる 体力の 初期値（たまご・やいた もも にく。LIVE_SETTING_DEFAULTS の animalEggHeal・meatHeal） */
export function registryHeal(id: ItemDefId): number {
  const heal = ITEM_DEFS[id].food?.heal;
  if (heal === undefined) throw new Error(`登録表に ${id} の food が ない`);
  return heal;
}

/** 刀: 届く長さ（W2 bladeReach） */
export function registryBladeReach(): Partial<Record<ItemId, number>> {
  return pickAll(ITEM_DEFS, (d) => d.blade?.reach);
}

/** 刀: 軌跡（W2 bladeTrail） */
export function registryBladeTrail(): Partial<Record<ItemId, BladeTrailStyle>> {
  return pickAll(ITEM_DEFS, (d) => (d.blade ? { ...d.blade.trail } : undefined));
}

/** 刀の id（BLADE_ITEMS。「軌跡だけ」の 物は 入らない） */
export function registryBladeIds(): ItemId[] {
  return entriesOf(ITEM_DEFS).filter(([, d]) => d.blade !== undefined && !d.blade.trailOnly).map(([id]) => id);
}

/** 「軌跡だけ」の 物の id（なぎなた。BLADE_LIKE_ITEMS で BLADE_ITEMS の うしろに 足す） */
export function registryTrailOnlyIds(): ItemId[] {
  return entriesOf(ITEM_DEFS).filter(([, d]) => d.blade?.trailOnly).map(([id]) => id);
}

/** ゆみ: 段ごとの ダメージ（W2 bowDamageByItem） */
export function registryBowDamage(): Partial<Record<ItemId, [number, number, number]>> {
  return pickAll(ITEM_DEFS, (d) => (d.bow ? ([...d.bow.damage] as [number, number, number]) : undefined));
}

/** 防具: ふせぐ量（CraftConfig.armorValue） */
export function registryArmorValue(): Partial<Record<ItemId, Record<DamageKind, number>>> {
  return pickAll(ITEM_DEFS, (d) => (d.armor ? { ...d.armor.value } : undefined));
}

/** 防具: 入る 部位（ARMOR_SLOT_OF） */
export function registryArmorSlot(): Record<string, ArmorSlot> {
  return pickAll(ITEM_DEFS, (d) => d.armor?.slot) as Record<string, ArmorSlot>;
}

/** 防具: 説明に出す 種類（ARMOR_KIND） */
export function registryArmorKind(): Record<string, DamageKind> {
  return pickAll(ITEM_DEFS, (d) => d.armor?.kind) as Record<string, DamageKind>;
}

/** レジェンダリー: ためわざ・効果・ずっと 効く 力（LEGENDARY_DEFAULTS。登録の 順 = ドロップ表の 順）。中身は 登録表の 物を そのまま わたす ので、受け取る 側が 写して 使う */
export function registryLegend(): LegendaryDef[] {
  const out: LegendaryDef[] = [];
  for (const [id, d] of entriesOf(ITEM_DEFS)) if (d.legend) out.push({ item: id, ...d.legend });
  return out;
}
