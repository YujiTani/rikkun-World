import { describe, expect, it } from 'vitest';
import { WORLD_SIZE } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { applyFarmPlacement, computeFarmPlacement } from './farmPlacement';
import { generateIsland } from './generateIsland';

const SEEDS = [20261012, ...Array.from({ length: 19 }, (_, i) => i + 1)];
const cheb = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));

describe.each(SEEDS)('置きもの seed=%i', (seed) => {
  const w = new ArrayVoxelWorld(WORLD_SIZE);
  const info = generateIsland(seed, w);
  const R = info.regions();
  const p = computeFarmPlacement(seed, { world: w, info });
  it('やせいの やさい 4〜6 こずつ・条件', () => {
    for (const kind of ['onion', 'tomato', 'pumpkin', 'eggplant'] as const) {
      const list = p.wild.filter((a) => a.kind === kind);
      expect(list.length, `${kind}`).toBeGreaterThanOrEqual(4);
      expect(list.length).toBeLessThanOrEqual(6);
    }
    for (const a of p.wild) {
      expect(w.getBlock(a.x, a.y - 1, a.z)).toBe('grass');
      expect(w.getBlock(a.x, a.y, a.z)).toBe('air');
      expect(a.x <= 12 && a.z <= 12).toBe(false);
      expect(a.x >= 59 && a.x <= 69 && a.z >= 59 && a.z <= 69).toBe(false);
      for (const b of p.wild) if (a !== b) expect(cheb(a, b)).toBeGreaterThanOrEqual(3);
    }
  });
  it('同じシードで同じ答え・世界は変えない', () => {
    expect(computeFarmPlacement(seed)).toEqual(p);
  });
  it('ふるい はたけ は 20 シードぜんぶ 置ける（段 0〜3）', () => {
    const TIER: Record<number, number> = { 2: 1, 3: 1, 19: 1, 10: 2, 18: 2, 7: 3, 9: 3 };
    expect(p.oldFarm).not.toBeNull();
    expect(p.oldFarm!.tier).toBe(TIER[seed] ?? 0);
  });
  it('置いたあとも 段差 1 以下・かかし・さく・はたけ・たんす', () => {
    const w2 = new ArrayVoxelWorld(WORLD_SIZE);
    const i2 = generateIsland(seed, w2);
    applyFarmPlacement(w2, p);
    const of = p.oldFarm!;
    const n = (id: string) => of.blocks.filter((b) => b.id === id).length;
    expect(n('farmland')).toBe(12);
    expect(n('kakashi')).toBe(1);
    expect(n('kakashi_head')).toBe(1);
    expect(n('tansu')).toBe(1);
    expect(n('saku')).toBeGreaterThanOrEqual(6);
    expect(n('saku')).toBeLessThanOrEqual(8);
    for (let z = 0; z < 127; z++) {
      for (let x = 0; x < 127; x++) {
        const h = i2.groundHeight(x, z);
        expect(Math.abs(h - i2.groundHeight(x + 1, z))).toBeLessThanOrEqual(1);
        expect(Math.abs(h - i2.groundHeight(x, z + 1))).toBeLessThanOrEqual(1);
      }
    }
    expect(of.blocks.every((b, i, a) => i === 0 || a[i - 1]!.y <= b.y)).toBe(true);
    expect(new Set(of.blocks.map((b) => `${b.x},${b.y},${b.z}`)).size).toBe(of.blocks.length);
    expect(of.tansuItems.reduce((n, t) => n + t.count, 0)).toBe(8);
    for (const b of of.blocks) if (b.id === 'kakashi') expect(w2.getBlock(b.x, b.y, b.z)).toBe('kakashi');
    const bx = of.box;
    for (let z = bx.z0; z <= bx.z1; z++) for (let x = bx.x0; x <= bx.x1; x++) for (let y = 1; y < 48; y++) expect(['log', 'leaves', 'water']).not.toContain(w2.getBlock(x, y, z));
    let trunks = 0;
    let near = 0;
    for (let z = 0; z < 128; z++) for (let x = 0; x < 128; x++) for (let y = 1; y < 47; y++) {
      if (w2.getBlock(x, y, z) === 'log' && w2.getBlock(x, y - 1, z) !== 'log') {
        trunks++;
        if (Math.hypot(x - 64, z - 64) <= 12) near++;
      }
    }
    expect(trunks).toBeGreaterThanOrEqual(70);
    expect(near).toBeGreaterThanOrEqual(3);
    void R;
  });
});
