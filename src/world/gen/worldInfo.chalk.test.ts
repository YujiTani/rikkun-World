import { describe, expect, it } from 'vitest';
import type { BlockId } from '../../contracts';
import { CHALK_MARK_IDS } from '../blocks/chalkMark';
import { terrainTopOf } from './worldInfo';

/** MINE-1B: チョークの しるしは「一番上の 地形」に 数えない（ゆかの しるしで 地面の 高さが +1 に ならない） */
function column(top: number, extra: Array<[number, string]>): Parameters<typeof terrainTopOf>[0] {
  const cells = new Map<number, string>(extra);
  const topY = Math.max(top, ...extra.map(([y]) => y));
  return {
    topY: () => topY,
    getBlock: (_x: number, y: number) => (cells.get(y) ?? (y <= top ? 'stone' : 'air')) as BlockId | 'outside',
  } as unknown as Parameters<typeof terrainTopOf>[0];
}

describe('terrainTopOf と チョークの しるし', () => {
  it('ゆか・かべの しるしが 地面の 上に あっても 地面の 高さの まま（12 こ ぜんぶ）', () => {
    for (const id of CHALK_MARK_IDS) expect(terrainTopOf(column(40, [[41, id]]), 3, 3), id).toBe(40);
  });

  it('しるしでない ブロックが 上に あれば そこが 一番 上（くらべ）', () => {
    expect(terrainTopOf(column(40, [[41, 'stone']]), 3, 3)).toBe(41);
  });
});
