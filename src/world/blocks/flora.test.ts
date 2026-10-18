import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX, BLOCK_TYPES, isCrossIndex, isOpaqueIndex, isSolidIndex } from './blockTypes';
import { itemType } from '../../inventory/items';
import { OPACITY } from '../light/opacity';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { KIND_AI } from '../../yokai/ai/config';
import { groundSupport } from '../../yokai/ai/terrain';

/** FLORA-75 AC5: くさ・のばな の マスは 通りぬけ・光を通す・妖怪の判定では くうき と同じ（ブロックの性質） */
describe('AC5: くさ（kusa）・のばな（nobana）のブロック', () => {
  for (const id of ['kusa', 'nobana'] as const) {
    it(`${id}: 固くない・十字の板・光を通す・まわりの面を隠さない`, () => {
      const i = BLOCK_INDEX[id];
      expect(i).toBeGreaterThan(0);
      expect(BLOCK_TYPES[i]!.solid).toBe(false);
      expect(BLOCK_TYPES[i]!.breakable).toBe(true);
      expect(isSolidIndex(i)).toBe(false);
      expect(isCrossIndex(i)).toBe(true);
      expect(isOpaqueIndex(i)).toBe(false);
      expect(OPACITY[i]).toBe(0);
    });
  }
  it('名前は ひらがな／カタカナ（くさ・のばな）。ピンクではない', () => {
    expect(BLOCK_TYPES[BLOCK_INDEX.kusa]!.name).toBe('くさ');
    expect(BLOCK_TYPES[BLOCK_INDEX.nobana]!.name).toBe('のばな');
  });
  it('のばな は 持てる・置ける（のばな 1 こ）。くさ は 持てない', () => {
    expect(itemType('nobana')?.placeBlock).toBe('nobana');
    expect(itemType('kusa')).toBeUndefined();
  });
  it('妖怪の立てる所は くさ が ある／ない で 同じ', () => {
    const ai = KIND_AI.karakasa;
    const build = (plant: 'air' | 'kusa' | 'nobana') => {
      const w = new ArrayVoxelWorld({ x: 64, y: 32, z: 64 });
      for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) w.setBlock(x, 8, z, 'grass');
      if (plant !== 'air') for (let x = 8; x < 14; x++) for (let z = 8; z < 14; z++) w.setBlock(x, 9, z, plant);
      return w;
    };
    const base = build('air');
    for (const p of ['kusa', 'nobana'] as const) {
      const w = build(p);
      for (const [x, z] of [[10.5, 10.5], [8.2, 12.7], [13.9, 9.1], [20.5, 20.5]] as const) {
        expect(groundSupport(w, x, z, 9, ai), `${p} ${x},${z}`).toBe(groundSupport(base, x, z, 9, ai));
      }
      expect(w.isSolid(10, 9, 10)).toBe(false);
    }
  });
});
