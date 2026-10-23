import type { ArmorSlot, BlockId, DamageKind, ItemId } from '../contracts';

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
  armorValue: {
    kabuto: { normal: 0, ball: 2, fall: 0 },
    yoroi: { normal: 2, ball: 0, fall: 0 },
    kote: { normal: 1, ball: 0, fall: 0 },
    suneate: { normal: 0, ball: 0, fall: 2 },
    // GOLD-1 §4.3: てつ より 1 多く ふせぐ（てつ で 0 の 種類 は 0 の まま）
    kin_kabuto: { normal: 0, ball: 3, fall: 0 },
    kin_yoroi: { normal: 3, ball: 0, fall: 0 },
    kin_kote: { normal: 2, ball: 0, fall: 0 },
    kin_suneate: { normal: 0, ball: 0, fall: 3 },
  },
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

/** そうびのマスに入れられるアイテム */
export const ARMOR_SLOT_OF: Readonly<Record<string, ArmorSlot>> = {
  kabuto: 'head',
  yoroi: 'body',
  kote: 'arms',
  suneate: 'legs',
  // GOLD-1: てつ と 同じ マス
  kin_kabuto: 'head',
  kin_yoroi: 'body',
  kin_kote: 'arms',
  kin_suneate: 'legs',
};

/** そうびの部位の順（画面・保存・落とす順） */
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['head', 'body', 'arms', 'legs'];
