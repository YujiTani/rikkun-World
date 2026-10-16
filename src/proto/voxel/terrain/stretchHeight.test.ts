import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../../../world/blocks/blockTypes';
import { generateIsland } from '../../../world/gen/generateIsland';
import { ArrayVoxelWorld } from '../../../world/VoxelWorld';
import { SEA_Y, stretchHeight, stretchedTop } from './stretchHeight';

const base = new ArrayVoxelWorld();
generateIsland(20261012, base);

function topGround(w: ArrayVoxelWorld, x: number, z: number): number {
  for (let y = w.size.y - 1; y >= 0; y--) {
    const k = w.getIndex(x, y, z);
    if (k === BLOCK_INDEX.grass || k === BLOCK_INDEX.stone || k === BLOCK_INDEX.dirt || k === BLOCK_INDEX.sand) return y;
  }
  return -1;
}

describe('stretchHeight', () => {
  it('k=1 は同じ中身', () => {
    expect(stretchHeight(base, 1).hash()).toBe(base.hash());
  });

  for (const k of [2, 3]) {
    it(`k=${k}: 世界の高さは 48×k、海より上の地面は k 倍、海は そのまま`, () => {
      const w = stretchHeight(base, k);
      expect(w.size.y).toBe(48 * k);
      let checked = 0;
      for (let z = 0; z < 128; z += 7) {
        for (let x = 0; x < 128; x += 7) {
          const t0 = topGround(base, x, z);
          const t1 = topGround(w, x, z);
          if (t0 <= SEA_Y) expect(t1).toBe(t0);
          else {
            expect(t1).toBe(stretchedTop(t0, k));
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(100);
    });

    it(`k=${k}: 崖の層（上 くさ・つち、その下 いし）、地面の上の物は地面といっしょに上がる`, () => {
      const w = stretchHeight(base, k);
      let layered = 0;
      for (let z = 0; z < 128; z += 3) {
        for (let x = 0; x < 128; x += 3) {
          const t0 = topGround(base, x, z);
          if (t0 <= SEA_Y + 3) continue;
          const t1 = topGround(w, x, z);
          if (base.getIndex(x, t0, z) === BLOCK_INDEX.grass && w.getIndex(x, t1 - 1, z) === BLOCK_INDEX.dirt && w.getIndex(x, t1 - 6, z) === BLOCK_INDEX.stone) layered++;
          // 上の物が地面からの高さを保つ
          for (let y = t0 + 1; y < base.size.y; y++) {
            const b = base.getIndex(x, y, z);
            if (b === BLOCK_INDEX.log) expect(w.getIndex(x, y + (t1 - t0), z)).toBe(b);
          }
        }
      }
      expect(layered).toBeGreaterThan(50);
    });
  }
});
