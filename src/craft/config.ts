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
    // #293 試作: 忍者の足袋。落下は どれだけ 高くても 0（fall は 99 = ぜんぶ ふせぐ）。ほかは すねあてと 同じ
    ninja_tabi: { normal: 0, ball: 0, fall: 99 },
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

/**
 * 忍者装備（#293 試作。yuzu: 一式が ある ことに する）。今は 足袋だけ。
 * あたま・からだ・うでは 名前も 効き目も まだ 決まって いない（決まったら ここに 足し、ARMOR_SLOT_OF・armorValue・ITEM_TYPES・rarity にも 同じ id を 足す）。
 */
export const NINJA_GEAR = { legs: 'ninja_tabi' } as const satisfies Partial<Record<ArmorSlot, string>>;

/** そうびのマスに入れられるアイテム */
export const ARMOR_SLOT_OF: Readonly<Record<string, ArmorSlot>> = { kabuto: 'head', yoroi: 'body', kote: 'arms', suneate: 'legs', ninja_tabi: 'legs' };

/** そうびの部位の順（画面・保存・落とす順） */
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['head', 'body', 'arms', 'legs'];
