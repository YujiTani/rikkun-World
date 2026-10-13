import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { raycastBlocks } from './raycast';

describe('raycastBlocks solidOnly', () => {
  it('作物は 照準には当たるが solidOnly では通りぬける', () => {
    const w = new ArrayVoxelWorld({ x: 8, y: 8, z: 8 });
    w.setBlock(3, 1, 1, 'crop_onion');
    w.setBlock(5, 1, 1, 'dirt');
    expect(raycastBlocks(w, 0.5, 1.5, 1.5, 1, 0, 0, 8)?.block.x).toBe(3);
    expect(raycastBlocks(w, 0.5, 1.5, 1.5, 1, 0, 0, 8, true)?.block.x).toBe(5);
  });
});
