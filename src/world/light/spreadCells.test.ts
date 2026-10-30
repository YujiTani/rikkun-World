import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { SkyDarkness } from './skyDarkness';
import { WorldLight } from './WorldLight';

/**
 * MINE-1B B12 の「光を 広げた マスの 数」の 窓口 = `WorldLight.lastSpreadCells`
 * （ブロックの光を 書いた マスの 数。もとの 光る ブロックの マス ＋ 1 マスずつ 広げた マス。空の光は 数えない）。
 * 部屋の 作りは hotaruishi.test.ts の B12 と 同じ。
 */
const HOTARU = 'hotaruishi' as BlockId;

function room(n: number, block: BlockId = HOTARU): number {
  const w = new ArrayVoxelWorld({ x: 16, y: 24, z: 16 });
  w.fill(0, 0, 0, 15, 9, 15, 'stone');
  w.fill(0, 16, 0, 15, 23, 15, 'stone');
  w.fill(0, 10, 0, 0, 15, 15, 'stone');
  w.fill(15, 10, 0, 15, 15, 15, 'stone');
  w.fill(0, 10, 0, 15, 15, 0, 'stone');
  w.fill(0, 10, 15, 15, 15, 15, 'stone');
  const l = new WorldLight(w, new SkyDarkness());
  const spots: Array<[number, number]> = [];
  for (let z = 2; z <= 13; z += 3) for (let x = 2; x <= 13; x += 3) spots.push([x, z]);
  const order = [0, 5, 10, 15, 3, 6, 9, 12, 1, 4, 7, 8, 11, 13, 14, 2];
  for (let k = 0; k < n; k++) {
    const [x, z] = spots[order[k]!]!;
    w.setBlock(x, 16, z, block);
  }
  l.flush(); // update() の あとに flush() すると 数が 0 に もどる〔どちらも 呼ぶ 前に 0 に する〕。1 回で 全部 計算する flush だけ 使う
  return l.lastSpreadCells;
}

describe('B12: 光を 広げた マスの 数（WorldLight.lastSpreadCells）', () => {
  it('光る ブロックが 無ければ 0', () => {
    expect(room(0)).toBe(0);
  });

  it('1 こ ぶんは 光る マス 1 ＋ 広げた マス。ふえると ふえる', () => {
    const one = room(1);
    expect(one).toBeGreaterThan(1);
    expect(room(2)).toBeGreaterThan(one);
  });

  it('ほたるいしを 2 倍に すると 2.2 倍 以下〔2→4→8→16 こ〕', () => {
    const counts = [2, 4, 8, 16].map((n) => room(n));
    for (let i = 1; i < counts.length; i++) expect(counts[i]! / counts[i - 1]!, `${counts[i - 1]} → ${counts[i]}`).toBeLessThanOrEqual(2.2);
  });

  it('たいまつ〔光 14〕より ほたるいし〔光 7〕の ほうが 広げる マスが 少ない', () => {
    expect(room(4)).toBeLessThan(room(4, 'torch' as BlockId));
  });
});
