import type { BlockId, ItemId } from '../contracts';
import type { ToolConfig } from '../tools/config';
import type { DigConfig } from './config';

/**
 * 道具の使い分け（BALANCE.md §2.8。#77）。ブロックの「なかま」と、なかまごとの「あう道具」。
 * あう道具は 今の強さで、あわない道具は 半分（すで の 強さより下には しない）。
 */
export type ToolFamily = 'log' | 'stone' | 'dirt';

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
  // つち（あう道具: くわ）
  grass: 'dirt',
  dirt: 'dirt',
  sand: 'dirt',
  snow: 'dirt',
  farmland: 'dirt',
  farmland_wet: 'dirt',
  geyser_dirt: 'dirt',
};

const TOOL_FAMILY: Partial<Record<ItemId, ToolFamily>> = {
  wood_axe: 'log',
  stone_axe: 'log',
  iron_axe: 'log',
  wood_pickaxe: 'stone',
  stone_pickaxe: 'stone',
  iron_pickaxe: 'stone',
  kuwa: 'dirt',
};

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
