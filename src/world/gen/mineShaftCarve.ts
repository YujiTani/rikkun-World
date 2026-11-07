import { BLOCK_TYPES } from '../blocks/blockTypes';
import { LAYER } from './columnLayout';
import type { ColOps } from './mineShaftOps';

/** 固い ブロックか（番号で ひく） */
const SOLID = Uint8Array.from(BLOCK_TYPES.map((t) => (t.solid ? 1 : 0)));

/**
 * 坑道の 置く 物を 列に 書く（MINE-1C）。木・草花の あとに 呼ぶ。
 * ring ＝ かべ・床・天井〔もとが 固ければ そのまま、そうでなければ 石〕→ air ＝ 空気 → put ＝ たいまつ・鉱石・わく・宝箱・山。
 * 値の 並びは mineShafts.ts の pack〔block | y << 8 | lz << 17 | lx << 21〕。
 */
export function applyShaftOps(out: Uint8Array, ops: readonly ColOps[]): void {
  for (const o of ops) {
    for (let i = 0; i < o.ring.length; i++) {
      const v = o.ring[i]!;
      const at = ((v >> 8) & 511) * LAYER + ((v >> 17) & 15) * 16 + ((v >> 21) & 15);
      if (!SOLID[out[at]!]) out[at] = v & 255;
    }
  }
  for (const o of ops) {
    for (let i = 0; i < o.air.length; i++) {
      const v = o.air[i]!;
      out[((v >> 8) & 511) * LAYER + ((v >> 17) & 15) * 16 + ((v >> 21) & 15)] = v & 255;
    }
  }
  for (const o of ops) {
    for (let i = 0; i < o.put.length; i++) {
      const v = o.put[i]!;
      out[((v >> 8) & 511) * LAYER + ((v >> 17) & 15) * 16 + ((v >> 21) & 15)] = v & 255;
    }
  }
}
