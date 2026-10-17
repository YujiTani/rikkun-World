import { describe, expect, it } from 'vitest';
import { SECTION_SIZE, WORLD_HEIGHT } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { generateChunk } from './chunk';
import { regionRect } from './region';
import { surfaceFor } from './surface';

/**
 * ブロックを読みこまずに出す「地面・木・たいまつ」の答え（VOX-D G2）が、
 * 本当に generateChunk で作った列と同じか（ふるい畑・やせいの やさい の置き場所は これで決める）。
 */

const SEEDS = [20261012, 1, 2];
const SOFT = new Set<number>([BLOCK_INDEX.air, BLOCK_INDEX.water, BLOCK_INDEX.log, BLOCK_INDEX.leaves, BLOCK_INDEX.start_torch]);

function realColumns(seed: number) {
  const R = regionRect(seed);
  const cols = new Map<string, Uint8Array>();
  for (let cz = R.z0 >> 4; cz < R.z1 >> 4; cz++)
    for (let cx = R.x0 >> 4; cx < R.x1 >> 4; cx++) {
      const a = new Uint8Array(WORLD_HEIGHT * 256);
      generateChunk(seed, cx, cz).sections.forEach((s, sy) => a.set(sectionToArray(s), sy * SECTION_VOLUME));
      cols.set(`${cx},${cz}`, a);
    }
  const get = (x: number, y: number, z: number): number => cols.get(`${x >> 4},${z >> 4}`)![(y * 16 + (z & 15)) * 16 + (x & 15)]!;
  return { R, get };
}

describe.each(SEEDS)('surface seed=%i', (seed) => {
  const { R, get } = realColumns(seed);
  const S = surfaceFor(seed);

  it('地面の高さ・いちばん上のブロックが 本当の列と同じ（R の中ぜんぶ）', () => {
    let bad = 0;
    for (let z = R.z0; z < R.z1; z++)
      for (let x = R.x0; x < R.x1; x++) {
        let top = WORLD_HEIGHT - 1;
        while (top > 0 && get(x, top, z) === BLOCK_INDEX.air) top--;
        let g = top;
        while (g > 0 && SOFT.has(get(x, g, z))) g--;
        if (S.ground(x, z) !== g) bad++;
        else if (S.groundIsGrass(x, z) !== (get(x, g, z) === BLOCK_INDEX.grass)) bad++;
        else if (S.covered(x, z) !== (top !== g)) bad++;
        else if (S.treeCover(x, z) !== (get(x, top, z) === BLOCK_INDEX.log || get(x, top, z) === BLOCK_INDEX.leaves)) bad++;
      }
    expect(bad).toBe(0);
  });

  it('地面の上の 空気・みず・木 が 本当の列と同じ（地面から 12 マス上まで）', () => {
    let bad = 0;
    const kind = (b: number): string => (b === BLOCK_INDEX.air ? 'air' : b === BLOCK_INDEX.water ? 'water' : b === BLOCK_INDEX.log ? 'log' : b === BLOCK_INDEX.leaves ? 'leaves' : b === BLOCK_INDEX.start_torch ? 'torch' : 'solid');
    for (let z = R.z0; z < R.z1; z += 3)
      for (let x = R.x0; x < R.x1; x += 3) {
        const g = S.ground(x, z);
        for (let y = g + 1; y <= g + 12; y++) if (S.blockAt(x, y, z) !== kind(get(x, y, z))) bad++;
      }
    expect(bad).toBe(0);
    expect(SECTION_SIZE).toBe(16);
  });
});
