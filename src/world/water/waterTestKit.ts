import { createWorkHook, type WorkHook } from '../../debug/workHook';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { createWaterSystem, type WaterSystem } from './waterSystem';

/**
 * WATER-1 の ユニット（waterFlow・waterWake）が 使う 道具。テストは「小さな 世界の 中で 石の 箱を 作って 確かめる」（仕様 §6）。
 *
 * ## テストが 期待する つなぎ目の 約束（実装の まえに 決めた。名前を かえる ときは この ファイルだけ 直す。テストの 期待は かえない）
 * - `createWaterSystem({ world, tick })`（`src/world/water/waterSystem.ts`）→ `WaterSystem`
 *   - 作った とき `world` の setBlock に 「起こす フック」を つなぐ（§4.3）。`world.fill` では 起こさない。
 *   - 窓口 `__rikkun.water`（§6.1）と 同じ 名前: `set`・`amount`・`queue`・`passes`・`total`・`stable`・`pause`・`waveTime`
 *   - `update()` … ゲームの 1 ステップごとに 1 回（`tick()` が `waterTickSteps` で わりきれる ステップに パスを する）
 *   - `computed()` … これまでに 計算した マスの 数（ふえる だけ）。`work.read().water` の もと
 *   - `onColumnLoaded(cx, cz, how)` … 列を 読みこんだ（`how` は `ChunkStream.install` の 'generated' | 'saved'）。`world.loadColumn` の あとに 呼ぶ
 *   - `onColumnUnloaded(cx, cz)` … 列を 手放した。`world.unloadColumn` の あとに 呼ぶ
 * - `createWorkHook(tick, target, waterComputed?)` … 3 つ目で 水の 計算した 数を わたすと `read().water` が その ふえ（#255）
 */

export type Box = readonly [x0: number, y0: number, z0: number, x1: number, y1: number, z1: number];

export interface Rig {
  world: ArrayVoxelWorld;
  sys: WaterSystem;
  work: WorkHook;
  /** ゲームの ステップを n 回（1 ステップ = tick を 1 ふやして sys.update()） */
  step(n?: number): void;
  /** パスを n 回 すすめる（ステップ番号の ずれに よらない）。リストが からに なったら そこで やめる */
  pass(n?: number): void;
  /** リストが からに なるまで パスを すすめる。かかった パスの 数（上限 max で やめる） */
  settle(max?: number): number;
}

/** 小さな 世界（x×y×z）と、水の 係と、ステップを すすめる 道具 */
export function makeRig(extent: { x: number; y: number; z: number } = { x: 48, y: 40, z: 48 }): Rig {
  const world = new ArrayVoxelWorld(extent);
  return attach(world);
}

/** 今ある 世界に 水の 係を つける（生成の 列を 読んだ 世界・読み直した 世界 用） */
export function attach(world: ArrayVoxelWorld): Rig {
  let tick = 0;
  const sys = createWaterSystem({ world, tick: () => tick });
  const work = createWorkHook(() => tick, world, () => sys.computed());
  const step = (n = 1): void => {
    for (let i = 0; i < n; i++) {
      tick++;
      sys.update();
    }
  };
  const pass = (n = 1): void => {
    for (let k = 0; k < n; k++) {
      if (sys.queue() === 0) return;
      const target = sys.passes() + 1;
      for (let guard = 0; sys.passes() < target && guard < 1000; guard++) step(1);
    }
  };
  const settle = (max = 400): number => {
    let n = 0;
    while (sys.queue() > 0 && n < max) {
      pass(1);
      n++;
    }
    return n;
  };
  return { world, sys, work, step, pass, settle };
}

/** 石の かたまり `outer` を 作り、その 中の `inner` を 空気に する（水は 入れない。fill は 水を 起こさない） */
export function carve(world: ArrayVoxelWorld, outer: Box, inner: Box): void {
  world.fill(...outer, 'stone');
  world.fill(...inner, 'air');
}

/** 箱の 中の 量の 一覧（x → z → y の 順）。水でも air でも ない マスは −1 */
export function amounts(sys: WaterSystem, box: Box): number[] {
  const out: number[] = [];
  for (let y = box[1]; y <= box[4]; y++) for (let z = box[2]; z <= box[5]; z++) for (let x = box[0]; x <= box[3]; x++) out.push(sys.amount(x, y, z));
  return out;
}

/** 決まった 乱数（mulberry32）。0 以上 1 未満 */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
