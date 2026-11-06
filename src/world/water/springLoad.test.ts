import { describe, expect, it } from 'vitest';
import { SPRING_TUNING } from '../blocks/liquids';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { createWaterSystem } from './waterSystem';

/**
 * WAKIDOKORO §10: わきどころが たくさん ある ときの 重さ（ベンチ ＋ 上限の きまり）。
 * 80×40×80 の 世界、床（y 0〜2 いし）の 上 y = 12 に わきどころを 32 マス 以内に ならべ、プレイヤー（まん中）の そばで 60 秒（3600 ステップ）。
 * はかる もの: 1 ステップの 時間（ms、平均・いちばん 重い）、1 ステップの getIndex の 数（平均）。上限 なし と 上限（SPRING_TUNING.maxActive）で くらべる。
 * 時間は 機械で かわるので 数（getIndex）で しらべる。数は ログ（BENCH）に 出す（レポート用）。
 */
const C = 40;
const SY = 12;

function bench(n: number, cap: number, steps = 3600, magma = false): { msAvg: number; msMax: number; readsAvg: number; writesAvg: number; active: number } {
  const world = new ArrayVoxelWorld({ x: 80, y: 40, z: 80 });
  world.fill(0, 0, 0, 79, 2, 79, 'stone');
  let reads = 0;
  let writes = 0;
  const rawSet = world.setBlock.bind(world);
  world.setBlock = (x: number, y: number, z: number, id: Parameters<typeof rawSet>[3]): boolean => {
    writes++;
    return rawSet(x, y, z, id);
  };
  const raw = world.getIndex.bind(world);
  world.getIndex = (x: number, y: number, z: number): number => {
    reads++;
    return raw(x, y, z);
  };
  let tick = 0;
  const sys = createWaterSystem({ world, tick: () => tick, seed: 1, springCap: cap });
  sys.setFocus(() => ({ x: C + 0.5, z: C + 0.5 }));
  // 32 マス 以内に 4 マス おきに ならべる（16×16 = 256 か所から 前から n こ）
  let k = 0;
  for (let dz = -30; dz <= 30 && k < n; dz += 4) for (let dx = -30; dx <= 30 && k < n; dx += 4, k++) world.setBlock(C + dx, SY, C + dz, magma ? 'magma_wakimizu' : 'wakimizu');
  let total = 0;
  let max = 0;
  let active = 0;
  reads = 0;
  writes = 0;
  for (let i = 0; i < steps; i++) {
    tick++;
    const t0 = performance.now();
    sys.update();
    const dt = performance.now() - t0;
    total += dt;
    if (dt > max) max = dt;
    active = Math.max(active, sys.springActive());
  }
  return { msAvg: total / steps, msMax: max, readsAvg: reads / steps, writesAvg: writes / steps, active };
}

describe('WAKIDOKORO §10 わきどころ たくさんの 重さ', () => {
  it('ベンチ: 50・100・200 こ（水）。上限 なし と 上限 あり', () => {
    const rows: string[] = [];
    const capped: Record<number, number> = {};
    const free: Record<number, number> = {};
    for (const n of [50, 100, 200]) {
      const a = bench(n, Infinity);
      const b = bench(n, SPRING_TUNING.maxActive);
      free[n] = a.readsAvg;
      capped[n] = b.readsAvg;
      rows.push(`BENCH water n=${n} nocap: ${a.msAvg.toFixed(3)}ms avg / ${a.msMax.toFixed(1)}ms max / ${Math.round(a.readsAvg)} getIndex/step / ${a.writesAvg.toFixed(1)} setBlock/step (active ${a.active}) | cap ${SPRING_TUNING.maxActive}: ${b.msAvg.toFixed(3)}ms / ${b.msMax.toFixed(1)}ms / ${Math.round(b.readsAvg)} getIndex/step / ${b.writesAvg.toFixed(1)} setBlock/step (active ${b.active})`);
      expect(b.active).toBeLessThanOrEqual(SPRING_TUNING.maxActive);
      if (n >= SPRING_TUNING.maxActive) expect(b.writesAvg, '上限で 書く 数も へる').toBeLessThanOrEqual(a.writesAvg);
    }
    const m = bench(200, SPRING_TUNING.maxActive, 3600, true);
    rows.push(`BENCH magma n=200 cap ${SPRING_TUNING.maxActive}: ${m.msAvg.toFixed(3)}ms / ${m.msMax.toFixed(1)}ms / ${Math.round(m.readsAvg)} getIndex/step / ${m.writesAvg.toFixed(1)} setBlock/step`);
    console.log(rows.join('\n'));
    if (process.env.BENCH_OUT) require('node:fs').writeFileSync(process.env.BENCH_OUT, rows.join('\n') + '\n');
    // 上限が きく: 200 こ でも 上限 あり の 仕事は 上限 なし の 仕事より すくない
    expect(capped[200]).toBeLessThan(free[200]);
  }, 300_000);

  it('上限を こえると プレイヤーに 近い じゅんに 動かす（遠い ものから 止まる）', () => {
    const world = new ArrayVoxelWorld({ x: 80, y: 40, z: 80 });
    world.fill(0, 0, 0, 79, 2, 79, 'stone');
    let tick = 0;
    const sys = createWaterSystem({ world, tick: () => tick, seed: 1, springCap: 2 });
    sys.setFocus(() => ({ x: C + 0.5, z: C + 0.5 }));
    // 下を ふさいだ 空の たな（出口は よこ 4 つ）に 3 こ: 近い（2 マス）・中（6）・遠い（12）
    const at = [C + 2, C + 6, C + 12];
    for (const x of at) world.setBlock(x, 3, C, 'wakimizu');
    tick = SPRING_TUNING.waterEvery;
    sys.update();
    expect(sys.springActive()).toBe(2);
    expect(sys.amount(C + 2, 3, C - 1), '近い').toBe(1);
    expect(sys.amount(C + 6, 3, C - 1), '中').toBe(1);
    expect(sys.amount(C + 12, 3, C - 1), '遠い ものは 出さない').toBe(0);
  });

  it('さかいで ちらつかない: 動いて いた ものは capHold マス ぶん 近い あつかい', () => {
    const world = new ArrayVoxelWorld({ x: 80, y: 40, z: 80 });
    world.fill(0, 0, 0, 79, 2, 79, 'stone');
    let tick = 0;
    let fx = C + 0.5;
    const sys = createWaterSystem({ world, tick: () => tick, seed: 1, springCap: 1 });
    sys.setFocus(() => ({ x: fx, z: C + 0.5 }));
    world.setBlock(C - 5, 3, C, 'wakimizu'); // 西 5
    world.setBlock(C + 5, 3, C, 'wakimizu'); // 東 5（同じ 遠さ → 座標の じゅんで 西）
    const run = (): void => {
      tick += SPRING_TUNING.waterEvery;
      sys.update();
    };
    run();
    expect(sys.amount(C - 5, 3, C - 1), 'はじめは 西（同じ 遠さは 座標の じゅん）').toBe(1);
    // すこし 東へ（東が 1 マス 近く なる）。ゆとり 2 の 中なので 西の まま
    fx = C + 1.5;
    run();
    expect(sys.amount(C - 5, 3, C - 1)).toBe(2);
    expect(sys.amount(C + 5, 3, C - 1), 'ちらつかない').toBe(0);
    // ずっと 東へ（3 マス 以上 近い）→ 東に かわる
    fx = C + 4.5;
    run();
    expect(sys.amount(C + 5, 3, C - 1)).toBe(1);
  });
});
