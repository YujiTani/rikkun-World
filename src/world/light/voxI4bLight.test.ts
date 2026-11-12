import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { LIGHT_CONFIG as C } from './config';
import { isDarkForSpawn } from './curve';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/**
 * #187 §2.4（4b）: 光る物は たいまつ と 同じ きまり（`isDarkForSpawn` は かえない）。
 * すいしょう（光 9）から 3 マス以内・とうろう（光 14）から 8 マス以内は 夜でも 妖怪が 出ない。次の 1 マスからは 出てよい。
 * 「マス」は 光が 伝わる 歩数（たて・よこ・上下の 1 マス = 1 歩。ななめは 2 歩）。広い 平らな 夜の 世界の まん中に 置く。
 */
const known = (id: string): boolean => (BLOCK_INDEX as Record<string, number>)[id] !== undefined;

function night(id: string, half: number) {
  const size = { x: 2 * half + 1, y: 12, z: 2 * half + 1 };
  const w = new ArrayVoxelWorld(size);
  w.fill(0, 0, 0, size.x - 1, 0, size.z - 1, 'stone');
  const d = new SkyDarkness();
  d.value = C.nightDarken;
  const l = new WorldLight(w, d);
  const c = { x: half, y: 3, z: half };
  w.setBlock(c.x, c.y, c.z, id as never);
  l.update();
  l.flush();
  const dark = (x: number, y: number, z: number): boolean => isDarkForSpawn(l.skyLight(x, y, z), d.value, l.blockLight(x, y, z));
  return { c, dark };
}

describe('§2.4: 光る 山の物の まわりに 妖怪が 出ない', () => {
  for (const [id, reach] of [['suisho', 3], ['touro', 8]] as const) {
    it(`${id}: ${reach} マス以内は 出ない・${reach + 1} マス目からは 出てよい（夜）`, () => {
      expect(known(id), `${id} が まだ無い`).toBe(true);
      const a = night(id, reach + 4);
      const t = night('torch', reach + 4);
      expect(a.dark(a.c.x + reach + 3, a.c.y, a.c.z), '遠くは 暗い').toBe(true);
      for (let dx = -reach; dx <= reach; dx++) {
        for (let dy = 0; dy <= 4; dy++) {
          for (let dz = -reach; dz <= reach; dz++) {
            if (Math.abs(dx) + Math.abs(dy - 0) + Math.abs(dz) > reach) continue;
            expect(a.dark(a.c.x + dx, a.c.y + dy, a.c.z + dz), `${id} (${dx},${dy},${dz})`).toBe(false);
          }
        }
      }
      expect(a.dark(a.c.x + reach + 1, a.c.y, a.c.z), `${reach + 1} マス目`).toBe(true);
      if (id === 'touro') for (let n = 1; n <= reach + 2; n++) expect(a.dark(a.c.x + n, a.c.y, a.c.z), `たいまつと 同じ ${n}`).toBe(t.dark(t.c.x + n, t.c.y, t.c.z));
    });
  }
});
