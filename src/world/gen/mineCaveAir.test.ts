import { describe, expect, it } from 'vitest';
import { GEN_CONFIG } from './config';
import { generateChunk } from './chunk';
import { caveAirFor } from './mineCaveAir';
import { nearMouth } from './mouths';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { SECTION_VOLUME, sectionToArray } from '../sections';
import { terrainFor } from './terrain';

/**
 * 洞くつの 空気を 列を 作らずに 答える CaveAir（MINE-1C。坑道の 横穴が ほらあなに つながるか 見る のに 使う）が、
 * 実際に 作った 列の 空気と 1 マス ずつ 同じか。洞くつの 口〔さか道・へや〕の まわりは 口が 空気に するので のぞく。
 */
const AIR = BLOCK_INDEX.air;

describe('CaveAir は carveCaves と 同じ 空気を 答える', () => {
  it.each([GEN_CONFIG.defaultSeed, 777])('seed %i: 列 6 つの 地下で 1 マスも ずれない', (seed) => {
    const T = terrainFor(seed);
    const cave = caveAirFor(T);
    let airCells = 0;
    for (const [cx, cz] of [[5, 5], [-7, 3], [12, -9], [30, 30], [-20, -18], [3, 40]] as const) {
      const col = generateChunk(seed, cx, cz);
      const flat = new Uint8Array(352 * 256);
      col.sections.forEach((s, sy) => flat.set(sectionToArray(s), sy * SECTION_VOLUME));
      for (let lz = 0; lz < 16; lz++) {
        for (let lx = 0; lx < 16; lx++) {
          const x = cx * 16 + lx;
          const z = cz * 16 + lz;
          if (nearMouth(T, x, z, 2)) continue;
          const lim = cave.limit(x, z);
          for (let y = 8; y <= Math.min(lim, 300); y++) {
            const want = flat[(y * 16 + lz) * 16 + lx] === AIR;
            if (want) airCells++;
            if (cave.airAt(x, y, z) !== want) throw new Error(`seed ${seed} (${x}, ${y}, ${z}): 実際 ${want ? '空気' : '石'}・計算 ${want ? '石' : '空気'}`);
          }
        }
      }
    }
    expect(airCells, '空気の マスを 1 つ 以上 くらべた').toBeGreaterThan(50);
  }, 60_000);
});
