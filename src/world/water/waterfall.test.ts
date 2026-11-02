import { describe, expect, it } from 'vitest';
import { SPRING_TUNING } from '../blocks/liquids';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { springRoll } from './springs';
import { attach, carve, makeRig, type Box, type Rig } from './waterTestKit';

/**
 * WATERFALL-1（docs/design/WATERFALL-1.md §6）の ユニット: わきみず・たきつぼ（量が かわらない ポンプ）・マグマ（おそい 流れ・水で こくようせき）。
 * 場所は 石の 箱（床 y = 2、中は 9×9、高さ 14）。わきみずは 天井から 1 つ 下（y = 14）。北 = −z。
 */
const X = 15;
const Z = 15;
const FLOOR = 2;
const SY = FLOOR + 12;
const INNER: Box = [X - 4, FLOOR + 1, Z - 4, X + 4, FLOOR + 14, Z + 4];

function waterfallRig(): Rig {
  const r = makeRig({ x: 32, y: 24, z: 32 });
  carve(r.world, [X - 5, FLOOR, Z - 5, X + 5, FLOOR + 15, Z + 5], INNER);
  return r;
}

describe('わきみず', () => {
  it('置くと 0.25 秒（15 ステップ）ごとに 1 つぶ 出す（たきつぼが できる まで ふえる）', () => {
    const r = waterfallRig();
    r.world.setBlock(X, SY, Z, 'wakimizu');
    expect(r.sys.springCount()).toBe(1);
    r.step(15 * 4);
    expect(r.sys.total(...INNER)).toBe(4);
  });

  it('下が ふさがって いれば よこ（北 → 東 → 南 → 西）に 出す', () => {
    const r = waterfallRig();
    r.world.setBlock(X, FLOOR + 1, Z, 'wakimizu'); // 床の 上（下は 石）
    r.step(15);
    expect(r.sys.amount(X, FLOOR + 1, Z - 1)).toBe(1);
  });

  it('こわすと 止まる', () => {
    const r = waterfallRig();
    r.world.setBlock(X, SY, Z, 'wakimizu');
    r.step(30);
    r.world.setBlock(X, SY, Z, 'air');
    expect(r.sys.springCount()).toBe(0);
    const before = r.sys.total(...INNER);
    r.step(150);
    expect(r.sys.total(...INNER)).toBe(before);
  });
});

describe('たきつぼ', () => {
  it('水が 落ちた 床に たきつぼが でき、そのあとは 合計が かわらない（あふれない・かれない）。水は 少し たまる', () => {
    const r = waterfallRig();
    r.world.setBlock(X, SY, Z, 'wakimizu');
    let formedAt = -1;
    for (let s = 0; s < 15 * 400 && formedAt < 0; s++) {
      r.step(1);
      if (r.world.getBlock(X, FLOOR, Z) === 'takitsubo') formedAt = s;
    }
    expect(formedAt, 'たきつぼが できた').toBeGreaterThan(0);
    expect(r.sys.springLink(X, SY, Z)).toEqual({ x: X, y: FLOOR, z: Z });
    const pooled = r.sys.total(...INNER);
    expect(pooled, 'できる まで 少し たまる').toBeGreaterThan(0);
    for (let k = 0; k < 40; k++) {
      r.step(15 * 5);
      expect(r.sys.total(...INNER), `合計 ${k}`).toBe(pooled);
    }
    // ずっと 流れて いる: 出口の 下の 列に 水が ある
    let column = 0;
    for (let y = FLOOR + 1; y < SY; y++) if (r.sys.amount(X, y, Z) > 0) column++;
    expect(column, "列が とぎれない").toBe(SY - 1 - FLOOR);
  });

  it('シードが 同じ なら 同じ ステップで できる（乱数は シード つき）', () => {
    const at = (seed: number): number => {
      const world = new ArrayVoxelWorld({ x: 32, y: 24, z: 32 });
      carve(world, [X - 5, FLOOR, Z - 5, X + 5, FLOOR + 15, Z + 5], INNER);
      const r = attach(world, seed);
      r.world.setBlock(X, SY, Z, 'wakimizu');
      for (let s = 0; s < 15 * 600; s++) {
        r.step(1);
        if (r.world.getBlock(X, FLOOR, Z) === 'takitsubo') return s;
      }
      return -1;
    };
    expect(at(7)).toBe(at(7));
    const seeds = [1, 2, 3, 4, 5].map(at);
    expect(new Set(seeds).size, 'シードで かわる').toBeGreaterThan(1);
  });

  it('確率 takiChance の 目安: 1 回ごとの 当たりの 割合が 0.05 前後', () => {
    let hit = 0;
    for (let n = 1; n <= 20000; n++) if (springRoll(42, 1, 2, 3, n) < SPRING_TUNING.takiChance) hit++;
    expect(hit / 20000).toBeGreaterThan(0.04);
    expect(hit / 20000).toBeLessThan(0.06);
  });

  it('手で 置いた 2 つ（わきみずの 真下の 床が たきつぼ）でも つながる（自然生成も 同じ 置き方で 動く）', () => {
    const r = waterfallRig();
    r.world.setBlock(X, FLOOR, Z, 'takitsubo');
    r.world.setBlock(X, SY, Z, 'wakimizu');
    expect(r.sys.springLink(X, SY, Z)).toEqual({ x: X, y: FLOOR, z: Z });
    r.sys.set(X, FLOOR + 1, Z, 8); // たまり 8 つぶ
    r.step(15 * 200);
    expect(r.sys.total(...INNER)).toBe(8);
  });

  it('床が takiReach（32）より 深いと つながらない・できない', () => {
    const r = makeRig({ x: 16, y: 48, z: 16 });
    carve(r.world, [4, 0, 4, 6, 44, 6], [5, 1, 5, 5, 44, 5]);
    r.world.setBlock(5, 1, 5, 'takitsubo'); // わきみず y = 43 → 出口 42 → 床 1 は 41 マス 下
    r.world.setBlock(5, 43, 5, 'wakimizu');
    expect(r.sys.springLink(5, 43, 5)).toBeNull();
  });
});

describe('マグマ', () => {
  it('水より おそい（45 ステップ = 0.75 秒ごと）・よこは 2 マスまで さがす', () => {
    const r = waterfallRig();
    r.sys.magma.set(X, FLOOR + 6, Z, 8);
    r.step(44);
    expect(r.sys.magma.amount(X, FLOOR + 6, Z)).toBe(8);
    r.step(1);
    expect(r.sys.magma.amount(X, FLOOR + 5, Z)).toBe(8);
  });

  it('平らな 床で ひろがっても 合計は かわらない', () => {
    const r = waterfallRig();
    r.sys.magma.set(X, FLOOR + 1, Z, 8);
    r.step(45 * 60);
    expect(r.sys.magma.total(...INNER)).toBe(8);
    expect(r.sys.magma.amount(X, FLOOR + 1, Z)).toBeLessThan(8);
  });

  it('水に ふれると こくようせきに なる（水は へらない）', () => {
    const r = waterfallRig();
    r.sys.set(X + 1, FLOOR + 1, Z, 8);
    r.step(15 * 40);
    const water = r.sys.total(...INNER);
    r.sys.magma.set(X - 1, FLOOR + 3, Z, 8); // 上から 落ちて 水の そばへ
    r.step(45 * 40);
    let obsidian = 0;
    for (let y = FLOOR + 1; y <= FLOOR + 3; y++) for (let z = Z - 4; z <= Z + 4; z++) for (let x = X - 4; x <= X + 4; x++) if (r.world.getBlock(x, y, z) === 'kokuyouseki') obsidian++;
    expect(obsidian).toBeGreaterThan(0);
    expect(r.sys.total(...INNER)).toBe(water);
  });

  it('マグマの わきみずは マグマを 出す', () => {
    const r = waterfallRig();
    r.world.setBlock(X, SY, Z, 'magma_wakimizu');
    r.step(45 * 3);
    expect(r.sys.magma.total(...INNER)).toBe(3);
  });

  it('マグマの マスに ブロックを 置くと 押し出される（量は へらない）', () => {
    const r = waterfallRig();
    r.sys.magma.set(X, FLOOR + 1, Z, 4);
    r.world.setBlock(X, FLOOR + 1, Z, 'stone');
    expect(r.sys.magma.total(...INNER)).toBe(4);
  });
});
