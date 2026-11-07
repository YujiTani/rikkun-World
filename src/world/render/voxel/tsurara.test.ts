import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../../blocks/blockTypes';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { SectionMesher } from './sectionMesher';

/**
 * MINE-1D（docs/design/MINE-1.md §3.2・§4.9「つらら」・受け入れ基準 D7 の 描き方）: つららの 十字の 板。
 *   ・1 本 三角形 16 まで〔アートの 案は 8。予算 `docs/art/design/03-budget.md` §15〕・0 では ない〔何も 描かない のは だめ〕
 *   ・まとめて 描く〔extras の 面に まとまり、小ブロックの 面〔micro〕は 出さない。本数が ふえても 1 本あたりの 三角形が ふえない〕
 *   ・つららの 上の 石の 面は かくさない〔つららは 不透明でない〕
 * 色・形〔先が まるく 白い〕は 見た目の ことなので D13〔art-reviewer〕。ここでは 決め打ちしない。
 */

const ID = 'tsurara';
const LIMIT = 16;

/** 石の 天井〔y 24〕の 下に つららを 並べた 世界 */
function ceiling(xs: readonly number[]): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
  w.fill(0, 24, 0, 47, 30, 47, 'stone');
  for (const x of xs) w.setBlock(x, 23, 24, ID as never);
  return w;
}

describe('D7: つららの 板', () => {
  it('ブロックが ある', () => {
    expect((BLOCK_INDEX as unknown as Record<string, number | undefined>)[ID], 'tsurara の 番号').toBeTypeOf('number');
  });

  it.each(['box', 'micro'] as const)('1 本: 三角形が 1 以上 16 以下〔%s の 段〕', (tier) => {
    const d = new SectionMesher(ceiling([24])).build(1, 1, 1, tier);
    const tsuraraTris = d.extras.indices.length / 3;
    expect(tsuraraTris, '十字の 板の 三角形').toBeGreaterThan(0);
    expect(tsuraraTris, '十字の 板の 三角形').toBeLessThanOrEqual(LIMIT);
  });

  it('まとめて 描く: 12 本 ならべても 板は extras に まとまり、1 本あたり 16 まで・本数に 比例する', () => {
    const one = new SectionMesher(ceiling([24])).build(1, 1, 1, 'micro');
    const xs = Array.from({ length: 12 }, (_, i) => 12 + i * 2);
    const many = new SectionMesher(ceiling(xs)).build(1, 1, 1, 'micro');
    const t1 = one.extras.indices.length / 3;
    const tn = many.extras.indices.length / 3;
    expect(tn, '12 本').toBeLessThanOrEqual(LIMIT * 12);
    expect(tn, '12 本は 1 本の 12 倍 いかい〔板が 1 本ごとに ふえるだけ〕').toBeLessThanOrEqual(t1 * 12 + 1e-9);
    expect(tn, '12 本は 1 本より 多い').toBeGreaterThan(t1);
  });

  it('小ブロック〔micro〕の 面を 足さない: つららを 足しても 石の 面の 数が ふえない', () => {
    const base = new SectionMesher(ceiling([])).build(1, 1, 1, 'micro');
    const withT = new SectionMesher(ceiling([24])).build(1, 1, 1, 'micro');
    expect(withT.extras.indices.length, 'つららの 板が 描かれて いる〔何も 描かないで 通さない〕').toBeGreaterThan(0);
    expect(withT.faces, '小ブロックの 面').toBeLessThanOrEqual(base.faces);
  });
});
