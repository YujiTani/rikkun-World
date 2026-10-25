import type { ItemId } from '../contracts';
import { registryTool } from '../content/items/registry';

/**
 * 道具・武器の数値（M4 §4.3・§4.5）。ここ 1 か所にまとめる。
 * 名前は仕様の「設定の名前」と同じ。すでの値（handPower など）は dig / combat の設定を使う。
 */
export interface ToolConfig {
  /** ほる強さ（書かないものは handPower） */
  toolPower: Partial<Record<ItemId, number>>;
  /** ほれるレベル（書かないものは handLevel） */
  toolLevel: Partial<Record<ItemId, number>>;
  /** たたく強さ（書かないものは punchDamage） */
  weaponDamage: Partial<Record<ItemId, number>>;
  /** とどく距離（書かないものは punchReach） */
  weaponReach: Partial<Record<ItemId, number>>;
  /** 当たるまでのステップ（書かないものは punchTicks） */
  weaponTicks: Partial<Record<ItemId, number>>;
  /** なぎなた: これだけふらなかったら次は「つく」から */
  naginataComboReset: number;
  /**
   * @deprecated WEAPON-2: ゆみ は `W2Settings`（`bowDamage`・`bowSpeed` など）に うつった。
   * ToolSystem は もう 読まない。説明の 表（craft/info）と main.ts が 直るまで 残す。
   */
  arrowDamage: number;
  /** @deprecated 同上（段 3・45° の 目安 39 に かわる） */
  arrowRange: number;
}

export const TOOL_DEFAULTS: Readonly<ToolConfig> = {
  // つるはし・おの・刀・なぎなた・きんの 道具・くわ（M7）の 強さ（GOLD-1 §4.3）は 登録表（content/items/tools.ts・weapons.ts・farm.ts・gold.ts）から
  toolPower: registryTool('power'),
  toolLevel: registryTool('level'),
  weaponDamage: registryTool('damage'),
  weaponReach: registryTool('reach'),
  weaponTicks: registryTool('ticks'),
  naginataComboReset: 60,
  arrowDamage: 2,
  arrowRange: 24,
};

export function createToolConfig(): ToolConfig {
  return {
    ...TOOL_DEFAULTS,
    toolPower: { ...TOOL_DEFAULTS.toolPower },
    toolLevel: { ...TOOL_DEFAULTS.toolLevel },
    weaponDamage: { ...TOOL_DEFAULTS.weaponDamage },
    weaponReach: { ...TOOL_DEFAULTS.weaponReach },
    weaponTicks: { ...TOOL_DEFAULTS.weaponTicks },
  };
}

/** 1 秒あたりのステップ数 */
export const STEPS_PER_SECOND = 60;
