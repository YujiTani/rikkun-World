import { describe, expect, it } from 'vitest';
import { ITEM_DEFS } from '../content/items/registry';
import { DUG_ALWAYS_ONE } from './config';
import { BLOCK_TYPES } from '../world/blocks/blockTypes';
import { KOTATSU_CELLS } from '../world/blocks/kotatsu';
import { DUG_ITEM, dropBlockOf, dugItemOf } from './dugItems';

/** MINE-1B: 「ほると 別の アイテムに なる ブロック」の 組みは アイテムの `dugFrom` が 元（1 か所）。ほる 側（DUG_ITEM）は そこから 作る */
describe('DUG_ITEM（ブロック → ほると 出る アイテム）', () => {
  const pairs = Object.entries(ITEM_DEFS)
    .filter(([, d]) => d.dugFrom !== undefined)
    .map(([item, d]) => [d.dugFrom!, item] as const);

  it('dugFrom を 持つ 全アイテムが 組みに 入る（ねんど・すいしょう・ダイヤ）', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    for (const [block, item] of pairs) expect(DUG_ITEM.get(block), `${block} を ほる`).toBe(item);
    expect(DUG_ITEM.size).toBe(pairs.length);
  });

  it('同じ ブロックを 2 つの アイテムが 取りあわない', () => {
    expect(new Set(pairs.map(([block]) => block)).size).toBe(pairs.length);
  });

  it('いつも 1 こ の ブロックは ぜんぶ 組みの 中に ある', () => {
    expect(DUG_ALWAYS_ONE.size).toBeGreaterThan(0);
    for (const block of DUG_ALWAYS_ONE) expect(DUG_ITEM.has(block), block).toBe(true);
  });
});

/** ほる 側〔BlockBreaker〕と 窓口 house.blockAt が 同じ 答えを 使う（HOUSE-1C） */
describe('dugItemOf（ブロック → ほると 手に 入る アイテム）', () => {
  it('家の もの〔向き・マス・戸の 半分・あけしめ ちがい〕は もとの アイテム。こたつ・ふとんは 1 つの アイテム', () => {
    expect(dugItemOf('house_door_open_top')).toBe('house_door');
    expect(dugItemOf('house_door_top')).toBe('house_door');
    expect(dugItemOf('tansu_n')).toBe('tansu');
    expect(dugItemOf('furnace_w')).toBe('furnace');
    expect(dugItemOf('long_table_3_e')).toBe('long_table');
    expect(dugItemOf('house_wall')).toBe('house_wall');
    expect(dugItemOf('futon_foot_s')).toBe('futon');
    for (const c of KOTATSU_CELLS) expect(dugItemOf(c.block), c.block).toBe('nukunuku');
  });

  it('持てない ブロック〔ねんど・すいしょう・ダイヤ〕は DUG_ITEM、ふつうは そのまま。どの ブロックでも 答えが ある', () => {
    for (const [block, item] of DUG_ITEM) expect(dugItemOf(block), block).toBe(item);
    expect(dugItemOf('stone')).toBe('stone');
    for (const t of BLOCK_TYPES) expect(typeof dugItemOf(t.id), t.id).toBe('string');
    expect(dropBlockOf('table_2_w')).toBe('table');
  });
});

import { createDigConfig } from './config';
import { IRON_HARVEST_LEVEL } from './toolFamily';

describe('IRON_HARVEST_LEVEL（てつの つるはしの 掘れる 段階）', () => {
  it('登録表の てつの つるはしの レベル と 同じ（2 の 写しを 持たない）。きん・すいしょう・ダイヤの いしは この 段階', () => {
    expect(IRON_HARVEST_LEVEL).toBe(ITEM_DEFS.iron_pickaxe.tool?.level);
    const cfg = createDigConfig();
    for (const id of ['kin_ore', 'suisho_ore', 'diamond_ore'] as const) expect(cfg.harvestLevel[id], id).toBe(IRON_HARVEST_LEVEL);
  });
});
