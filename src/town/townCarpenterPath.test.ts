import { describe, expect, it } from 'vitest';
import { PathFinder, type Goal } from './townCarpenterPath';

/** 平らな 地面（y = 5）。wall の マスは 立てない */
function flat(wall: (x: number, z: number) => boolean = () => false, size = 200) {
  return new PathFinder(
    (x, z) => (x < 0 || z < 0 || x >= size || z >= size || wall(x, z) ? null : 5),
    () => false,
  );
}
const cell = (x: number, z: number): Goal => ({ kind: 'cell', x, z });

describe('建築士さんの 道さがし', () => {
  it('平らな 地面: まっすぐ 近い 道（8 方向）で 着く。のこりの 数は 道の 長さ', () => {
    const p = flat();
    const out: number[] = [];
    expect(p.find(10, 10, 5, cell(30, 10), out)).toBe(true);
    expect(out.length / 3).toBe(20);
    expect(out[out.length - 3]).toBe(30);
    expect(out[out.length - 2]).toBe(10);
    expect(out[out.length - 1]).toBe(5);
  });

  it('かべが あれば まわりこむ。かべの マスは 通らない・ななめで かべの かどを 切らない', () => {
    const wall = (x: number, z: number): boolean => x === 20 && z >= 5 && z <= 15;
    const p = flat(wall);
    const out: number[] = [];
    expect(p.find(10, 10, 5, cell(30, 10), out)).toBe(true);
    for (let i = 0; i < out.length; i += 3) expect(wall(out[i]!, out[i + 1]!)).toBe(false);
    expect(out.some((v, i) => i % 3 === 1 && (v < 5 || v > 15))).toBe(true); // かべの はしを まわる
  });

  it('まとまりの 四角から 2〜3 マスの 輪の どこかに 着けば よい。足場の わく（四角 ＋1）には 入らない', () => {
    const rect: Goal = { kind: 'rect', minX: 40, maxX: 42, minZ: 40, maxZ: 42, dMin: 2, dMax: 3 };
    const p = new PathFinder((x, z) => (x < 0 || z < 0 ? null : 5), (x, z) => x >= 39 && x <= 43 && z >= 39 && z <= 43);
    const out: number[] = [];
    expect(p.find(10, 40, 5, rect, out)).toBe(true);
    const x = out[out.length - 3]!;
    const z = out[out.length - 2]!;
    const d = Math.max(Math.max(40 - x, 0, x - 42), Math.max(40 - z, 0, z - 42));
    expect(d).toBeGreaterThanOrEqual(2);
    expect(d).toBeLessThanOrEqual(3);
    // いちばん 近い 側（西）に 着く
    expect(x).toBeLessThan(40);
  });

  it('段差: 1 マス 上がる・2 マス おりる は 通れる。2 マス 上がる 所は 通れない', () => {
    const h = (x: number): number | null => (x < 20 ? 5 : x === 20 ? 7 : null);
    const p = new PathFinder((x, z) => (z === 0 ? h(x) : null), () => false);
    const out: number[] = [];
    expect(p.find(10, 0, 5, cell(20, 0), out)).toBe(false);
    const h2 = (x: number): number | null => (x < 20 ? 5 : x === 20 ? 6 : x === 21 ? 4 : null);
    const q = new PathFinder((x, z) => (z === 0 ? h2(x) : null), () => false);
    expect(q.find(10, 0, 5, cell(21, 0), out)).toBe(true);
  });

  it('着けない ときは false（行き先が かこまれて いる）。窓より 遠い ときも false', () => {
    const wall = (x: number, z: number): boolean => Math.abs(x - 30) <= 2 && Math.abs(z - 30) <= 2 && !(x === 30 && z === 30);
    const out: number[] = [];
    expect(flat(wall).find(10, 10, 5, cell(30, 30), out)).toBe(false);
    expect(flat().find(0, 0, 5, cell(190, 190), out)).toBe(false);
  });

  it('立つ 足もとの 高さの はんい: 屋根の 上の ような 高い 輪の マスは 行き先に しない', () => {
    // 西がわ（x < 40）は 高さ 12 の 屋根、東がわは 地面（5）。四角は 40〜42
    const p = new PathFinder((x, z) => (x < 0 || z < 0 ? null : x < 40 ? 12 : 5), () => false);
    const rect: Goal = { kind: 'rect', minX: 40, maxX: 42, minZ: 40, maxZ: 42, dMin: 2, dMax: 3, yMin: 3, yMax: 7 };
    const out: number[] = [];
    // 出発は 西がわ（屋根）では 上り下りが 2 より 大きいので 動けない。東から 出発
    expect(p.find(60, 41, 5, rect, out)).toBe(true);
    expect(out[out.length - 1]).toBe(5);
  });
});
