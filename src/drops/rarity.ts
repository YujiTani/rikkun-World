import type { ItemId, Rarity } from '../contracts';
import { DIG_DEFAULTS } from '../dig/config';

/**
 * アイテムのめずらしさ（光の柱の色がこれできまる）。
 * ブロックは ほる設定（`src/dig/config.ts` の rarity）と同じ値。
 * アイテムを足すときは、ここに めずらしさを必ず書く。
 */
const ITEM_ONLY_RARITY: Record<string, Rarity> = {
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
};

export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'superRare'];

export function itemRarity(item: ItemId): Rarity {
  return ITEM_ONLY_RARITY[item] ?? (DIG_DEFAULTS.rarity as Record<string, Rarity>)[item] ?? 'common';
}

/** なかでいちばんめずらしいもの */
export function topRarity(items: readonly ItemId[]): Rarity {
  let best = 0;
  for (const it of items) best = Math.max(best, RARITY_ORDER.indexOf(itemRarity(it)));
  return RARITY_ORDER[best]!;
}

/** 光の柱の色: 白・みどり・あお・むらさき */
export const RARITY_COLOR: Record<Rarity, number> = {
  common: 0xffffff,
  uncommon: 0x8fe08f,
  rare: 0x7fb8ff,
  superRare: 0xc79bff,
};

export function isKnownItemRarity(item: ItemId): boolean {
  return item in ITEM_ONLY_RARITY || item in DIG_DEFAULTS.rarity;
}
