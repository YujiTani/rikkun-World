import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { watchBlocks, type BlockWatcher, type WatchableWorld } from './blockWatch';
import { ArchitectManager } from './manager';
import type { HouseRecord } from './talk';

/** 世界の setBlock・fill を 包んで、かわった 列を 建築士さんの 一覧に 知らせる（#355。農業の `farm.onBlockChanged` と 同じ 流れ） */

type Log = string[];

/** `this` を 使う（包んだ あとも 世界に 結びつけて 呼ぶ ことを たしかめる）小さな 世界。x が 負なら 置けない・0 マスの fill */
function fakeWorld(log: Log): WatchableWorld & { tag: string } {
  return {
    tag: 'w',
    setBlock(this: { tag: string }, x: number, y: number, z: number, id: BlockId): boolean {
      log.push(`set ${this.tag} ${x},${y},${z} ${id}`);
      return x >= 0;
    },
    fill(this: { tag: string }, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: BlockId): number {
      log.push(`fill ${this.tag} ${x0},${y0},${z0} ${x1},${y1},${z1} ${id}`);
      return x0 >= 0 ? 7 : 0;
    },
  };
}

function watcher(log: Log): BlockWatcher {
  return {
    blockChanged: (x, z) => log.push(`changed ${x},${z}`),
    blocksChanged: (x0, z0, x1, z1) => log.push(`box ${x0},${z0} ${x1},${z1}`),
  };
}

describe('watchBlocks', () => {
  it('置けたら その 列を 知らせる。元の setBlock の 答えを そのまま 返す。元の 呼び出しは そのまま とおる', () => {
    const log: Log = [];
    const w = fakeWorld(log);
    watchBlocks(w, watcher(log));
    expect(w.setBlock(3, 10, 4, 'stone')).toBe(true);
    expect(log).toEqual(['set w 3,10,4 stone', 'changed 3,4']);
  });

  it('置けなかった（false）ときは 知らせない', () => {
    const log: Log = [];
    const w = fakeWorld(log);
    watchBlocks(w, watcher(log));
    expect(w.setBlock(-1, 10, 4, 'stone')).toBe(false);
    expect(log).toEqual(['set w -1,10,4 stone']);
  });

  it('fill: 1 マス以上 かえたら 箱を 知らせる。数を そのまま 返す。0 マスなら 知らせない', () => {
    const log: Log = [];
    const w = fakeWorld(log);
    watchBlocks(w, watcher(log));
    expect(w.fill(1, 2, 3, 4, 5, 6, 'air')).toBe(7);
    expect(w.fill(-1, 2, 3, 4, 5, 6, 'air')).toBe(0);
    expect(log).toEqual(['fill w 1,2,3 4,5,6 air', 'box 1,3 4,6', 'fill w -1,2,3 4,5,6 air']);
  });

  it('先に 包んで ある 関数（農業の 知らせ など）の 上に かさねても 両方 呼ばれる', () => {
    const log: Log = [];
    const w = fakeWorld(log);
    const inner = w.setBlock.bind(w);
    w.setBlock = (x, y, z, id) => {
      log.push('farm');
      return inner(x, y, z, id);
    };
    watchBlocks(w, watcher(log));
    w.setBlock(2, 3, 4, 'air');
    expect(log).toEqual(['farm', 'set w 2,3,4 air', 'changed 2,4']);
  });
});

/** ゲームの つなぎ（src/game/wire/house.ts の `watchBlocks(world, house.manager)`）と 同じ: 本物の 世界に watchBlocks と ArchitectManager を つなぐ */
describe('本物の VoxelWorld に つなぐ', () => {
  const SPAWN = { x: 64.5, z: 64.5, yawDeg: 0 };

  function build(watch: (world: ArrayVoxelWorld, m: ArchitectManager) => void = (world, m) => watchBlocks(world, m)) {
    const world = new ArrayVoxelWorld({ x: 160, y: 24, z: 160 });
    world.fill(0, 0, 0, 159, 8, 159, 'stone'); // 地面の 上面 y = 8 → 立つ 高さ 9
    const record: HouseRecord = { toolsGiven: false, fudeGiven: false, first: null };
    const player = { x: SPAWN.x, y: 9, z: SPAWN.z };
    const m = new ArchitectManager({ seed: 4242, world, spawn: () => SPAWN, record, player: () => player, isLand: () => true });
    watch(world, m);
    return { world, m };
  }

  /** 最初の 建築士さんを 出して、足もとを おぼえさせる（はじめの 立ちどまりは 60 ステップ いじょう。この 試験は その 間に おわる） */
  function standing(watch?: Parameters<typeof build>[0]) {
    const { world, m } = build(watch);
    m.update();
    m.update();
    const a = m.get('first')!;
    expect(a.y).toBe(9);
    return { world, m, a, cx: Math.floor(a.x), cz: Math.floor(a.z) };
  }

  it('足もとを ほると 次の ステップで 落ちはじめ、石を 置くと 次の ステップで のぼりはじめる。箱（fill）でも', () => {
    const { world, m, a, cx, cz } = standing();
    // 1 マス ほる
    expect(world.setBlock(cx, 8, cz, 'air')).toBe(true);
    m.update();
    expect(a.y, 'ほった 次の ステップで 落ちはじめる').toBeLessThan(9);
    for (let i = 0; i < 6; i++) m.update();
    expect(a.y).toBeCloseTo(8, 5);
    // 石を 置く（もとの 高さに もどす）
    expect(world.setBlock(cx, 8, cz, 'stone')).toBe(true);
    m.update();
    expect(a.y, '置いた 次の ステップで のぼりはじめる').toBeGreaterThan(8);
    for (let i = 0; i < 12; i++) m.update();
    expect(a.y).toBeCloseTo(9, 5);
    // もう 1 つ 置く（1 だん 高く）
    expect(world.setBlock(cx, 9, cz, 'stone')).toBe(true);
    m.update();
    expect(a.y).toBeGreaterThan(9);
    for (let i = 0; i < 12; i++) m.update();
    expect(a.y).toBeCloseTo(10, 5);
    // 箱で ほる（角の 順が ぎゃく・小数）
    expect(world.fill(cx + 1.2, 9, cz + 1.2, cx - 1.2, 9, cz - 1.2, 'air')).toBeGreaterThan(0);
    m.update();
    expect(a.y, 'fill で ほった 次の ステップで 落ちはじめる').toBeLessThan(10);
    for (let i = 0; i < 12; i++) m.update();
    expect(a.y).toBeCloseTo(9, 5);
    // 箱で 高く する（3 × 3 を 1 だん）
    expect(world.fill(cx - 1, 9, cz - 1, cx + 1, 9, cz + 1, 'stone')).toBeGreaterThan(0);
    m.update();
    expect(a.y, 'fill で 置いた 次の ステップで のぼりはじめる').toBeGreaterThan(9);
  });

  it('つながないと 気づかない（この つなぎが 足もとを 知らせて いる）', () => {
    const { world, m, a, cx, cz } = standing(() => undefined);
    world.setBlock(cx, 8, cz, 'air');
    for (let i = 0; i < 6; i++) m.update();
    expect(a.y, '知らせが ない ので 立って いる 間は しらべなおさない').toBe(9);
  });

  it('読みこまれて いない 所への setBlock は false で、知らせない。置けた 所は 列を 知らせる', () => {
    const log: string[] = [];
    const { world, m } = build((w, mm) =>
      watchBlocks(w, {
        blockChanged: (x, z) => {
          log.push(`${x},${z}`);
          mm.blockChanged(x, z);
        },
        blocksChanged: (x0, z0, x1, z1) => mm.blocksChanged(x0, z0, x1, z1),
      }),
    );
    m.update();
    expect(world.setBlock(5000, 8, 5000, 'air')).toBe(false);
    expect(log).toEqual([]);
    expect(world.setBlock(10, 8, 10, 'air')).toBe(true);
    expect(log).toEqual(['10,10']);
  });
});
