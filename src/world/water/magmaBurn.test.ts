import { describe, expect, it } from 'vitest';
import { MAGMA_TUNING, magmaBoilsAt } from '../blocks/liquids';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { attach } from './waterTestKit';

/**
 * WATERFALL-1 版 2: マグマに ふれた 固い ブロックが ゆっくり こげた ブロック（kogeta）に なる。ぐつぐつ マグマは 座標で きまる 見た目だけ。
 */
function pit(seed = 7): ReturnType<typeof attach> {
  const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
  w.fill(10, 0, 10, 20, 6, 20, 'stone');
  w.setBlock(15, 5, 15, 'air'); // 1 マスの あな（fill なので 起こさない）
  w.setBlock(15, 6, 15, 'air');
  const r = attach(w, seed);
  return r;
}
const kogetaAround = (w: ArrayVoxelWorld, x: number, y: number, z: number): number => {
  let n = 0;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]] as const) if (w.getBlock(x + dx, y + dy, z + dz) === 'kogeta') n++;
  return n;
};

describe('こげた ブロック', () => {
  it('あなの マグマの まわりの いしが 時間と ともに こげる（5 マス: 下と 北東南西）', () => {
    const r = pit();
    r.sys.magma.set(15, 5, 15, 8);
    r.step(MAGMA_TUNING.burnEvery * 2);
    const early = kogetaAround(r.world, 15, 5, 15);
    r.step(MAGMA_TUNING.burnEvery * 200);
    expect(early).toBeLessThan(5);
    expect(kogetaAround(r.world, 15, 5, 15)).toBe(5);
    expect(r.sys.magma.amount(15, 5, 15)).toBe(8); // マグマは へらない
  });
  it('同じ seed なら 同じ 順で こげる（決まった 確率）', () => {
    const trace = (seed: number): string => {
      const r = pit(seed);
      r.sys.magma.set(15, 5, 15, 8);
      const out: number[] = [];
      for (let i = 0; i < 40; i++) {
        r.step(MAGMA_TUNING.burnEvery);
        out.push(kogetaAround(r.world, 15, 5, 15));
      }
      return out.join(',');
    };
    expect(trace(3)).toBe(trace(3));
  });
  it('こくようせき・わきみず・たきつぼ・こげた ブロック・こわれない ブロックは こげない', () => {
    const r = pit();
    r.world.setBlock(16, 5, 15, 'kokuyouseki');
    r.world.setBlock(14, 5, 15, 'wakimizu');
    r.world.setBlock(15, 5, 16, 'takitsubo');
    r.world.setBlock(15, 5, 14, 'bedrock');
    r.sys.magma.set(15, 5, 15, 8);
    r.step(MAGMA_TUNING.burnEvery * 300);
    expect(r.world.getBlock(16, 5, 15)).toBe('kokuyouseki');
    expect(r.world.getBlock(14, 5, 15)).toBe('wakimizu');
    expect(r.world.getBlock(15, 5, 16)).toBe('takitsubo');
    expect(r.world.getBlock(15, 5, 14)).toBe('bedrock');
    expect(r.world.getBlock(15, 4, 15)).toBe('kogeta');
  });
  it('マグマを とれば もう こげない', () => {
    const r = pit();
    r.sys.magma.set(15, 5, 15, 8);
    r.step(MAGMA_TUNING.burnEvery);
    r.world.setBlock(15, 5, 15, 'stone');
    const before = kogetaAround(r.world, 15, 5, 15);
    r.step(MAGMA_TUNING.burnEvery * 200);
    expect(kogetaAround(r.world, 15, 5, 15)).toBe(before);
  });
});

describe('ぐつぐつ マグマ（見た目だけ）', () => {
  it('座標で きまり、だいたい boilChance の わりあい', () => {
    let n = 0;
    for (let x = 0; x < 100; x++) for (let z = 0; z < 100; z++) if (magmaBoilsAt(x, 5, z)) n++;
    expect(magmaBoilsAt(3, 5, 9)).toBe(magmaBoilsAt(3, 5, 9));
    expect(n / 10000).toBeGreaterThan(MAGMA_TUNING.boilChance - 0.03);
    expect(n / 10000).toBeLessThan(MAGMA_TUNING.boilChance + 0.03);
  });
});
