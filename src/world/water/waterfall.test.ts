import { describe, expect, it } from 'vitest';
import { SPRING_TUNING } from '../blocks/liquids';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { springRoll } from './springs';
import { attach, carve, makeRig, type Box, type Rig } from './waterTestKit';

/**
 * WATERFALL-1（docs/design/WATERFALL-1.md §6）の ユニット: わきどころ・たきつぼ（量が かわらない ポンプ）・マグマ（おそい 流れ・水で こくようせき）。
 * 場所は 石の 箱（床 y = 2、中は 9×9、高さ 14）。わきどころは 天井から 1 つ 下（y = 14）。北 = −z。
 */
const X = 15;
const Z = 15;
const FLOOR = 2;
const SY = FLOOR + 12;
const INNER: Box = [X - 4, FLOOR + 1, Z - 4, X + 4, FLOOR + 14, Z + 4];

/** WAKIDOKORO §5: わきどころの 東西南北を いしで ふさぐ（下 だけに 出す。たきつぼの テスト用） */
function capSides(r: Rig, x: number, y: number, z: number): void {
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) r.world.setBlock(x + dx, y, z + dz, 'stone');
}

function waterfallRig(): Rig {
  const r = makeRig({ x: 32, y: 24, z: 32 });
  carve(r.world, [X - 5, FLOOR, Z - 5, X + 5, FLOOR + 15, Z + 5], INNER);
  return r;
}

describe('わきどころ', () => {
  it('置くと 0.25 秒（15 ステップ）ごとに 出口 1 つに 1 つぶ（ふさがない と 5 つの 出口 = 5 つぶ）', () => {
    const r = waterfallRig();
    r.world.setBlock(X, SY, Z, 'wakimizu');
    expect(r.sys.springCount()).toBe(1);
    r.step(15 * 4);
    expect(r.sys.total(...INNER)).toBe(20);
  });

  it('ふさいだ 方向には 出ない（下 だけ あいて いれば 1 つぶずつ）', () => {
    const r = waterfallRig();
    capSides(r, X, SY, Z);
    r.world.setBlock(X, SY, Z, 'wakimizu');
    r.step(15 * 4);
    expect(r.sys.total(...INNER)).toBe(4);
  });

  it('WAKIDOKORO §5: 下・北・東・南・西 の 5 方向 それぞれに 出る。上には 出ない', () => {
    const r = waterfallRig();
    r.world.setBlock(X, FLOOR + 6, Z, 'wakimizu');
    r.step(15);
    expect(r.sys.amount(X, FLOOR + 5, Z), '下').toBe(1);
    expect(r.sys.amount(X, FLOOR + 6, Z - 1), '北').toBe(1);
    expect(r.sys.amount(X + 1, FLOOR + 6, Z), '東').toBe(1);
    expect(r.sys.amount(X, FLOOR + 6, Z + 1), '南').toBe(1);
    expect(r.sys.amount(X - 1, FLOOR + 6, Z), '西').toBe(1);
    expect(r.sys.amount(X, FLOOR + 7, Z), '上').toBe(0);
  });

  it('下が ふさがって いれば よこ 4 方向 だけに 出す', () => {
    const r = waterfallRig();
    r.world.setBlock(X, FLOOR + 1, Z, 'wakimizu'); // 床の 上（下は 石）
    r.step(15);
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) expect(r.sys.amount(X + dx, FLOOR + 1, Z + dz)).toBe(1);
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
    capSides(r, X, SY, Z);
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
      capSides(r, X, SY, Z);
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

  it('手で 置いた 2 つ（わきどころの 真下の 床が たきつぼ）でも つながる（自然生成も 同じ 置き方で 動く）', () => {
    const r = waterfallRig();
    r.world.setBlock(X, FLOOR, Z, 'takitsubo');
    capSides(r, X, SY, Z);
    r.world.setBlock(X, SY, Z, 'wakimizu');
    expect(r.sys.springLink(X, SY, Z)).toEqual({ x: X, y: FLOOR, z: Z });
    r.sys.set(X, FLOOR + 1, Z, 8); // たまり 8 つぶ
    r.step(15 * 200);
    expect(r.sys.total(...INNER)).toBe(8);
  });

  it('床が takiReach（32）より 深いと つながらない・できない', () => {
    const r = makeRig({ x: 16, y: 48, z: 16 });
    carve(r.world, [4, 0, 4, 6, 44, 6], [5, 1, 5, 5, 44, 5]);
    r.world.setBlock(5, 1, 5, 'takitsubo'); // わきどころ y = 43 → 出口 42 → 床 1 は 41 マス 下
    r.world.setBlock(5, 43, 5, 'wakimizu');
    expect(r.sys.springLink(5, 43, 5)).toBeNull();
  });
});

describe('WAKIDOKORO §5.1 たきつぼが できる 落ちる 高さ（minFall 5）', () => {
  /** 落ちる 列が h マス（出口 〜 床の すぐ 上） 置き方（わきどころ y = FLOOR + h + 1 → 出口 FLOOR + h → 床 FLOOR）。たきつぼが できたか */
  const formsWithFall = (h: number, steps = 15 * 1500): boolean => {
    const r = waterfallRig();
    const sy = FLOOR + h + 1;
    capSides(r, X, sy, Z);
    r.world.setBlock(X, sy, Z, 'wakimizu');
    for (let s = 0; s < steps; s++) {
      r.step(1);
      if (r.world.getBlock(X, FLOOR, Z) === 'takitsubo') return true;
    }
    return false;
  };
  it('4 マス 落ちる だけ では できない', () => {
    expect(SPRING_TUNING.minFall).toBe(5);
    expect(formsWithFall(4)).toBe(false);
  });
  it('5 マス 落ちると できる', () => {
    expect(formsWithFall(5)).toBe(true);
  });
  it('階段の ように 1 マスずつ 流れる 水では できない', () => {
    // 階段: 段の 高さ 1。わきどころは いちばん 上の 段の 上（下が 段 = 出口は よこ）
    const r = waterfallRig();
    for (let k = 0; k < 8; k++) r.world.fill(X - 4, FLOOR + 1, Z - 4 + k, X + 4, FLOOR + 8 - k, Z - 4 + k, 'stone');
    const sy = FLOOR + 9;
    r.world.setBlock(X, sy, Z - 4, 'wakimizu');
    r.step(15 * 1500);
    let taki = 0;
    for (let y = FLOOR; y <= FLOOR + 9; y++) for (let z = Z - 4; z <= Z + 4; z++) for (let x = X - 4; x <= X + 4; x++) if (r.world.getBlock(x, y, z) === 'takitsubo') taki++;
    expect(taki).toBe(0);
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

  it('マグマの わきどころは マグマを 出す', () => {
    const r = waterfallRig();
    capSides(r, X, SY, Z);
    r.world.setBlock(X, SY, Z, 'magma_wakimizu');
    r.step(45 * 3);
    expect(r.sys.magma.total(...INNER)).toBe(3);
  });

  it('WAKIDOKORO §4: マグマの わきどころは マグマの たきつぼに つながる（量 かわらない）。ふつうの 水の たきつぼ には 水の わきどころ だけ', () => {
    const r = waterfallRig();
    r.world.setBlock(X, FLOOR, Z, 'magma_takitsubo');
    capSides(r, X, SY, Z);
    r.world.setBlock(X, SY, Z, 'magma_wakimizu');
    expect(r.sys.springLink(X, SY, Z)).toEqual({ x: X, y: FLOOR, z: Z });
    r.sys.magma.set(X, FLOOR + 1, Z, 8);
    r.step(45 * 120);
    expect(r.sys.magma.total(...INNER)).toBe(8);
    const w = waterfallRig();
    w.world.setBlock(X, FLOOR, Z, 'magma_takitsubo');
    capSides(w, X, SY, Z);
    w.world.setBlock(X, SY, Z, 'wakimizu');
    expect(w.sys.springLink(X, SY, Z), '水の わきどころ は マグマの たきつぼ に つながらない').toBeNull();
  });

  it('マグマの マスに ブロックを 置くと 押し出される（量は へらない）', () => {
    const r = waterfallRig();
    r.sys.magma.set(X, FLOOR + 1, Z, 4);
    r.world.setBlock(X, FLOOR + 1, Z, 'stone');
    expect(r.sys.magma.total(...INNER)).toBe(4);
  });
});
