import type { ArmorSlot, BladeTrailStyle, DamageKind, ItemId, ItemType, Rarity, Recipe } from '../../contracts';
import type { InfoRow } from '../../craft/info/table';
import type { ItemCategory } from '../../ui/itemCategory';
import { GOLD } from './gold';
import { NINJA } from './ninja';
import { SAMURAI } from './samurai';
import type { ItemDef } from './types';

/**
 * アイテムの登録表（#306・ルール #304「1 つのデータは 1 か所」）。
 * シリーズごとの定義（gold.ts …）を ならべ、古い表（ITEM_TYPES・ITEM_INFO・TOOL_DEFAULTS…）が
 * 「古い表 ＋ 登録表から作った分」を 合わせて 読めるように 「見せ方」の 関数を 出す。
 * 実行時に contracts.ts を import しない（import の輪を 作らない）。型だけを読む。
 *
 * 新しい金を足すとき: ids.ts に id → gold.ts に値 → ui/itemArtGold.ts に絵（Record<GoldId> なので 書き忘れは 型エラー）。
 * 忍者・侍も 同じ（ninja.ts・samurai.ts。絵は ui/itemArtNinja.ts・itemArtSamurai.ts）。
 * のこりのシリーズは 段階 3 で 1 本ずつ ここへ うつす（全部 うまったら ITEM_DEFS を 全件 Record に する）。
 */
export type ItemDefs = Readonly<Partial<Record<ItemId, ItemDef>>>;

/** シリーズごとの定義（ITEM_TYPES・作業台のカードの 順は シリーズの 位置で 決まるので、シリーズ単位でも 出す） */
export const GOLD_DEFS: ItemDefs = GOLD;
/** 忍者・侍（ITEM_TYPES では 古い表の 同じ 位置（すねあての 次）に 入れる） */
export const NINJA_SAMURAI_DEFS: ItemDefs = { ...NINJA, ...SAMURAI };

/** 登録された 全アイテム（忍者・侍・金。カテゴリーの 中の 並びは この順） */
export const ITEM_DEFS: ItemDefs = { ...NINJA_SAMURAI_DEFS, ...GOLD_DEFS };

/**
 * うつしかえの 途中で、同じ id を 古い表と 登録表の 両方に 書いてしまった所の 一覧（"表の名前:id"）。
 * 空で なければ registry.test.ts が 落ちる（片方を 消す）。
 * 移しかえの 途中だけ 要る（段階 3 で 全シリーズが 登録表に 入り、古い表が 無くなったら withRegistry・noteDuplicates ごと 外す）。
 */
export const REGISTRY_OVERLAPS: string[] = [];

/** 古い表 ＋ 登録表から 作った分 を 合わせる（古い表と 登録表に 同じ id が あれば REGISTRY_OVERLAPS に 記録） */
export function withRegistry<T extends object, R extends object>(table: string, old: T, fromRegistry: R): T & R {
  for (const id of Object.keys(fromRegistry)) if (id in old) REGISTRY_OVERLAPS.push(`${table}:${id}`);
  return { ...old, ...fromRegistry };
}

/** 並びの 中で 同じ id が 2 回 出たら REGISTRY_OVERLAPS に 記録（古い配列 ＋ 登録表の 分を つないだ 並びを わたす） */
export function noteDuplicates(table: string, ids: Iterable<string>): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) REGISTRY_OVERLAPS.push(`${table}:${id}`);
    seen.add(id);
  }
}

const BY_ID = new Map<string, ItemDef>(Object.entries(ITEM_DEFS) as Array<[string, ItemDef]>);

/** id の 登録（まだ うつしていない アイテムは undefined） */
export function itemDef(id: string): ItemDef | undefined {
  return BY_ID.get(id);
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

// ---------------------------------------------------------------- 見せ方（古い表に 合わせる形）。どれも 新しい コピーを 返す

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

/** めずらしさ（ITEM_ONLY_RARITY に 合わせる） */
export function registryRarity(): Record<string, Rarity> {
  return pickAll(ITEM_DEFS, (d) => d.rarity) as Record<string, Rarity>;
}

/** カテゴリー別の id（CATEGORY_ITEMS の うしろに 足す） */
export function registryCategoryIds(cat: ItemCategory): string[] {
  return entriesOf(ITEM_DEFS).filter(([, d]) => d.category === cat).map(([id]) => id);
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

/** 道具の数（TOOL_DEFAULTS の toolPower・toolLevel・weaponDamage） */
export function registryTool(key: 'power' | 'level' | 'damage'): Partial<Record<ItemId, number>> {
  return pickAll(ITEM_DEFS, (d) => d.tool?.[key]);
}

/** 刀: 届く長さ（W2 bladeReach） */
export function registryBladeReach(): Partial<Record<ItemId, number>> {
  return pickAll(ITEM_DEFS, (d) => d.blade?.reach);
}

/** 刀: 軌跡（W2 bladeTrail） */
export function registryBladeTrail(): Partial<Record<ItemId, BladeTrailStyle>> {
  return pickAll(ITEM_DEFS, (d) => (d.blade ? { ...d.blade.trail } : undefined));
}

/** 刀の id（BLADE_ITEMS に 足す） */
export function registryBladeIds(): ItemId[] {
  return entriesOf(ITEM_DEFS).filter(([, d]) => d.blade !== undefined).map(([id]) => id);
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
