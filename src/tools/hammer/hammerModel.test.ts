import { describe, expect, it } from 'vitest';
import { diveCells, diveDamage, facingDir4, faceCells, isBreakable } from './hammerModel';


describe('hammerModel', () => {
  it('D2 向き: 4 方向・44 度は x・46 度は z（x 軸からの 角度）', () => {
    const d = (deg: number) => facingDir4(Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180));
    expect(d(44)).toEqual({ dx: 1, dz: 0 });
    expect(d(46)).toEqual({ dx: 0, dz: -1 });
    expect(facingDir4(0, -1)).toEqual({ dx: 0, dz: -1 });
    expect(facingDir4(0, 1)).toEqual({ dx: 0, dz: 1 });
    expect(facingDir4(-1, 0)).toEqual({ dx: -1, dz: 0 });
  });
  it('D2 地面の 振り: 面に 沿った 3 × 3（9 マス）。上向き・横向きで 平面が かわる', () => {
    const up = faceCells({ x: 5, y: 10, z: 5 }, { x: 0, y: 1, z: 0 });
    expect(up.length).toBe(9);
    expect(up.every((c) => c.y === 10 && Math.abs(c.x - 5) <= 1 && Math.abs(c.z - 5) <= 1)).toBe(true);
    const wallZ = faceCells({ x: 5, y: 10, z: 5 }, { x: 0, y: 0, z: 1 });
    expect(wallZ.every((c) => c.z === 5 && Math.abs(c.x - 5) <= 1 && Math.abs(c.y - 10) <= 1)).toBe(true);
    expect(new Set(wallZ.map((c) => `${c.x},${c.y}`)).size).toBe(9);
    const wallX = faceCells({ x: 5, y: 10, z: 5 }, { x: -1, y: 0, z: 0 });
    expect(wallX.every((c) => c.x === 5 && Math.abs(c.y - 10) <= 1 && Math.abs(c.z - 5) <= 1)).toBe(true);
    expect(new Set(wallX.map((c) => `${c.y},${c.z}`)).size).toBe(9);
  });
  it('D2b 急降下: 足の 下の 段の 3 × 3 ＋ 同じ 段の まわり 8（体の マスは 入らない）＝ 17', () => {
    const cs = diveCells({ x: 5, y: 10, z: 5 });
    expect(cs.length).toBe(17);
    expect(cs.filter((c) => c.y === 9).length).toBe(9);
    expect(cs.filter((c) => c.y === 10).length).toBe(8);
    expect(cs.some((c) => c.x === 5 && c.y === 10 && c.z === 5)).toBe(false);
    expect(cs.some((c) => c.y === 11)).toBe(false);
    expect(new Set(cs.map((c) => `${c.x},${c.y},${c.z}`)).size).toBe(17);
  });
  it('D6 急降下の 高さと 強さ', () => {
    const hs = [0.6, 3.2, 3.9, 4.0, 10, 25];
    expect(hs.map(diveDamage)).toEqual([20, 26, 26, 28, 40, 40]);
    expect(diveDamage(6)).toBe(32);
  });
  it('D3 こわす ブロックは 表の 物だけ', () => {
    for (const id of ['stone', 'dirt', 'log', 'leaves', 'bamboo']) expect(isBreakable(id)).toBe(true);
    for (const id of ['bedrock', 'tansu', 'brick', 'farmland', 'air', 'water', 'house_wall']) expect(isBreakable(id)).toBe(false);
  });
});
