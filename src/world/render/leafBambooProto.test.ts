import { afterEach, describe, expect, it } from 'vitest';
import { protoBambooPixels, protoLeafPixels } from './leafBambooArt';
import { setLeafBamboo } from './leafBambooMode';
import { clearLookCache } from './looks';
import { syncProtoOcc } from './voxel/sectionConsts';
import { SectionMesher } from './voxel/sectionMesher';
import { ArrayVoxelWorld } from '../VoxelWorld';

function tris(seedWorld: (w: ArrayVoxelWorld) => void): number {
  const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
  w.fill(0, 0, 0, 15, 4, 15, 'stone');
  seedWorld(w);
  clearLookCache();
  syncProtoOcc();
  return new SectionMesher(w).build(0, 0, 0, 'micro').triangles;
}

afterEach(() => {
  setLeafBamboo({ leaf: 'current', bamboo: 'current' });
  clearLookCache();
  syncProtoOcc();
});

describe('はっぱ・たけの 試し（既定は いまの まま）', () => {
  it('shell は 2×2×2 の 外側だけ（48 三角形）。いまの 小ブロックより 少ない', () => {
    const leaf = (w: ArrayVoxelWorld) => w.fill(6, 6, 6, 7, 7, 7, 'leaves');
    const now = tris(leaf);
    setLeafBamboo({ leaf: 'shell' });
    const shell = tris(leaf);
    const empty = tris(() => {});
    expect(shell - empty).toBe(48);
    expect(now - empty).toBeGreaterThan(shell - empty);
  });

  it('cross は 1 マス 8 三角形（8 マスで 64）', () => {
    const leaf = (w: ArrayVoxelWorld) => w.fill(6, 6, 6, 7, 7, 7, 'leaves');
    setLeafBamboo({ leaf: 'cross' });
    const crossed = tris(leaf);
    const empty = tris(() => {});
    expect(crossed - empty).toBe(64);
  });

  it('たけの 柱は いまの 立方体より 三角形が 少ない', () => {
    // 地面に くっつけない（かくす判定が 変わると 石の 面が 増えて、たけ自身の 三角形と まざる）
    const take = (w: ArrayVoxelWorld) => w.fill(8, 8, 8, 8, 11, 8, 'bamboo');
    const stone = tris(() => {});
    const now = tris(take);
    setLeafBamboo({ bamboo: 'voxel' });
    const voxel = tris(take);
    setLeafBamboo({ bamboo: 'sprite' });
    const sprite = tris(take);
    expect(voxel - stone).toBeLessThan(now - stone);
    expect(sprite - stone).toBeLessThan((voxel - stone) / 2);
  });

  it('細い たけの 1 ブロックは 三角形 120 まで（biome-final の 上限。葉の ふさ・横の 葉を ふくむ 20 本の 平均と 最悪）', () => {
    setLeafBamboo({ bamboo: 'voxel' });
    const H = 10;
    const cols: [number, number][] = [];
    for (let i = 0; i < 20; i++) cols.push([1 + (i % 5) * 3, 1 + Math.floor(i / 5) * 3]);
    const stone = tris(() => {});
    const total = tris((w) => { for (const [x, z] of cols) w.fill(x, 5, z, x, 4 + H, z, 'bamboo'); });
    expect((total - stone) / (cols.length * H)).toBeLessThanOrEqual(120);
    const one = tris((w) => w.fill(8, 5, 8, 8, 5, 8, 'bamboo')); // 1 ブロックだけ = てっぺん（葉の ふさ）
    expect(one - stone).toBeLessThanOrEqual(120);
  });

  it('試しの 絵は 16×16 で、既定の ときは 絵を さしかえない', () => {
    expect(protoLeafPixels('leaves')).toBeNull();
    expect(protoBambooPixels()).toBeNull();
    setLeafBamboo({ leaf: 'shell', bamboo: 'sprite' });
    expect(protoLeafPixels('leaves')).toHaveLength(256);
    expect(protoLeafPixels('momiji_leaves')).toHaveLength(256);
    expect(protoLeafPixels('matsu_leaves')).toHaveLength(256);
    expect(protoBambooPixels()).toHaveLength(256);
    setLeafBamboo({ leaf: 'cross' });
    expect(protoLeafPixels('leaves')!.some((c) => c[3] === 0)).toBe(true);
  });
});
