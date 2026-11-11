import { describe, expect, it } from 'vitest';
import { LEGEND4_TUNING } from '../../content/items/legend4Tuning';
import { breakCells, diveDamage, diveDepth, facingDir4, isBreakable } from './hammerModel';

const T = LEGEND4_TUNING.daichi;

describe('hammerModel', () => {
  it('D2 向き: 4 方向・44 度は x・46 度は z（x 軸からの 角度）', () => {
    const d = (deg: number) => facingDir4(Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180));
    expect(d(44)).toEqual({ dx: 1, dz: 0 });
    expect(d(46)).toEqual({ dx: 0, dz: -1 });
    expect(facingDir4(0, -1)).toEqual({ dx: 0, dz: -1 });
    expect(facingDir4(0, 1)).toEqual({ dx: 0, dz: 1 });
    expect(facingDir4(-1, 0)).toEqual({ dx: -1, dz: 0 });
  });
  it('D2 こわす マス: 3 × 2 × 奥行き。足もとの 段は 入らない', () => {
    const one = breakCells({ x: 5, y: 10, z: 5 }, { dx: 0, dz: -1 }, 1);
    expect(one.length).toBe(T.breakWidth * T.breakHeight);
    expect(one.every((c) => c.z === 4 && (c.y === 10 || c.y === 11) && c.x >= 4 && c.x <= 6)).toBe(true);
    const two = breakCells({ x: 5, y: 10, z: 5 }, { dx: 1, dz: 0 }, 2);
    expect(two.length).toBe(12);
    expect(new Set(two.map((c) => c.x))).toEqual(new Set([6, 7]));
    expect(new Set(two.map((c) => c.z))).toEqual(new Set([4, 5, 6]));
  });
  it('D6 急降下の 高さと 強さ・奥行き', () => {
    const hs = [0.6, 3.2, 3.9, 4.0, 10, 25];
    expect(hs.map(diveDamage)).toEqual([20, 26, 26, 28, 40, 40]);
    expect(hs.map(diveDepth)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(diveDamage(6)).toBe(32);
  });
  it('D3 こわす ブロックは 表の 物だけ', () => {
    for (const id of ['stone', 'dirt', 'log', 'leaves', 'bamboo']) expect(isBreakable(id)).toBe(true);
    for (const id of ['bedrock', 'tansu', 'brick', 'farmland', 'air', 'water', 'house_wall']) expect(isBreakable(id)).toBe(false);
  });
});
