import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { FURN_BLOCK_IDS, FURN_BLOCK_KINDS, furnInfo } from '../blocks/houseBlocks';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { LIGHT_CONFIG as C } from './config';
import { EMISSION } from './opacity';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/**
 * HOUSE-1D（#341。仕様 docs/design/HOUSE-1.md §2.12・AC28）: あんどんの ブロックの 明かりは 14、となり 1 マスは 13（たいまつと 同じ）。
 * どの 向き（4 つの id）でも 同じ。あんどん いがいの 家具は 光らない。
 */

const ANDON_IDS = FURN_BLOCK_IDS.filter((id) => furnInfo(id)!.kind === 'andon');

/** 夜（空の光が 弱い）の 広い平らな世界。あんどん（か たいまつ）は まん中 */
function night(id: string) {
  const size = { x: 24, y: 12, z: 24 };
  const w = new ArrayVoxelWorld(size);
  w.fill(0, 0, 0, size.x - 1, 0, size.z - 1, 'stone');
  const d = new SkyDarkness();
  d.value = C.nightDarken;
  const l = new WorldLight(w, d);
  const c = { x: 12, y: 3, z: 12 };
  w.setBlock(c.x, c.y, c.z, id as never);
  l.update();
  l.flush();
  return { w, l, c };
}

describe('あんどんの 明かり（AC28）', () => {
  it('明かりは 14（たいまつと 同じ）', () => {
    expect(C.torchLevel).toBe(14);
    expect(ANDON_IDS.length, '向きごとの id').toBeGreaterThan(0);
    for (const id of ANDON_IDS) expect(EMISSION[BLOCK_INDEX[id]], id).toBe(C.torchLevel);
  });

  for (const id of ANDON_IDS) {
    it(`${id}: 置いた マスが 14、となり 1 マスが 13、2 マス先が 12（たいまつと 同じ ひろがり）`, () => {
      const a = night(id);
      const t = night('torch');
      expect(a.l.blockLight(a.c.x, a.c.y, a.c.z)).toBe(C.torchLevel);
      const sides = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
        [0, 1, 0],
      ] as const;
      for (const [dx, dy, dz] of sides) {
        expect(a.l.blockLight(a.c.x + dx, a.c.y + dy, a.c.z + dz), `となり (${dx},${dy},${dz})`).toBe(C.torchLevel - 1);
      }
      expect(a.l.blockLight(a.c.x + 2, a.c.y, a.c.z)).toBe(C.torchLevel - 2);
      // たいまつと くらべても 同じ（周り 5 マスの 先まで）
      for (let n = 1; n <= 5; n++) expect(a.l.blockLight(a.c.x + n, a.c.y, a.c.z), `${n} マス先`).toBe(t.l.blockLight(t.c.x + n, t.c.y, t.c.z));
    });
  }

  it('あんどんを ほると 明かりが 消える', () => {
    const a = night(ANDON_IDS[0]!);
    expect(a.l.blockLight(a.c.x + 1, a.c.y, a.c.z)).toBe(C.torchLevel - 1);
    a.w.setBlock(a.c.x, a.c.y, a.c.z, 'air');
    a.l.update();
    a.l.flush();
    expect(a.l.blockLight(a.c.x + 1, a.c.y, a.c.z)).toBe(0);
  });

  it('あんどん いがいの 家具は 光らない（すこしも）', () => {
    for (const id of FURN_BLOCK_IDS.filter((i) => furnInfo(i)!.kind !== 'andon')) expect(EMISSION[BLOCK_INDEX[id]], id).toBe(0);
    expect(FURN_BLOCK_KINDS).toContain('andon');
  });
});
