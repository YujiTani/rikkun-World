import { describe, expect, it } from 'vitest';
import { SEA_Y } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { populateWorld } from './populate';
import { regionRect } from './region';
import { createWorldInfo } from './worldInfo';

const SEEDS = [20261012, 1, 2, 3, 4, 5];

describe.each(SEEDS)('仮の regions seed=%i（VOX-B 基準 23。R は VOX-D G1）', (seed) => {
  const w = new ArrayVoxelWorld({ x: 0, z: 0 });
  const info = populateWorld(w, seed);
  const R = info.regions();
  const sp = info.spawn();
  const Rr = regionRect(seed);
  const inCircle = (c: { cx: number; cz: number; r: number }) => Math.hypot(sp.x - 0.5 - c.cx, sp.z - 0.5 - c.cz) <= c.r;

  it('形は WorldRegions のまま。center・startH0・meadow・spring/pond/river', () => {
    expect(R.center).toEqual({ x: Math.floor(sp.x), z: Math.floor(sp.z) });
    expect(R.startH0).toBe(Math.floor(sp.y) - 1);
    expect(R.meadow).toEqual({ cx: R.center.x, cz: R.center.z + 32, r: 12 });
    expect(R.spring.r).toBe(0);
    expect(R.pond.r).toBe(0);
    expect(R.river).toEqual([]);
    expect(R.mountain.r).toBe(18);
    expect(R.forest.r).toBe(12);
  });

  it('スタートは 山・森・岩山・めいろの円に はじめから 入っていない（「はじめて やま に きた」が すぐ出ない）', () => {
    expect(inCircle(R.mountain)).toBe(false);
    expect(inCircle(R.forest)).toBe(false);
    expect(inCircle(R.rock)).toBe(false);
    expect(inCircle(R.meadow)).toBe(false);
  });

  it('R は スタートのまわり 128×128（G1）', () => {
    expect(Rr).toEqual({ x0: R.center.x - 64, z0: R.center.z - 64, x1: R.center.x + 64, z1: R.center.z + 64 });
  });

  it('山の頂上は R（はしから 16 より内）の 地面の列で、その高さ', () => {
    const p = R.mountain.peak;
    expect(p.x).toBeGreaterThanOrEqual(Rr.x0 + 16);
    expect(p.x).toBeLessThan(Rr.x1 - 16);
    expect(p.z).toBeGreaterThanOrEqual(Rr.z0 + 16);
    expect(p.z).toBeLessThan(Rr.z1 - 16);
    expect(info.groundHeight(p.x, p.z)).toBe(p.h);
  });

  it('読みこんでいなくても 同じ答え（ブロックを読みこまずに 高さだけで出す。G2・G6）', () => {
    const empty = new ArrayVoxelWorld({ x: 0, z: 0 });
    const info2 = createWorldInfo(seed, empty);
    expect(info2.regions()).toEqual(R);
    expect(info2.caveMouths()).toEqual(info.caveMouths());
    expect(info2.spawn()).toEqual(sp);
    expect(empty.columnCount()).toBe(0);
  });

  it('平らな所（24×20）は 陸で、スタートの 5×5・岩山・テスト場所と 重ならない', () => {
    const f = R.flat;
    expect(f.x1 - f.x0 + 1).toBe(24);
    expect(f.z1 - f.z0 + 1).toBe(20);
    let lo = 1e9;
    for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) lo = Math.min(lo, info.groundHeight(x, z));
    expect(lo).toBeGreaterThanOrEqual(SEA_Y + 2);
    const ov = (a: { x0: number; x1: number; z0: number; z1: number }) => a.x0 <= f.x1 && a.x1 >= f.x0 && a.z0 <= f.z1 && a.z1 >= f.z0;
    expect(ov({ x0: R.center.x - 2, x1: R.center.x + 2, z0: R.center.z - 2, z1: R.center.z + 2 })).toBe(false);
    expect(ov({ x0: 0, x1: 12, z0: 0, z1: 12 })).toBe(false);
    expect(f.x0).toBeGreaterThanOrEqual(Rr.x0 + 1);
    expect(f.x1).toBeLessThan(Rr.x1);
    expect(ov({ x0: R.rock.cx - R.rock.r, x1: R.rock.cx + R.rock.r, z0: R.rock.cz - R.rock.r, z1: R.rock.cz + R.rock.r })).toBe(false);
  });

  it('hook 用の値: 海面・たいまつ・読みこんだ列・生成の記録', () => {
    const n = ((Rr.x1 - 1) >> 4) - (Rr.x0 >> 4) + 1;
    const m = ((Rr.z1 - 1) >> 4) - (Rr.z0 >> 4) + 1;
    expect(info.seaY()).toBe(SEA_Y);
    expect(info.loadedChunks()).toHaveLength(n * m);
    const t = info.startTorch();
    expect(w.getBlock(t.x, t.y, t.z)).toBe('start_torch');
    expect(info.genStats().columns).toBe(n * m);
    expect(info.spawnInfo().fallback).toBe(false);
    expect(info.terrainAt(-5000, -5000).h).toBeGreaterThanOrEqual(SEA_Y - 30);
    expect(info.genHash(-313, -313)).toBe(info.genHash(-313, -313));
  });
});
