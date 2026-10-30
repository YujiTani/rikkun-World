import { describe, expect, it } from 'vitest';
import { GADGET_TUNING } from '../../content/items/gadgetTuning';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { LIGHT_CONFIG as C } from './config';
import { blockLightBrightness } from './curve';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/** ITEM-FX-1 AC2・AC3: ちょうちんは たいまつより 強く・広く 光り、まわりに 妖怪が 湧かない（数は GADGET_TUNING から読む） */

const R = GADGET_TUNING.lantern.noSpawnRadius;

/** 夜（空の光が弱い）の 広い平らな世界。ちょうちんは まん中 */
function night(): { w: ArrayVoxelWorld; l: WorldLight; c: { x: number; y: number; z: number } } {
  const size = { x: 4 * R + 16, y: 3 * R + 8, z: 4 * R + 16 };
  const w = new ArrayVoxelWorld(size);
  w.fill(0, 0, 0, size.x - 1, 0, size.z - 1, 'stone');
  const d = new SkyDarkness();
  d.value = C.nightDarken;
  const l = new WorldLight(w, d);
  return { w, l, c: { x: Math.floor(size.x / 2), y: R + 2, z: Math.floor(size.z / 2) } };
}
const settle = (l: WorldLight) => {
  l.update();
  l.flush();
};

describe('ちょうちんの光（AC2）', () => {
  it('置いたマスは 表の光の強さ。1 マスごとに 1 弱まる。たいまつ（14）より強い', () => {
    const { w, l, c } = night();
    w.setBlock(c.x, c.y, c.z, 'lantern');
    settle(l);
    expect(l.blockLight(c.x, c.y, c.z)).toBe(GADGET_TUNING.lantern.light);
    expect(l.blockLight(c.x + 1, c.y, c.z)).toBe(GADGET_TUNING.lantern.light - 1);
    expect(l.blockLight(c.x + 3, c.y, c.z)).toBe(GADGET_TUNING.lantern.light - 3);
    expect(GADGET_TUNING.lantern.light).toBeGreaterThan(C.torchLevel);
  });
  it('見た目の明るい範囲（強い 0.95）が たいまつより 広い', () => {
    const a = night();
    a.w.setBlock(a.c.x, a.c.y, a.c.z, 'torch');
    settle(a.l);
    const b = night();
    b.w.setBlock(b.c.x, b.c.y, b.c.z, 'lantern');
    settle(b.l);
    const reach = (s: ReturnType<typeof night>) => {
      let n = 0;
      while (blockLightBrightness(s.l.blockLight(s.c.x + n + 1, s.c.y, s.c.z)) >= C.torchBrightBrightness) n++;
      return n;
    };
    expect(reach(b)).toBeGreaterThan(reach(a));
    // 暗い（少し）範囲も広い
    const dim = (s: ReturnType<typeof night>) => {
      let n = 0;
      while (blockLightBrightness(s.l.blockLight(s.c.x + n + 1, s.c.y, s.c.z)) > 0) n++;
      return n;
    };
    expect(dim(b)).toBeGreaterThan(dim(a));
  });
});

describe('ちょうちんのまわりは妖怪が湧かない（AC3）', () => {
  it('水平（東西・南北）・上下とも 半径 R 以内は false。R+1 からは 夜なら true', () => {
    const { w, l, c } = night();
    w.setBlock(c.x, c.y, c.z, 'lantern');
    settle(l);
    const dirs: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
    for (const [dx, dy, dz] of dirs) {
      expect(l.isDarkForSpawn(c.x + dx * R, c.y + dy * R, c.z + dz * R), `${dx},${dy},${dz} R`).toBe(false);
      expect(l.isDarkForSpawn(c.x + dx * (R + 1), c.y + dy * (R + 1), c.z + dz * (R + 1)), `${dx},${dy},${dz} R+1`).toBe(true);
    }
  });
  it('立方体の すみ（ななめ）も 範囲の内側 なら false', () => {
    const { w, l, c } = night();
    w.setBlock(c.x, c.y, c.z, 'lantern');
    settle(l);
    expect(l.isDarkForSpawn(c.x + R, c.y + R, c.z + R)).toBe(false);
    expect(l.isDarkForSpawn(c.x + R + 1, c.y, c.z + R)).toBe(true);
  });
  it('たいまつは 今までどおり 8 マス（ちょうちんの 広い範囲は たいまつに 広がらない）', () => {
    const { w, l, c } = night();
    w.setBlock(c.x, c.y, c.z, 'torch');
    settle(l);
    expect(l.isDarkForSpawn(c.x + C.torchDimRadius, c.y, c.z)).toBe(false);
    expect(l.isDarkForSpawn(c.x + C.torchDimRadius + 1, c.y, c.z)).toBe(true);
  });
  it('ちょうちんを こわすと 元にもどる。2 つあれば それぞれの まわり', () => {
    const { w, l, c } = night();
    w.setBlock(c.x, c.y, c.z, 'lantern');
    settle(l);
    expect(l.isDarkForSpawn(c.x + 10, c.y, c.z)).toBe(false);
    w.setBlock(c.x, c.y, c.z, 'air');
    settle(l);
    expect(l.isDarkForSpawn(c.x + 10, c.y, c.z)).toBe(true);
    w.setBlock(c.x - 20, c.y, c.z, 'lantern');
    w.setBlock(c.x + 20, c.y, c.z, 'lantern');
    settle(l);
    expect(l.isDarkForSpawn(c.x - 20 + 10, c.y, c.z)).toBe(false);
    expect(l.isDarkForSpawn(c.x + 20 - 10, c.y, c.z)).toBe(false);
    expect(l.isDarkForSpawn(c.x, c.y, c.z + R + 1)).toBe(true);
  });
});
