import { describe, expect, it } from 'vitest';
import { BLOCK_INDEX, BLOCK_TYPES } from '../world/blocks/blockTypes';
import { BLOCK_IDS_V1 } from './blockIdsV1';

describe('BLOCK_IDS_V1（SAVE-30 AC7: 凍らせた版 1 の id の表）', () => {
  it('31 個で、今の BLOCK_TYPES の はじめの 31 個と同じ並び（#184: 新しいブロックは うしろに足す。番号を変えない）', () => {
    expect(BLOCK_IDS_V1).toHaveLength(31);
    expect([...BLOCK_IDS_V1]).toEqual(BLOCK_TYPES.slice(0, 31).map((t) => t.id));
  });

  it('どの id も BLOCK_TYPES にある（ブロックを消すと ここが落ちる）', () => {
    for (const id of BLOCK_IDS_V1) expect(BLOCK_INDEX[id as keyof typeof BLOCK_INDEX], `${id} が BLOCK_TYPES にない`).toBeTypeOf('number');
  });

  it('重ならない', () => {
    expect(new Set(BLOCK_IDS_V1).size).toBe(BLOCK_IDS_V1.length);
  });
});
