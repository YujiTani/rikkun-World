import { describe, expect, it } from 'vitest';
import { OP_LX_SHIFT, OP_LZ_SHIFT, OP_Y_SHIFT, opBlock, packOp } from './mineOpPack';

// BLOCK-ID16: 坑道の 置く物の パックは 番号 0〜1023 を そのまま 持てる。256 より 小さい 番号は 今までと 同じ 値（見本を かえない）。
describe('mineOpPack', () => {
  it('番号 0・255・256・700・1023 と 位置が 往復する', () => {
    for (const b of [0, 1, 255, 256, 700, 1023]) {
      const v = packOp(b, 351, 15, 14);
      expect(opBlock(v)).toBe(b);
      expect((v >> OP_Y_SHIFT) & 511).toBe(351);
      expect((v >> OP_LZ_SHIFT) & 15).toBe(15);
      expect((v >> OP_LX_SHIFT) & 15).toBe(14);
    }
  });

  it('番号が 256 より 小さければ 今までの 並び（block | y << 8 | lz << 17 | lx << 21）と 同じ 値', () => {
    for (const b of [0, 5, 99, 216, 255]) expect(packOp(b, 300, 7, 9)).toBe(b | (300 << 8) | (7 << 17) | (9 << 21));
  });
});
