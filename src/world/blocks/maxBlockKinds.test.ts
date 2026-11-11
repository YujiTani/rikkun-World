import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from './blockTypes';
import { MAX_BLOCK_KINDS } from './maxBlockKinds';

// BLOCK-ID16 AC6。MAX_BLOCK_KINDS は src/world/blocks/maxBlockKinds.ts に 1 か所だけ書く（実装側の約束）。
describe('BLOCK-ID16 AC6: ブロックの種類の上限', () => {
  it('MAX_BLOCK_KINDS は 1024（描画の 種類 10 ビット）', () => {
    expect(MAX_BLOCK_KINDS).toBe(1024);
  });

  it('BLOCK_TYPES.length <= MAX_BLOCK_KINDS（こえたら 描画の 種類が 化ける）', () => {
    expect(BLOCK_TYPES.length).toBeLessThanOrEqual(MAX_BLOCK_KINDS);
  });
});
