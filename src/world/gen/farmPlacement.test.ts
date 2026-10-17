import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { applyFarmPlacement, computeFarmPlacement } from './farmPlacement';
import { populateWorld } from './populate';
import { regionRect } from './region';
import { terrainAt } from './terrain';

const SEEDS = [20261012, 1, 2, 3, 4, 5];
const cheb = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

describe.each(SEEDS)('置きもの seed=%i（F1〜F3・基準 23）', (seed) => {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  const info = populateWorld(w, seed);
  const sp = info.spawn();
  const sx = Math.floor(sp.x);
  const sz = Math.floor(sp.z);
  const p = computeFarmPlacement(seed);
  const Rr = regionRect(seed);

  it('やせいの やさい 4〜6 こずつ・条件（F2）', () => {
    for (const kind of ['onion', 'tomato', 'pumpkin', 'eggplant'] as const) {
      const list = p.wild.filter((a) => a.kind === kind);
      expect(list.length, `${kind}`).toBeGreaterThanOrEqual(4);
      expect(list.length).toBeLessThanOrEqual(6);
    }
    for (const a of p.wild) {
      expect(w.getBlock(a.x, a.y - 1, a.z)).toBe('grass');
      expect(w.getBlock(a.x, a.y, a.z)).toBe('air');
      expect(a.x <= 12 && a.z <= 12).toBe(false);
      const d = cheb(a, { x: sx, z: sz });
      expect(d).toBeGreaterThanOrEqual(8);
      expect(d).toBeLessThanOrEqual(56);
      expect(Math.min(a.x - Rr.x0, a.z - Rr.z0, Rr.x1 - 1 - a.x, Rr.z1 - 1 - a.z)).toBeGreaterThanOrEqual(8);
      for (const b of p.wild) if (a !== b) expect(cheb(a, b)).toBeGreaterThanOrEqual(3);
    }
  });

  it('草原・森を さきに さがす（F2）', () => {
    const grassFirst = p.wild.filter((a) => a.kind === 'onion' || a.kind === 'tomato');
    const inGrass = grassFirst.filter((a) => terrainAt(seed, a.x, a.z).biome === 'grassland').length;
    expect(inGrass).toBeGreaterThan(0);
  });

  it('同じシードで同じ答え・世界は変えない（F3）・読みこんでいなくても同じ（G4）', () => {
    const before = w.hash();
    expect(computeFarmPlacement(seed)).toEqual(p);
    expect(w.hash()).toBe(before);
  });

  it('置き場所は ぜんぶ R の中（G1・G4）', () => {
    const inR = (x: number, z: number) => x >= Rr.x0 && x < Rr.x1 && z >= Rr.z0 && z < Rr.z1;
    for (const a of p.wild) expect(inR(a.x, a.z)).toBe(true);
    for (const b of p.oldFarm?.blocks ?? []) expect(inR(b.x, b.z)).toBe(true);
  });

  it('ふるい はたけ は 置ける。6×6・はたけ 12・さく・かかし・たんす（F1）', () => {
    expect(p.oldFarm).not.toBeNull();
    const of = p.oldFarm!;
    const n = (id: string) => of.blocks.filter((b) => b.id === id).length;
    expect(n('farmland')).toBe(12);
    expect(n('kakashi')).toBe(1);
    expect(n('kakashi_head')).toBe(1);
    expect(n('tansu')).toBe(1);
    expect(n('saku')).toBeGreaterThanOrEqual(6);
    expect(n('saku')).toBeLessThanOrEqual(8);
    expect(of.tansuItems.reduce((a, t) => a + t.count, 0)).toBe(8);
    expect(of.blocks.every((b, i, a) => i === 0 || a[i - 1]!.y <= b.y)).toBe(true);
    expect(new Set(of.blocks.map((b) => `${b.x},${b.y},${b.z}`)).size).toBe(of.blocks.length);
    const d = Math.hypot(of.kakashi.x + 3 - sp.x, of.kakashi.z + 3 - sp.z);
    expect(d).toBeGreaterThanOrEqual(5);
    expect(d).toBeLessThanOrEqual(41);
    const bx = of.box;
    expect(bx.x0 > sx + 2 || bx.x1 < sx - 2 || bx.z0 > sz + 2 || bx.z1 < sz - 2).toBe(true); // スタートの 5×5 と重ならない
    for (let z = bx.z0; z <= bx.z1; z++) for (let x = bx.x0; x <= bx.x1; x++) {
      const top = w.topY(x, z);
      expect(['log', 'leaves', 'water']).not.toContain(w.getBlock(x, top, z));
    }
  });

  it('置いたあとも 段差 1 以下・36 列は くさ', () => {
    const w2 = new ArrayVoxelWorld({ x: 0, z: 0 });
    const i2 = populateWorld(w2, seed);
    applyFarmPlacement(w2, p);
    const of = p.oldFarm!;
    for (const b of of.blocks) expect(w2.getBlock(b.x, b.y, b.z)).toBe(b.id);
    const bx = of.box;
    for (let z = bx.z0; z < bx.z1; z++) {
      for (let x = bx.x0; x < bx.x1; x++) {
        expect(Math.abs(i2.groundHeight(x, z) - i2.groundHeight(x + 1, z))).toBeLessThanOrEqual(1);
        expect(Math.abs(i2.groundHeight(x, z) - i2.groundHeight(x, z + 1))).toBeLessThanOrEqual(1);
      }
    }
    const h0 = of.tansu.y - 1;
    for (let z = of.kakashi.z; z < of.kakashi.z + 6; z++) for (let x = of.kakashi.x; x < of.kakashi.x + 6; x++) {
      expect(['grass', 'farmland']).toContain(w2.getBlock(x, h0, z));
    }
  });
});
