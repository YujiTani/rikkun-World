import { describe, expect, it } from 'vitest';
import { blockIndexOf } from './blocks/blockTypes';
import { ArrayVoxelWorld } from './VoxelWorld';

describe('topY（その列の いちばん上の空気でないブロック）', () => {
  it('空気だけの列は -1、置くと その y、ほると下がる、読みこんでいない列は -1', () => {
    const w = new ArrayVoxelWorld({ x: 32, z: 32 });
    expect(w.topY(5, 5)).toBe(-1);
    w.setBlock(5, 200, 5, 'stone');
    w.setBlock(5, 20, 5, 'dirt');
    expect(w.topY(5, 5)).toBe(200);
    w.setBlock(5, 200, 5, 'air');
    expect(w.topY(5, 5)).toBe(20);
    w.fill(0, 0, 0, 31, 100, 31, 'stone');
    expect(w.topY(7, 9)).toBe(100);
    expect(w.topY(-1, 0)).toBe(-1);
    expect(w.topY(40, 0)).toBe(-1);
    w.setBlock(3, 351, 3, 'log');
    expect(w.topY(3, 3)).toBe(351);
  });
});

describe('scanBlocks（ほしい ブロックだけを 列・セクションごとに 探す）', () => {
  it('ほしいブロックの場所を ぜんぶ 返す。全マスを 見たときと同じ', () => {
    const w = new ArrayVoxelWorld({ x: 48, z: 48 });
    w.fill(0, 0, 0, 47, 150, 47, 'stone');
    const spots: Array<[number, number, number]> = [[1, 151, 2], [47, 5, 0], [20, 300, 33], [16, 144, 16]];
    for (const [x, y, z] of spots) w.setBlock(x, y, z, 'sprinkler');
    w.setBlock(3, 60, 3, 'farmland');
    const sp = blockIndexOf('sprinkler');
    const got: Array<[number, number, number]> = [];
    w.scanBlocks((i) => i === sp, (x, y, z) => got.push([x, y, z]));
    const key = (a: number[]) => a.join(',');
    expect(got.map(key).sort()).toEqual(spots.map(key).sort());
    expect(got.length).toBe(4);
  });
});
