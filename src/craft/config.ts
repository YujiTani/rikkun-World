import type { BlockId, ItemId } from '../contracts';

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
  /** 防具のふせぐ力 */
  armorValue: Partial<Record<ItemId, number>>;
  /** 拾ったログが消えるまで */
  pickupLogTicks: number;
  /** 拾ったログの行の上限 */
  pickupLogMax: number;
}

export const CRAFT_DEFAULTS: Readonly<CraftConfig> = {
  bakeTicks: 60,
  bakeQueueMax: 8,
  fuelOrder: ['coal_ore', 'oil', 'log'],
  fixedDrop: { furnace: 1, kawara: 1, brick: 1 },
  armorValue: { kabuto: 1, yoroi: 2 },
  pickupLogTicks: 180,
  pickupLogMax: 5,
};

export function createCraftConfig(): CraftConfig {
  return {
    ...CRAFT_DEFAULTS,
    fuelOrder: [...CRAFT_DEFAULTS.fuelOrder],
    fixedDrop: { ...CRAFT_DEFAULTS.fixedDrop },
    armorValue: { ...CRAFT_DEFAULTS.armorValue },
  };
}

/** そうびのマスに入れられるアイテム */
export const ARMOR_SLOT_OF: Readonly<Record<string, 'head' | 'body'>> = { kabuto: 'head', yoroi: 'body' };
