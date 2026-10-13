import { describe, expect, it } from 'vitest';
import { Sprinklers } from './sprinkler';
import { ArrayVoxelWorld } from '../world/VoxelWorld';
import { OPACITY } from '../world/light/opacity';
import { BLOCK_INDEX } from '../world/blocks/blockTypes';

describe('Sprinklers.covers（AC9）', () => {
  it('5×5・sy−2 ≤ y ≤ sy だけ（AC9 の 7×7）', () => {
    const s = new Sprinklers();
    s.onBlockChanged(10, 13, 10, 'air', 'sprinkler');
    let n = 0;
    for (let x = 7; x <= 13; x++) for (let z = 7; z <= 13; z++) if (s.covers(x, 12, z)) n++;
    expect(n).toBe(25);
    expect(s.covers(10, 12, 10)).toBe(true); // 真下
    expect(s.covers(12, 12, 12)).toBe(true);
    expect(s.covers(13, 12, 10)).toBe(false);
  });
  it('高さ: y=11・12・13 は 入る、y=10（sy−3）・y=14（sy+1）は 入らない', () => {
    const s = new Sprinklers();
    s.onBlockChanged(5, 13, 5, 'air', 'sprinkler');
    expect([11, 12, 13].map((y) => s.covers(7, y, 5))).toEqual([true, true, true]);
    expect([10, 14].map((y) => s.covers(7, y, 5))).toEqual([false, false]);
  });
  it('こわすと 外れる。list に 入る。おなじ 場所 を 2 回 おいても 1 こ', () => {
    const s = new Sprinklers();
    s.onBlockChanged(5, 13, 5, 'air', 'sprinkler');
    s.onBlockChanged(5, 13, 5, 'air', 'sprinkler');
    expect(s.list()).toEqual([{ x: 5, y: 13, z: 5 }]);
    s.onBlockChanged(5, 13, 5, 'sprinkler', 'air');
    expect(s.list()).toEqual([]);
    expect(s.covers(5, 12, 5)).toBe(false);
  });
  it('2 こ の はんい が かさなる所: 1 こ こわしても もう 1 この はんい は のこる', () => {
    const s = new Sprinklers();
    s.onBlockChanged(5, 13, 5, 'air', 'sprinkler');
    s.onBlockChanged(7, 13, 5, 'air', 'sprinkler');
    s.onBlockChanged(5, 13, 5, 'sprinkler', 'air');
    expect(s.covers(6, 12, 5)).toBe(true);
    expect(s.covers(3, 12, 5)).toBe(false);
  });
  it('はんい は 設定（farmSprinklerRadius）に 合わせる', () => {
    let r = 1;
    const s = new Sprinklers({ radius: () => r });
    s.onBlockChanged(5, 13, 5, 'air', 'sprinkler');
    expect(s.covers(7, 13, 5)).toBe(false);
    r = 2;
    expect(s.covers(7, 13, 5)).toBe(true);
  });
  it('rescan は 世界 から さがし直す', () => {
    const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
    w.setBlock(3, 5, 4, 'sprinkler');
    w.setBlock(9, 6, 9, 'sprinkler');
    const s = new Sprinklers();
    s.onBlockChanged(1, 1, 1, 'air', 'sprinkler');
    s.rescan(w);
    expect(s.list()).toEqual([
      { x: 3, y: 5, z: 4 },
      { x: 9, y: 6, z: 9 },
    ]);
    expect(s.covers(3, 4, 4)).toBe(true);
    expect(s.covers(1, 0, 1)).toBe(false);
  });
});

describe('スプリンクラー は 光を 通す（AC11 の もと）', () => {
  it('OPACITY は 0（固いが 光は 通る）', () => {
    expect(OPACITY[BLOCK_INDEX.sprinkler]).toBe(0);
  });
});
