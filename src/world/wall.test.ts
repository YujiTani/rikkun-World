import { describe, expect, it } from 'vitest';
import { WORLD_LIMIT } from '../contracts';
import { cellInWall, bodyInWall } from './wall';

describe('見えない壁（VOX-D W1〜W4）', () => {
  it('WORLD_LIMIT は 30000', () => {
    expect(WORLD_LIMIT).toBe(30000);
  });
  it('遊べるマスは -30000 〜 29999', () => {
    expect(cellInWall(-30000, 0)).toBe(true);
    expect(cellInWall(29999, 29999)).toBe(true);
    expect(cellInWall(30000, 0)).toBe(false);
    expect(cellInWall(0, 30000)).toBe(false);
    expect(cellInWall(-30001, 0)).toBe(false);
    expect(cellInWall(0, -30001)).toBe(false);
  });
  it('体の箱は x, z = -30000 〜 30000 の中', () => {
    expect(bodyInWall(29999.7, 0, 0.3)).toBe(true);
    expect(bodyInWall(29999.8, 0, 0.3)).toBe(false);
    expect(bodyInWall(-29999.7, 0, 0.3)).toBe(true);
    expect(bodyInWall(0, -29999.8, 0.3)).toBe(false);
    expect(bodyInWall(0, 29999.8, 0.3)).toBe(false);
  });
});
