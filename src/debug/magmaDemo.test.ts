import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { attach } from '../world/water/waterTestKit';
import { buildMagmaDemo, demoBoilCount, magmaDemoLayout, wantsMagmaDemo } from './magmaDemo';

/** MAGMA-SPAWN §3: ?demo=magma の 見本 */
describe('マグマの 見本', () => {
  const sp = { x: 24.5, y: 11, z: 30.5 };
  const rig = () => {
    const w = new ArrayVoxelWorld({ x: 48, y: 32, z: 48 });
    w.fill(0, 0, 0, 47, 10, 47, 'stone');
    return attach(w, 5);
  };
  it('URL の demo=magma だけ', () => {
    expect(wantsMagmaDemo('?demo=magma')).toBe(true);
    expect(wantsMagmaDemo('?nosave=1&demo=magma')).toBe(true);
    expect(wantsMagmaDemo('?nosave=1')).toBe(false);
  });
  it('いけ・こくようせき・2 つの わきどころ・たきつぼ・こげた ブロック が できる', () => {
    const r = rig();
    expect(buildMagmaDemo(r.world, r.sys, sp)).toBe(true);
    const L = magmaDemoLayout(sp);
    r.step(45 * 20);
    const [px0, pz0, px1, pz1] = L.pool;
    let obs = 0;
    for (let z = pz0; z <= pz1; z++) if (r.world.getBlock(px1, L.g, z) === 'kokuyouseki') obs++;
    expect(obs).toBeGreaterThan(0);
    expect(r.sys.magma.amount(px0, L.g, pz0)).toBe(8);
    expect(r.sys.springCount()).toBe(2);
    expect(r.sys.springLink(L.waterSpring.x, L.waterSpring.y, L.waterSpring.z)).toEqual({ x: L.waterSpring.x, y: L.g - 2, z: L.waterSpring.z });
    expect(r.world.getBlock(L.kogeta[0], L.g, L.kogeta[1])).toBe('kogeta');
    expect(demoBoilCount(sp)).toBeGreaterThan(0);
  });
  it('マグマの わきどころは ますが いっぱいに なると とまる（あふれない）', () => {
    const r = rig();
    buildMagmaDemo(r.world, r.sys, sp);
    const L = magmaDemoLayout(sp);
    const [bx0, bz0, bx1, bz1] = L.magmaBasin;
    r.step(45 * 400);
    const inBasin = r.sys.magma.total(bx0, L.g + 1, bz0, bx1, L.g + 5, bz1);
    expect(inBasin).toBeGreaterThan((2 * 2 * 5 - 1) * 8 - 8); // わきどころの マスを のぞいて ほぼ いっぱい
    expect(r.sys.magma.total(bx0 - 2, L.g + 1, bz0 - 2, bx1 + 2, L.g + 6, bz1 + 2)).toBe(inBasin);
  });
  it('列が 読みこまれて いなければ false（何も 置かない）', () => {
    const r = rig();
    expect(buildMagmaDemo(r.world, r.sys, { x: 100, y: 11, z: 100 })).toBe(false);
  });
});
