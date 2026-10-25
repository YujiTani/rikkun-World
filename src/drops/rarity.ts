import type { ItemId, Rarity } from '../contracts';
import { registryRarity, withRegistry } from '../content/items/registry';
import { DIG_DEFAULTS } from '../dig/config';
import { ITEM_TYPES } from '../inventory/items';
import { RARITY_ORDER, rarityIndex } from './rarityTable';

export { RARITY_COLOR, RARITY_ORDER, RARITY_TIERS, defaultDropMax, isRarity, rarityIndex, rarityTier, type RarityTier } from './rarityTable';

/**
 * アイテムのめずらしさ（光の柱の色がこれできまる）。
 * ブロックは ほる設定（`src/dig/config.ts` の rarity）と同じ値。
 * アイテムを足すときは、ここに めずらしさを必ず書く（登録表 content/items/ に うつした シリーズは そちらに 書く）。
 */
const OLD_ITEM_ONLY_RARITY: Record<string, Rarity> = {
  yokai_orb: 'uncommon',
  paper: 'common',
  string: 'common',
  cloth: 'common',
  oil: 'uncommon',
  clay: 'uncommon',
  crystal: 'superRare',
  // M4（docs/design/M4-craft.md §4.4）。かまど・かわら・レンガは ほる設定（DIG_DEFAULTS.rarity）にある
  wood_pickaxe: 'common',
  stone_pickaxe: 'common',
  iron_pickaxe: 'rare',
  wood_axe: 'common',
  stone_axe: 'common',
  iron_axe: 'rare',
  iron_ingot: 'rare',
  bokuto: 'common',
  katana: 'rare',
  naginata: 'rare',
  crystal_katana: 'superRare',
  yumi: 'uncommon',
  ya: 'common',
  kabuto: 'rare',
  yoroi: 'rare',
  kote: 'rare',
  suneate: 'rare',
  torch: 'common',
  lantern: 'uncommon',
  kite: 'uncommon',
  futon: 'uncommon',
  omamori: 'superRare',
  waraji: 'common',
  haniwa: 'uncommon',
  // M7
  seed_onion: 'common',
  seed_tomato: 'common',
  seed_pumpkin: 'common',
  seed_eggplant: 'common',
  onion: 'common',
  tomato: 'common',
  pumpkin: 'common',
  eggplant: 'common',
  kuwa: 'common',
  // M7-2（スプリンクラー は ほる設定 DIG_DEFAULTS.rarity にある）
  watering_can: 'common',
  long_watering_can: 'uncommon',
  sprinkler: 'uncommon',
  // LIVE-1
  egg: 'common',
  mushi: 'common',
  mushi_ami: 'common',
  // LIVE-2（§4.2）。こたつ は たんす・かまど と 同じ 段、きん の たまご は 7 段中 5 つ目（ほし 5・RARITY-7）
  nukunuku: 'uncommon',
  toriya: 'uncommon',
  kin_tamago: 'epic',
  momo_nama: 'common', // LIVE-3 仮
  momo_yaki: 'common',
  // BUCKET-1
  bucket: 'common',
  water_bucket: 'common',
};
// 登録表に うつした シリーズ（忍者・侍・金 …）の めずらしさは content/items/ から
const ITEM_ONLY_RARITY: Record<string, Rarity> = withRegistry('ITEM_ONLY_RARITY', OLD_ITEM_ONLY_RARITY, registryRarity());

/** 今の当てはめ（設定 itemRarity。ゲームに 1 つ。全アイテム → Rarity） */
function initialItemRarity(): Record<string, Rarity> {
  const out: Record<string, Rarity> = {};
  for (const t of ITEM_TYPES) out[t.id] = ITEM_ONLY_RARITY[t.id] ?? (DIG_DEFAULTS.rarity as Record<string, Rarity>)[t.id] ?? 'common';
  return out;
}
const current: Record<string, Rarity> = initialItemRarity();

/** `createSettingsHook` にわたす設定の入れ物（名前 itemRarity） */
export const ITEM_RARITY_SETTINGS: { itemRarity: Record<string, Rarity> } = { itemRarity: current };

/** 設定 itemRarity を初期値にもどす（テスト用） */
export function resetItemRarity(): void {
  Object.assign(current, initialItemRarity());
}

export function itemRarity(item: ItemId): Rarity {
  return current[item] ?? ITEM_ONLY_RARITY[item] ?? (DIG_DEFAULTS.rarity as Record<string, Rarity>)[item] ?? 'common';
}

/** item が tier 以上にめずらしいか（#69・#70 用） */
export function rarityAtLeast(item: ItemId, tier: Rarity): boolean {
  return rarityIndex(itemRarity(item)) >= rarityIndex(tier);
}

/** なかでいちばんめずらしいもの */
export function topRarity(items: readonly ItemId[]): Rarity {
  let best = 0;
  for (const it of items) best = Math.max(best, rarityIndex(itemRarity(it)));
  return RARITY_ORDER[best]!;
}

export function isKnownItemRarity(item: ItemId): boolean {
  return item in ITEM_ONLY_RARITY || item in DIG_DEFAULTS.rarity;
}
