import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { doorIndex } from '../editor/model';
import { findSites, siteOk, type SiteWorld } from './sites';

/** ユニット 4（AC19・§4.7・決め 8）: 建てられる 場所 */
function world() {
  const edits = new Map<string, BlockId>();
  const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
  const w: SiteWorld & { set(x: number, y: number, z: number, id: BlockId): void; fillK(x: number, y: number, z: number, ww: number, dd: number): void } = {
    getBlock: (x, y, z) => edits.get(key(x, y, z)) ?? (y < 10 ? 'dirt' : 'air'),
    set: (x, y, z, id) => void edits.set(key(x, y, z), id),
    fillK(x0, y, z0, ww, dd) {
      for (let z = z0; z < z0 + dd; z++) for (let x = x0; x < x0 + ww; x++) edits.set(key(x, y, z), 'katame_tsuchi');
    },
  };
  return w;
}
const DOOR5 = 1 + doorIndex({ w: 5, d: 5 });

describe('建てられる 場所', () => {
  it('5×5（外 7×7）: かためた つち 7×7 が 1 つ → その 1 か所（北西の すみ・床の 段）', () => {
    const w = world();
    w.fillK(30, 9, 30, 7, 7);
    expect(findSites(w, 33, 10, 33, 7, 7, DOOR5)).toEqual([{ x: 30, y: 9, z: 30 }]);
  });
  it('7×6 しか ない・上に 石が ある・できた 家（床）に かかる ときは 0', () => {
    const a = world();
    a.fillK(30, 9, 30, 7, 6);
    expect(findSites(a, 33, 10, 33, 7, 7, DOOR5)).toEqual([]);
    const b = world();
    b.fillK(30, 9, 30, 7, 7);
    b.set(32, 12, 32, 'stone');
    expect(findSites(b, 33, 10, 33, 7, 7, DOOR5)).toEqual([]);
    const c = world();
    c.fillK(30, 9, 30, 7, 7);
    c.set(33, 9, 33, 'house_floor');
    expect(findSites(c, 33, 10, 33, 7, 7, DOOR5)).toEqual([]);
  });
  it('上 4 段が 消える 草花なら 場所に なる', () => {
    const w = world();
    w.fillK(30, 9, 30, 7, 7);
    w.set(31, 10, 31, 'kusa');
    w.set(35, 11, 35, 'nobana');
    expect(findSites(w, 33, 10, 33, 7, 7, DOOR5)).toHaveLength(1);
  });
  it('戸の 前の 外 1 マスの 床の 段の 上 2 段が ふさがって いたら 0（決め 8）。空気か 草花なら 1', () => {
    const w = world();
    w.fillK(30, 9, 30, 7, 7);
    const doorFront = { x: 30 + DOOR5, z: 37 };
    w.set(doorFront.x, 10, doorFront.z, 'stone');
    expect(siteOk(w, 30, 9, 30, 7, 7, DOOR5)).toBe(false);
    w.set(doorFront.x, 10, doorFront.z, 'kusa');
    w.set(doorFront.x, 11, doorFront.z, 'air');
    expect(siteOk(w, 30, 9, 30, 7, 7, DOOR5)).toBe(true);
    w.set(doorFront.x, 11, doorFront.z, 'stone');
    expect(siteOk(w, 30, 9, 30, 7, 7, DOOR5)).toBe(false);
  });
  it('9×5（外 11×7）: 東西 11・南北 7。7×7 では 入らない', () => {
    const w = world();
    w.fillK(30, 9, 30, 11, 7);
    expect(findSites(w, 35, 10, 33, 11, 7, 1 + doorIndex({ w: 9, d: 5 }))).toEqual([{ x: 30, y: 9, z: 30 }]);
    const v = world();
    v.fillK(30, 9, 30, 7, 11);
    expect(findSites(v, 33, 10, 35, 11, 7, 1 + doorIndex({ w: 9, d: 5 }))).toEqual([]);
  });
  it('探す はんいは 横 24・上下 ±8。使って いる 場所（建築中）と 重なる ところは 数えない', () => {
    const near = world();
    near.fillK(53, 9, 30, 7, 7);
    expect(findSites(near, 30, 10, 33, 7, 7, DOOR5)).toHaveLength(1); // 北西の すみが 横 23
    const far = world();
    far.fillK(56, 9, 30, 7, 7);
    expect(findSites(far, 30, 10, 33, 7, 7, DOOR5)).toEqual([]); // 26
    const high = world();
    high.fillK(30, 25, 30, 7, 7);
    expect(findSites(high, 33, 10, 33, 7, 7, DOOR5)).toEqual([]);
    const used = world();
    used.fillK(30, 9, 30, 7, 7);
    expect(findSites(used, 33, 10, 33, 7, 7, DOOR5, [{ x: 30, y: 9, z: 30, w: 7, d: 7 }])).toEqual([]);
  });
  it('近い 順', () => {
    const w = world();
    w.fillK(30, 9, 30, 7, 7);
    w.fillK(40, 9, 30, 7, 7);
    const s = findSites(w, 44, 10, 33, 7, 7, DOOR5);
    expect(s[0]).toEqual({ x: 40, y: 9, z: 30 });
    expect(s).toHaveLength(2);
  });
});
