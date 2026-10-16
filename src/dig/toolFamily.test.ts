import { describe, expect, it } from 'vitest';
import type { BlockId, ItemId } from '../contracts';
import { createToolConfig } from '../tools/config';
import { createDigConfig } from './config';
import { blockFamily, digTicksWith, toolFamily } from './toolFamily';

/**
 * BAL-D（BALANCE.md §2.8・§4.6・AC14）: ブロックのなかま・あう道具・ほる時間 72 こ。
 * 期待の数は 仕様の表（§4.6）を そのまま書き写したもの（式からは作らない）。
 */
const COLS: Array<ItemId | null> = [null, 'wood_axe', 'stone_axe', 'iron_axe', 'wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe', 'kuwa'];
const X = null; // ほれない

// 行 = [同じ数になる ブロック, すで, きの おの, いしの おの, てつの おの, きの つるはし, いしの つるはし, てつの つるはし, くわ]
const ROWS: Array<[BlockId[], Array<number | null>]> = [
  [['log', 'tansu'], [300, 150, 75, 50, 300, 150, 100, 150]],
  [['leaves'], [15, 8, 4, 3, 15, 8, 5, 8]],
  [['saku'], [60, 30, 15, 10, 60, 30, 20, 30]],
  [['stone', 'furnace', 'brick'], [360, 360, 180, 120, 180, 90, 60, 180]],
  [['coal_ore'], [600, 600, 300, 200, 300, 150, 100, 300]],
  [['iron_ore'], [X, X, X, X, X, 225, 150, X]],
  [['kawara'], [240, 240, 120, 80, 120, 60, 40, 120]],
  [['sprinkler'], [180, 180, 90, 60, 90, 45, 30, 90]],
  [['grass', 'dirt', 'sand', 'farmland', 'farmland_wet'], [30, 30, 15, 10, 30, 15, 10, 8]],
];

describe('BAL-D ほる時間（AC14）', () => {
  const dig = createDigConfig();
  const tools = createToolConfig();
  it('9 行 × 8 列 = 72 こ（ほれない 6 こ を ふくむ）が 仕様の表と同じ。同じ行の ブロックも同じ数', () => {
    let n = 0;
    let blocked = 0;
    for (const [blocks, nums] of ROWS) {
      expect(nums).toHaveLength(8);
      for (const b of blocks) {
        for (let c = 0; c < COLS.length; c++) {
          const got = digTicksWith(dig, tools, b, COLS[c]);
          expect(got, `${b} × ${COLS[c] ?? 'すで'}`).toBe(nums[c]);
        }
      }
      for (const v of nums) {
        n++;
        if (v === null) blocked++;
      }
    }
    expect(n).toBe(72);
    expect(blocked).toBe(6);
  });
  it('たいまつ など どのなかまでもない物・こわれない物', () => {
    expect(digTicksWith(dig, tools, 'torch', null)).toBe(3);
    expect(digTicksWith(dig, tools, 'bedrock', 'iron_pickaxe')).toBeNull();
    expect(digTicksWith(dig, tools, 'air', null)).toBeNull();
  });
  it('刀・ゆみ・ほかの物 は すで と同じ（どのブロックでも）', () => {
    for (const item of ['bokuto', 'katana', 'yumi', 'torch', 'tansu'] as ItemId[]) {
      for (const b of ['log', 'stone', 'dirt'] as BlockId[]) {
        expect(digTicksWith(dig, tools, b, item), `${item}/${b}`).toBe(digTicksWith(dig, tools, b, null));
      }
    }
  });
});

describe('BAL-D ブロックのなかま（§2.8）', () => {
  it('き・いし・つち の ブロック', () => {
    const fam: Record<string, BlockId[]> = {
      log: ['log', 'leaves', 'saku', 'tansu'],
      stone: ['stone', 'coal_ore', 'iron_ore', 'furnace', 'kawara', 'brick', 'sprinkler'],
      dirt: ['grass', 'dirt', 'sand', 'farmland', 'farmland_wet'],
    };
    for (const [f, blocks] of Object.entries(fam)) for (const b of blocks) expect(blockFamily(b), b).toBe(f);
    expect(blockFamily('torch')).toBeNull();
    expect(blockFamily('air')).toBeNull();
  });
  it('あう道具: おの = き・つるはし = いし・くわ = つち。ほかは なし', () => {
    for (const i of ['wood_axe', 'stone_axe', 'iron_axe'] as ItemId[]) expect(toolFamily(i)).toBe('log');
    for (const i of ['wood_pickaxe', 'stone_pickaxe', 'iron_pickaxe'] as ItemId[]) expect(toolFamily(i)).toBe('stone');
    expect(toolFamily('kuwa')).toBe('dirt');
    expect(toolFamily('katana')).toBeNull();
    expect(toolFamily(null)).toBeNull();
  });
  it('おの・くわ の 強さ・ほれるレベル（くわ に 強さ 4）', () => {
    const tools = createToolConfig();
    expect(tools.toolPower).toMatchObject({ wood_axe: 2, stone_axe: 4, iron_axe: 6, kuwa: 4 });
    expect(tools.toolLevel.wood_axe ?? 0).toBe(0);
    expect(tools.toolLevel.iron_axe ?? 0).toBe(0);
    expect(tools.toolLevel.kuwa ?? 0).toBe(0);
  });
});
