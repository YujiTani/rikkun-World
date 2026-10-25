import type { ArmorSlot, BlockId, DamageKind, ItemId } from '../contracts';
import type { NinjaId, SamuraiId } from '../content/items/ids';
import { registryArmorSlot, registryArmorValue, withRegistry } from '../content/items/registry';

/**
 * つくる・やく・防具・拾ったログの数値（M4 §4.5）。ここ 1 か所にまとめる。
 * 名前は仕様の「設定の名前」と同じ（`settings.*` へはつなぎ込みで出す）。
 */
export interface CraftConfig {
  /** 1 こ焼く時間（ステップ） */
  bakeTicks: number;
  /** 1 つの かまど の じゅんばん の上限 */
  bakeQueueMax: number;
  /** ねんりょうの使う順 */
  fuelOrder: ItemId[];
  /** こわすと必ず決まった数になるブロック（書かないブロックは M2 のランダム） */
  fixedDrop: Partial<Record<BlockId, number>>;
  /** 防具のへらす量（ダメージの種類ごと。受けるダメージ − へらす量。normal / ball は最低 1、fall は 0 まで） */
  armorValue: Partial<Record<ItemId, Record<DamageKind, number>>>;
  /** 拾ったログが消えるまで */
  pickupLogTicks: number;
  /** 拾ったログの行の上限 */
  pickupLogMax: number;
}

export const CRAFT_DEFAULTS: Readonly<CraftConfig> = {
  bakeTicks: 60,
  bakeQueueMax: 8,
  fuelOrder: ['coal_ore', 'oil', 'log'],
  fixedDrop: { furnace: 1, kawara: 1, brick: 1, tansu: 1, nukunuku: 1 },
  armorValue: withRegistry('armorValue', {
    kabuto: { normal: 0, ball: 2, fall: 0 },
    yoroi: { normal: 2, ball: 0, fall: 0 },
    kote: { normal: 1, ball: 0, fall: 0 },
    suneate: { normal: 0, ball: 0, fall: 2 },
    // 忍者・侍・金（GOLD-1 §4.3）の 防具は 登録表（content/items/ninja.ts・samurai.ts・gold.ts）から
  }, registryArmorValue()),
  pickupLogTicks: 180,
  pickupLogMax: 5,
};

export function createCraftConfig(): CraftConfig {
  return {
    ...CRAFT_DEFAULTS,
    fuelOrder: [...CRAFT_DEFAULTS.fuelOrder],
    fixedDrop: { ...CRAFT_DEFAULTS.fixedDrop },
    armorValue: Object.fromEntries(Object.entries(CRAFT_DEFAULTS.armorValue).map(([k, v]) => [k, { ...v! }])),
  };
}

/** 忍者装備（NINJA-1 #299）。4 マス 1 つずつ。値は 登録表（content/items/ninja.ts）・数は ninjaTuning.ts。部位は 登録表の armor.slot と そろう（registry.test.ts が 確かめる） */
export const NINJA_GEAR = { head: 'ninja_zukin', body: 'ninja_shozoku', arms: 'ninja_tekko', legs: 'ninja_tabi' } as const satisfies Record<ArmorSlot, NinjaId>;

/** 侍装備（SAMURAI-1 #300）。4 マス 1 つずつ。値は 登録表（content/items/samurai.ts）・数は ninjaTuning.ts。部位は 登録表の armor.slot と そろう（registry.test.ts が 確かめる） */
export const SAMURAI_GEAR = { head: 'samurai_jingasa', body: 'samurai_haori', arms: 'samurai_tekko', legs: 'samurai_geta' } as const satisfies Record<ArmorSlot, SamuraiId>;

/** そうびのマスに入れられるアイテム */
export const ARMOR_SLOT_OF: Readonly<Record<string, ArmorSlot>> = withRegistry('ARMOR_SLOT_OF', {
  kabuto: 'head',
  yoroi: 'body',
  kote: 'arms',
  suneate: 'legs',
}, registryArmorSlot()); // 忍者・侍・金の 防具は 登録表（content/items/）から

/** そうびの部位の順（画面・保存・落とす順） */
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['head', 'body', 'arms', 'legs'];
