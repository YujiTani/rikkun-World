import { describe, expect, it } from 'vitest';
import type { BlockId } from '../contracts';
import { watchBlocks, type BlockWatcher, type WatchableWorld } from './blockWatch';

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
