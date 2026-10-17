import { describe, expect, it } from 'vitest';
import type { VoxelWorld } from '../../contracts';
import { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { KIND_AI } from './config';
import { groundSupport } from './terrain';

/** どこまでも 平らな世界（y <= 8 が いし） */
function flat(): VoxelWorld {
  return {
    size: { y: 64 },
    isLoaded: () => true,
    loadedBounds: () => ({ x0: 0, z0: 0, x1: 0, z1: 0 }),
    getBlock: (_x, y) => (y < 0 || y >= 64 ? 'outside' : y <= 8 ? 'stone' : 'air'),
    setBlock: () => true,
    isSolid: (_x, y) => y >= 0 && y <= 8,
  };
}

describe('妖怪の立てる所と 見えない壁（VOX-D W4）', () => {
  const ai = KIND_AI.karakasa;
  it('壁の中なら 立てる（負の座標でも）', () => {
    expect(groundSupport(flat(), -500.5, -500.5, 9, ai)).toBe(9);
    expect(groundSupport(flat(), 29990.5, 100.5, 9, ai)).toBe(9);
  });
  it('壁のきわ・外には 立てない（4 方向）', () => {
    const w = flat();
    expect(groundSupport(w, 29999.9, 0.5, 9, ai)).toBeNaN();
    expect(groundSupport(w, 30001.5, 0.5, 9, ai)).toBeNaN();
    expect(groundSupport(w, -29999.9, 0.5, 9, ai)).toBeNaN();
    expect(groundSupport(w, 0.5, 29999.9, 9, ai)).toBeNaN();
    expect(groundSupport(w, 0.5, -29999.9, 9, ai)).toBeNaN();
  });
  it('読みこんでいない列には 立てない', () => {
    const w = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
    for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) w.setBlock(x, 8, z, 'stone');
    expect(groundSupport(w, 10.5, 10.5, 9, ai)).toBe(9);
    expect(groundSupport(w, 500.5, 10.5, 9, ai)).toBeNaN();
    expect(groundSupport(w, -3.5, 10.5, 9, ai)).toBeNaN();
  });
});
