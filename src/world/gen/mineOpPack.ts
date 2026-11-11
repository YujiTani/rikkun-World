/**
 * 坑道の 「置く物」1 つを 1 つの 整数に つめる 形（MINE-1C）。4 つの 作り手と、読む applyShaftOps が 同じ 並びを 使う。
 * 並び（下から）: 番号の 下 8 ビット・列の中の高さ y 9 ビット・lz 4 ビット・lx 4 ビット・番号の 上 2 ビット（ビット 25〜26。BLOCK-ID16）。
 * 番号が 256 より 小さければ 今までと 1 ビットも 同じ 値（坑道の 計画の 見本〔sigOf〕を かえない ため、上の 2 ビットは いちばん 上に 足した）。
 */
export const OP_Y_SHIFT = 8;
export const OP_LZ_SHIFT = 17;
export const OP_LX_SHIFT = 21;
const OP_HI_SHIFT = 25;

export const packOp = (block: number, y: number, lz: number, lx: number): number =>
  (block & 255) | (y << OP_Y_SHIFT) | (lz << OP_LZ_SHIFT) | (lx << OP_LX_SHIFT) | ((block >> 8) << OP_HI_SHIFT);

/** 値 v の ブロックの 番号（0〜1023） */
export const opBlock = (v: number): number => (v & 255) | (((v >> OP_HI_SHIFT) & 3) << 8);
