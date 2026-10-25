import type { ArmorSlot, BlockId, DamageKind, ItemId } from '../contracts';
import { NINJA_TUNING } from './ninjaTuning';

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
    // NINJA-1 §4.1: 忍者装備。数は ninjaTuning.ts の 表（頭巾 ball・装束 normal・手甲 normal は てつの かぶと・よろい・こてと 同じ）。足袋の fall は どんな 落下より 大きい 数 = ぜんぶ ふせぐ
    ninja_zukin: { normal: 0, ball: NINJA_TUNING.zukinBallCut, fall: 0 },
    ninja_shozoku: { normal: NINJA_TUNING.shozokuNormalCut, ball: 0, fall: 0 },
    ninja_tekko: { normal: NINJA_TUNING.tekkoNormalCut, ball: 0, fall: 0 },
    ninja_tabi: { normal: 0, ball: 0, fall: NINJA_TUNING.tabiFallCut },
    // SAMURAI-1 §4.1: 侍装備。陣笠 ball・羽織 normal・下駄 fall は てつの かぶと・よろい・すねあてと 同じ、手甲 normal 1 は てつの こてと 同じ（数は ninjaTuning.ts の 表）
    samurai_jingasa: { normal: 0, ball: NINJA_TUNING.jingasaBallCut, fall: 0 },
    samurai_haori: { normal: NINJA_TUNING.haoriNormalCut, ball: 0, fall: 0 },
    samurai_tekko: { normal: NINJA_TUNING.samuraiTekkoNormalCut, ball: 0, fall: 0 },
    samurai_geta: { normal: 0, ball: 0, fall: NINJA_TUNING.getaFallCut },
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

/** 忍者装備（NINJA-1 #299）。4 マス 1 つずつ。数は ninjaTuning.ts */
export const NINJA_GEAR = { head: 'ninja_zukin', body: 'ninja_shozoku', arms: 'ninja_tekko', legs: 'ninja_tabi' } as const satisfies Record<ArmorSlot, string>;

/** 侍装備（SAMURAI-1 #300）。4 マス 1 つずつ。数は ninjaTuning.ts */
export const SAMURAI_GEAR = { head: 'samurai_jingasa', body: 'samurai_haori', arms: 'samurai_tekko', legs: 'samurai_geta' } as const satisfies Record<ArmorSlot, string>;

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
  // 忍者装備（NINJA-1）
  ninja_zukin: 'head',
  ninja_shozoku: 'body',
  ninja_tekko: 'arms',
  ninja_tabi: 'legs',
  // 侍装備（SAMURAI-1）
  samurai_jingasa: 'head',
  samurai_haori: 'body',
  samurai_tekko: 'arms',
  samurai_geta: 'legs',
};

/** そうびの部位の順（画面・保存・落とす順） */
export const ARMOR_SLOTS: readonly ArmorSlot[] = ['head', 'body', 'arms', 'legs'];
