import type { BlockArray } from '../../contracts';
import { BLOCK_TYPES } from '../blocks/blockTypes';
import { LAYER } from './columnLayout';
import type { ColOps } from './mineShaftOps';
import { OP_LX_SHIFT, OP_LZ_SHIFT, OP_Y_SHIFT, opBlock } from './mineOpPack';

/** 固い ブロックか（番号で ひく） */
const SOLID = Uint8Array.from(BLOCK_TYPES.map((t) => (t.solid ? 1 : 0)));

/** 値 v の 列の中の 場所（y * LAYER + lz * 16 + lx） */
const cellOf = (v: number): number => ((v >> OP_Y_SHIFT) & 511) * LAYER + ((v >> OP_LZ_SHIFT) & 15) * 16 + ((v >> OP_LX_SHIFT) & 15);

/**
 * 坑道の 置く 物を 列に 書く（MINE-1C）。木・草花の あとに 呼ぶ。
 * ring ＝ かべ・床・天井〔もとが 固ければ そのまま、そうでなければ 石〕→ air ＝ 空気 → put ＝ たいまつ・鉱石・わく・宝箱・山。
 * 値の 並びは mineOpPack.ts の packOp〔番号 | y | lz | lx〕。
 */
export function applyShaftOps(out: BlockArray, ops: readonly ColOps[]): void {
  for (const o of ops) {
    for (let i = 0; i < o.ring.length; i++) {
      const v = o.ring[i]!;
      const at = cellOf(v);
      if (!SOLID[out[at]!]) out[at] = opBlock(v);
    }
  }
  for (const o of ops) {
    for (let i = 0; i < o.air.length; i++) {
      const v = o.air[i]!;
      out[cellOf(v)] = opBlock(v);
    }
  }
  for (const o of ops) {
    for (let i = 0; i < o.put.length; i++) {
      const v = o.put[i]!;
      out[cellOf(v)] = opBlock(v);
    }
  }
}
