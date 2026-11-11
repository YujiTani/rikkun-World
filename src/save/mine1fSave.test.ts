import { describe, expect, it } from 'vitest';
import * as gens from './gens';
import { needYakataHook, hookF, tableOf, yakataChestTable } from '../world/gen/mineYakataKit';
import { SEEDS_20 } from '../world/gen/mineShaftKit';

/**
 * MINE-1F F9・F10・F11 の 土台〔かるい 部分〕。重い 部分〔v7 の 保存の 読みこみ〕は 下の TODO。
 *   F9: 版 `YAKATA_GEN` ＝ 8・新しい 世界の 窓口は やかたの 古い 列 0・`saveGens().yakata` が 版。
 *   F10: やかたの 8 ブロックの id は 表から 読む〔#311〕。
 *   F11: 宝箱の 表 `yakata` は 4 段目だけ・かならず 置く。
 * TODO(次の 人): v7 の 保存ファイル `__fixtures__/world-v7-seed20261012.rikkun.gz` を main〔1E 込み〕で 作り、
 *   読みこんだ 列は ぜんぶ 古い〔`oldCols('yakata')`〕・やかたが 出ない・1E の ほかの 坑道は `mine1e-before.json` と 同じ、を 確かめる。
 */
const g = gens as unknown as Record<string, unknown>;

describe('F9: やかたの 版', () => {
  it('YAKATA_GEN は 8', () => {
    expect(g.YAKATA_GEN, '窓口が ない: src/save/gens.ts の YAKATA_GEN').toBe(8);
  });
  it('新しい 世界の 窓口: やかたの 古い 列 0・saveGens().yakata は 版', () => {
    const h = hookF(SEEDS_20[0]!);
    needYakataHook(h, ['saveGens', 'oldCols', 'isOld']);
    expect(h.saveGens()).toMatchObject({ yakata: g.YAKATA_GEN });
  });
});

describe('F10・F11: ブロックと 宝箱の 表', () => {
  it('ブロック 8 つの id は 表に あり、ほかと かさならない', () => {
    const T = tableOf(SEEDS_20[0]!);
    const ids = Object.values(T.lookBlocks).flatMap((l) => Object.values(l));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('宝箱の 表 yakata: 4 段目・かならず 置く', () => {
    const t = yakataChestTable();
    expect(t, '窓口が ない: chestTable("yakata")').toBeTruthy();
    expect(JSON.stringify(t)).toContain('4');
  });
});
