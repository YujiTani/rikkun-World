import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { AI_CONST } from './config';
import { collectFloors, isUnderground } from './terrain';

/**
 * MINE-1A（docs/design/MINE-1.md §4.3）の 内がわの 部品: 床さがし `collectFloors` と 地下の 判定 `isUnderground`。
 * 外から 見える ふるまい（出る 高さ・数と 間かく）は mineSpawn.test.ts。ここは 部品の 約束（はんい・読む 数）を 見る。
 */

const SIZE = { x: 16, y: 200, z: 16 };
const X = 5;
const Z = 5;

/** 石の 柱（y 0〜40）と、足の 高さ 51・56・61 に なる 床の 候補を 1 マスずつ 浮かせた 列 */
function column(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld(SIZE);
  w.fill(X, 0, Z, X, 40, Z, 'stone');
  w.setBlock(X, 50, Z, 'stone'); // 床 → 足の 高さ 51
  w.setBlock(X, 60, Z, 'stone'); // 床 → 足の 高さ 61
  w.setBlock(X, 55, Z, 'leaves'); // はっぱの 上は 床に しない（足の 高さ 56）
  return w;
}

function countReads(w: ArrayVoxelWorld, run: () => void): number {
  const orig = w.getBlock.bind(w);
  let n = 0;
  w.getBlock = (x, y, z) => (n++, orig(x, y, z));
  try {
    run();
  } finally {
    delete (w as Partial<typeof w>).getBlock;
  }
  return n;
}

describe('isUnderground: 足が 地形の 高さより AI_CONST.underDepth マス 以上 下', () => {
  it('地面 150: 足 144（6 下）は 地下・145（5 下）は 地上', () => {
    expect(AI_CONST.underDepth).toBe(6);
    expect(isUnderground(144, 150)).toBe(true);
    expect(isUnderground(145, 150)).toBe(false);
  });
  it('はるか 下は 地下・地面の 上や 空は 地上', () => {
    expect(isUnderground(5, 150)).toBe(true);
    expect(isUnderground(150, 150)).toBe(false);
    expect(isUnderground(210, 150)).toBe(false);
  });
  it('足が 小数でも 6 マス 以上 下 かで きまる', () => {
    expect(isUnderground(144.0, 150)).toBe(true);
    expect(isUnderground(144.5, 150)).toBe(false);
    expect(isUnderground(143.5, 150)).toBe(true);
  });
});

describe('collectFloors: 足の 高さが lo〜hi に なる 床を 上から 集める', () => {
  it('はっぱの 上は のぞいて、はんいの 中の 床だけ（上から 下の じゅん）', () => {
    const out: number[] = [];
    const water = collectFloors(column(), X, Z, 45, 65, out);
    expect(water).toBe(false);
    expect(out).toEqual([61, 51]);
  });

  it('きわ: lo ちょうどの 床は 入り、1 つ 下は 入らない。hi も 同じ', () => {
    const w = column();
    const out: number[] = [];
    collectFloors(w, X, Z, 51, 61, out);
    expect(out).toEqual([61, 51]);
    collectFloors(w, X, Z, 52, 60, out);
    expect(out).toEqual([]);
    collectFloors(w, X, Z, 52, 61, out);
    expect(out).toEqual([61]);
    collectFloors(w, X, Z, 51, 60, out);
    expect(out).toEqual([51]);
  });

  it('lo〜hi の 中に 水が あれば true。はんいの 外（lo の 1 つ下・hi の 1 つ上）の 水は 見ない', () => {
    const out: number[] = [];
    for (const [y, want] of [[44, false], [45, true], [58, true], [65, true], [66, false]] as const) {
      const w = column();
      w.setBlock(X, y, Z, 'water');
      expect(collectFloors(w, X, Z, 45, 65, out), `水 y=${y}`).toBe(want);
    }
  });

  it('固い ブロックだけの 列は 床が ない・空気だけの 列も ない', () => {
    const solid = new ArrayVoxelWorld(SIZE);
    solid.fill(X, 0, Z, X, 120, Z, 'stone');
    const out: number[] = [1, 2, 3];
    expect(collectFloors(solid, X, Z, 45, 65, out)).toBe(false);
    expect(out).toEqual([]);
    expect(collectFloors(new ArrayVoxelWorld(SIZE), X, Z, 45, 65, out)).toBe(false);
    expect(out).toEqual([]);
  });

  it('世界の 上や 下を こえる はんいでも 落ちない（床は 世界の 中だけ）', () => {
    const w = new ArrayVoxelWorld(SIZE);
    w.fill(X, 0, Z, X, 30, Z, 'stone');
    const out: number[] = [];
    expect(collectFloors(w, X, Z, -10, 400, out)).toBe(false);
    expect(out).toEqual([31]);
  });

  it('getBlock で 読む 数は はばの 数（hi − lo + 1）に 床の 下の 1 つ ぶんを 足した 数 まで', () => {
    const w = column();
    const out: number[] = [];
    // 17 段（足 ±8 の はば）。仕様 §4.9 の 目安は 21 まで
    const reads = countReads(w, () => collectFloors(w, X, Z, 52, 68, out));
    expect(reads).toBeGreaterThan(0);
    expect(reads).toBeLessThanOrEqual(17 + 1);
    // 床が いちばん 下に ある ときも 同じ
    const reads2 = countReads(w, () => collectFloors(w, X, Z, 51, 67, out));
    expect(reads2).toBeLessThanOrEqual(17 + 1);
  });

  it('out は 使い回し: 毎回 空に もどしてから 集める', () => {
    const w = column();
    const out: number[] = [];
    collectFloors(w, X, Z, 45, 65, out);
    collectFloors(w, X, Z, 45, 65, out);
    expect(out).toEqual([61, 51]);
  });
});
