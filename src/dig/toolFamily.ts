import type { BlockId, ItemId } from '../contracts';
import { ITEM_DEFS, registryToolFamily } from '../content/items/registry';
import type { ToolConfig } from '../tools/config';
import type { DigConfig } from './config';

/**
 * 道具の使い分け（BALANCE.md §2.8。#77）。ブロックの「なかま」と、なかまごとの「あう道具」。
 * あう道具は 今の強さで、あわない道具は 半分（すで の 強さより下には しない）。
 */
export type ToolFamily = 'log' | 'stone' | 'dirt';

/**
 * てつの つるはしの 掘れる 段階（登録表 `iron_pickaxe` の tool.level が 元。MINE-1B）。これ 以上の ブロック（きん・すいしょう・ダイヤの いし）は
 * 弱い 道具だと「てつの つるはし が いるよ」。掘れる 段階の いちばん 上は てつの つるはし。
 */
export const IRON_HARVEST_LEVEL: number = (() => {
  const level = ITEM_DEFS.iron_pickaxe.tool?.level;
  if (level === undefined) throw new Error('登録表の iron_pickaxe に tool.level が ない');
  return level;
})();

const BLOCK_FAMILY: Partial<Record<BlockId, ToolFamily>> = {
  // き（あう道具: おの）
  log: 'log',
  leaves: 'log',
  momiji_leaves: 'log',
  matsu_leaves: 'log',
  bamboo: 'log',
  saku: 'log',
  tansu: 'log',
  // いし（あう道具: つるはし）
  stone: 'stone',
  coal_ore: 'stone',
  iron_ore: 'stone',
  furnace: 'stone',
  kawara: 'stone',
  brick: 'stone',
  sprinkler: 'stone',
  // MINE-1B（#349）: せっかいせき・しっくい・ほたるいし・きんの いし・すいしょうの いし・ダイヤの いし
  sekkaiseki: 'stone',
  shikkui: 'stone',
  hotaruishi: 'stone',
  kin_ore: 'stone',
  suisho_ore: 'stone',
  diamond_ore: 'stone',
  // つち（あう道具: くわ）
  grass: 'dirt',
  dirt: 'dirt',
  sand: 'dirt',
  snow: 'dirt',
  farmland: 'dirt',
  farmland_wet: 'dirt',
  geyser_dirt: 'dirt',
  nendo: 'dirt', // MINE-1B: ねんどは つちの なかま（くわが あう）
};

// おの・つるはし・くわの なかまは 登録表（content/items/tools.ts・farm.ts の tool.family）から
const TOOL_FAMILY: Partial<Record<ItemId, ToolFamily>> = registryToolFamily();

/** ブロックのなかま（どれでもない物は null） */
export function blockFamily(id: BlockId): ToolFamily | null {
  return BLOCK_FAMILY[id] ?? null;
}

/** 道具の あうなかま（おの・つるはし・くわ 以外は null） */
export function toolFamily(item: ItemId | null): ToolFamily | null {
  return item ? (TOOL_FAMILY[item] ?? null) : null;
}

/**
 * このブロックを ほるときの 強さ。あう道具は power、あわない道具は 半分（handPower より下にしない）。
 * なかまを持たない物（刀・ゆみ・すで・ほかの物）は power のまま（power は もともと handPower）。
 */
export function effectivePower(item: ItemId | null, power: number, block: BlockId, handPower: number): number {
  const tf = toolFamily(item);
  if (tf === null || blockFamily(block) === tf) return power;
  return Math.max(handPower, power / 2);
}

/** ほる時間（ステップ。60 = 1 秒）。ほれない（こわれない・レベルが足りない）なら null。§4.6 の表と同じ */
export function digTicksWith(cfg: DigConfig, tools: ToolConfig, block: BlockId, item: ItemId | null): number | null {
  const h = cfg.hardness[block];
  if (h === null || h === undefined) return null;
  const level = item && tools.toolLevel[item] !== undefined ? tools.toolLevel[item]! : cfg.handLevel;
  if ((cfg.harvestLevel[block] ?? 0) > level) return null;
  const power = (item && tools.toolPower[item]) || cfg.handPower;
  const p = effectivePower(item, power, block, cfg.handPower);
  return Math.max(1, Math.ceil((h * 60) / p - 1e-9));
}

/** ヒントで「いちばん強い物」を えらぶための 順（き・くわ < いし < てつ。強さ P と同じ順） */
export function toolRank(item: ItemId | undefined): number {
  if (!item) return 0;
  if (item.startsWith('iron_')) return 3;
  if (item.startsWith('stone_')) return 2;
  return 1;
}
