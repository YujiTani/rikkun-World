import { describe, expect, it } from 'vitest';
import { fencePath, fencesFor, planFence, type FenceWorld } from './ropeFence';

/** ROPE-1 版 4: さくの みち（L 字・地面に そう・とまる・本数） */
function world(ground: (x: number, z: number) => number, wall = new Set<string>()): FenceWorld & { put(x: number, y: number, z: number): void } {
  const fence = new Set<string>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const solidAt = (x: number, y: number, z: number) => y <= ground(x, z) || wall.has(k(x, y, z)) || fence.has(k(x, y, z));
  return {
    open: (x, y, z) => !solidAt(x, y, z),
    solid: solidAt,
    fence: (x, y, z) => fence.has(k(x, y, z)),
    put: (x, y, z) => fence.add(k(x, y, z)),
  };
}
const flat = () => world(() => 8);
const S = { x: 0, y: 9, z: 0 };

describe('fencePath', () => {
  it('まっすぐ・L 字（さきに x）・くいの 列は ふくまない', () => {
    expect(fencePath(0, 0, 3, 0)).toEqual([[1, 0], [2, 0], [3, 0]]);
    expect(fencePath(0, 0, -2, 2)).toEqual([[-1, 0], [-2, 0], [-2, 1], [-2, 2]]);
    expect(fencePath(0, 0, 0, 0)).toEqual([]);
  });
});

describe('planFence', () => {
  it('たいら: ぜんぶ 地面の 上。本数は ⌈マス数 ÷ 5⌉（版 5）', () => {
    const p = planFence(S, 3, 4, 5, flat())!;
    expect(p.cells.map((c) => [c.x, c.y, c.z])).toEqual([[1, 9, 0], [2, 9, 0], [3, 9, 0], [3, 9, 1], [3, 9, 2], [3, 9, 3], [3, 9, 4]]);
    expect(p.used).toBe(2); // 7 マス ÷ 5 の 切り上げ
    expect(p.stop).toBeNull();
    expect(fencesFor(1)).toBe(1);
    expect(fencesFor(5)).toBe(1);
    expect(fencesFor(6)).toBe(2);
  });
  it('だんさ: 上 1・下 3 までは そう。それ より 高い かべ で とまる', () => {
    const steps = world((x) => (x === 2 ? 9 : x === 3 ? 6 : x >= 4 ? 12 : 8));
    const p = planFence(S, 6, 0, 5, steps)!;
    expect(p.cells.map((c) => [c.x, c.y])).toEqual([[1, 9], [2, 10], [3, 7]]);
    expect(p.stop).toBe('wall');
  });
  it('半径 5 を こえる マスで とまる（版 5）', () => {
    const p = planFence(S, 15, 0, 5, flat())!;
    expect(p.cells.length).toBe(5);
    expect(p.stop).toBe('radius');
    const d = planFence(S, 4, 4, 5, flat())!; // L 字の かど (4,0) から (4,3) まで: hypot(4,3)=5
    expect(d.cells.at(-1)).toEqual({ x: 4, y: 9, z: 3 });
    expect(d.stop).toBe('radius');
  });
  it('本数が 足りなければ 持って いる 本数 × 5 マス まで', () => {
    const p = planFence(S, 3, 3, 1, flat())!; // 6 マス ほしい・1 本
    expect(p.cells.length).toBe(5);
    expect(p.stop).toBe('ropes');
    expect(planFence(S, 5, 0, 1, flat())!.stop).toBeNull();
  });
  it('さく が ある 所は その 上に つむ（地面は さくの 下で はかる）', () => {
    const w = flat();
    w.put(1, 9, 0);
    w.put(2, 9, 0);
    w.put(2, 10, 0);
    const p = planFence(S, 3, 0, 1, w)!;
    expect(p.cells.map((c) => [c.x, c.y])).toEqual([[1, 10], [2, 11], [3, 9]]);
  });
  it('はじめの マスから 置けない なら null', () => {
    expect(planFence(S, 3, 0, 1, world((x) => (x >= 1 ? 15 : 8)))).toBeNull();
  });
});
