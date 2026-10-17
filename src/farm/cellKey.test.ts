import { describe, expect, it } from 'vitest';
import { cellKey, cellFromKey } from './cellKey';
import { Pet } from './pet';
import { Sprinklers } from './sprinkler';
import { createM7Settings } from '../contracts';

const POINTS: Array<[number, number, number]> = [
  [-30000, 0, -30000],
  [29999, 351, 29999],
  [0, 0, 0],
  [-30000, 351, 29999],
  [29999, 0, -30000],
];

describe('マスの番号（VOX-D 基準 19）', () => {
  it('±30,000・高さ 0〜351 の どこでも となりどうしが かさならない', () => {
    const seen = new Set<number>();
    for (const [x, y, z] of POINTS) {
      for (const [dx, dy, dz] of [
        [0, 0, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const nz = z + dz;
        if (ny < 0 || ny > 351) continue;
        const k = cellKey(nx, ny, nz);
        expect(seen.has(k), `${nx},${ny},${nz}`).toBe(false);
        seen.add(k);
        expect(Number.isSafeInteger(k)).toBe(true);
        expect(cellFromKey(k)).toEqual({ x: nx, y: ny, z: nz });
      }
    }
  });
  it('負の座標と正の座標が まざらない', () => {
    expect(cellKey(-1, 5, 3)).not.toBe(cellKey(1, 5, 3));
    expect(cellKey(3, 5, -1)).not.toBe(cellKey(3, 5, 1));
    expect(cellKey(4096, 5, 0)).not.toBe(cellKey(0, 5, 0));
    expect(cellKey(0, 5, 4096)).not.toBe(cellKey(0, 5, 0));
    expect(cellKey(512, 0, 0)).not.toBe(cellKey(0, 0, 0));
  });
  it('ごきげん: 遠くのマスどうしを 取りちがえない', () => {
    const p = new Pet({ settings: createM7Settings(), dayLength: () => 1000 });
    const crop = { kind: 'onion', stage: 0, stageTicks: 0, ripe: false, wet: false, wild: false } as never;
    expect(p.pet(-30000, 5, -30000, crop)).toBe('happy');
    expect(p.isHappy(-30000, 5, -30000)).toBe(true);
    expect(p.isHappy(-30000 + 4096, 5, -30000)).toBe(false);
    expect(p.isHappy(0, 5, 0)).toBe(false);
    expect(p.pet(29999, 351, 29999, crop)).toBe('happy');
    expect(p.pet(-30000, 5, -30000, crop)).toBe('again');
  });
  it('ごきげん・スプリンクラー: 番号が かさなる 遠いマスを 取りちがえない', () => {
    const p = new Pet({ settings: createM7Settings(), dayLength: () => 1000 });
    const crop = { kind: 'onion', stage: 0, stageTicks: 0, ripe: false, wet: false, wild: false } as never;
    p.pet(0, 5, 0, crop);
    expect(p.isHappy(-1, 5, 4096)).toBe(false);
    const s = new Sprinklers();
    s.onBlockChanged(0, 13, 0, 'air', 'sprinkler');
    expect(s.covers(-1, 12, 1024)).toBe(false);
    expect(s.covers(-1, 12, 1025)).toBe(false);
  });
  it('スプリンクラー: 遠くのマス・負の座標でも はんいが 重ならない', () => {
    const s = new Sprinklers();
    s.onBlockChanged(-30000, 13, -30000, 'air', 'sprinkler');
    s.onBlockChanged(29999, 351, 29999, 'air', 'sprinkler');
    expect(s.covers(-29999, 12, -30000)).toBe(true);
    expect(s.covers(-30000 + 1024, 12, -30000)).toBe(false);
    expect(s.covers(-30000 + 3, 12, -30000)).toBe(false);
    expect(s.covers(29998, 350, 29999)).toBe(true);
    expect(s.covers(0, 12, 0)).toBe(false);
    expect(s.list()).toHaveLength(2);
  });
});
