import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { createWaterSystem } from '../water/waterSystem';
import { GEN_CONFIG as C } from './config';
import { columnHash, generateChunk } from './chunk';
import { LIQUID_POND_TUNING as T, type LiquidPond } from './liquidPonds';
import { terrainFor } from './terrain';

/**
 * MAGMA-SPAWN §4: 自然の 溶岩の いけ・マグマの 滝・水の 滝（かっぱの いけ と 同じ 作り）
 */
const SEEDS = [C.defaultSeed, 1, 2, 3, 7];

function load(seed: number, p: LiquidPond): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  for (let cz = (p.z0 - 4) >> 4; cz <= (p.z1 + 4) >> 4; cz++) for (let cx = (p.x0 - 4) >> 4; cx <= (p.x1 + 4) >> 4; cx++) w.loadColumn(generateChunk(seed, cx, cz));
  return w;
}

describe('はじめの そばの マグマの 滝', () => {
  it.each(SEEDS)('seed %i: かならず ある・広場の 外（はじめの 場所から 9 マス 以上）・マグマ', (seed) => {
    const t = terrainFor(seed);
    const p = t.liquid.nearSpawn();
    expect(p).not.toBeNull();
    const sp = t.spawn();
    const near = Math.max(Math.abs(sp.x - Math.max(p!.x0 - 1, Math.min(sp.x, p!.x1 + 1))), Math.abs(sp.z - Math.max(p!.z0 - 1, Math.min(sp.z, p!.z1 + 1))));
    expect(near).toBeGreaterThan(C.plaza.ringMax);
    expect(p!.liquid).toBe('magma');
  });
  it('いつもの 世界: 滝が 立ち、列の 中身に マグマ・マグマの わきみず・たきつぼ が ある', () => {
    const seed = C.defaultSeed;
    const p = terrainFor(seed).liquid.nearSpawn()!;
    expect(p.fall).not.toBeNull();
    const w = load(seed, p);
    const f = p.fall!;
    expect(w.getBlock(f.x, f.top, f.z)).toBe('magma_wakimizu');
    expect(w.getBlock(f.x, p.level - p.depth - 2, f.z - 1)).toBe('takitsubo');
    let magma = 0;
    for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) if (w.getBlock(x, p.level - 1, z) === 'magma') magma++;
    expect(magma).toBeGreaterThan(10);
  });
  it('マグマの 滝は たきつぼと つながって あふれない（量 かわらない）', () => {
    const seed = C.defaultSeed;
    const p = terrainFor(seed).liquid.nearSpawn()!;
    const w = load(seed, p);
    let tick = 0;
    const sys = createWaterSystem({ world: w, tick: () => tick, seed, springsIn: (cx, cz) => terrainFor(seed).liquid.pondsIn(cx * 16, cz * 16, cx * 16 + 15, cz * 16 + 15).some((q) => q.fall !== null) });
    for (let cz = (p.z0 - 4) >> 4; cz <= (p.z1 + 4) >> 4; cz++) for (let cx = (p.x0 - 4) >> 4; cx <= (p.x1 + 4) >> 4; cx++) sys.onColumnLoaded(cx, cz, 'generated');
    const f = p.fall!;
    expect(sys.springLink(f.x, f.top, f.z)).toEqual({ x: f.x, y: p.level - p.depth - 2, z: f.z - 1 });
    const box = [p.x0 - 3, p.level - p.depth - 2, p.z0 - 3, p.x1 + 3, f.top + 1, p.z1 + 3] as const;
    const t0 = sys.magma.total(...box);
    for (let i = 0; i < 45 * 200; i++) {
      tick++;
      sys.update();
    }
    expect(sys.magma.total(...box)).toBe(t0);
    // へりの 外に マグマが 出て いない
    let outside = 0;
    for (let x = box[0]; x <= box[3]; x++) for (let z = box[2]; z <= box[5]; z++) if (terrainFor(seed).liquid.pondAt(x, z) === null && sys.magma.amount(x, p.level, z) > 0) outside++;
    expect(outside).toBe(0);
  });
});

describe('升目の いけ', () => {
  it('同じ シードなら 同じ・作る 順に よらない', () => {
    const a = terrainFor(1).liquid.ofCell(2, 3);
    expect(terrainFor(1).liquid.ofCell(2, 3)).toEqual(a);
    expect(columnHash(generateChunk(1, 10, 10))).toBe(columnHash(generateChunk(1, 10, 10)));
  });
  it('はじめの 場所から spawnClear より 内には 升目の いけが ない・しゅるいが 3 つとも 出る', () => {
    const kinds = new Set<string>();
    for (const seed of SEEDS) {
      const t = terrainFor(seed);
      const sp = t.spawn();
      for (let i = -6; i <= 6; i++) {
        for (let j = -6; j <= 6; j++) {
          const p = t.liquid.ofCell(i, j);
          if (p === null) continue;
          kinds.add(p.liquid + (p.fall ? '-fall' : ''));
          expect(Math.max(Math.abs(p.x0 - sp.x), Math.abs(p.z0 - sp.z))).toBeGreaterThan(T.spawnClear - T.width[1]);
        }
      }
    }
    for (const k of ['magma', 'magma-fall', 'water-fall']) expect(kinds.has(k), k).toBe(true); // 滝が 立たない 場所の 水は ただの いけ（'water'）
  });
});
