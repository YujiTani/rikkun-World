import { CHUNK_SIZE, type BlockArray } from '../../contracts';
import { BLOCK_INDEX } from '../blocks/blockTypes';
import { HW, LAYER } from './columnLayout';
import type { Terrain } from './terrain';
import { treesInRect } from './trees';

/**
 * おちば（VOX-I-4b #187。docs/design/VOX-I.md §2.3 の「おちば」の 行）: もみじやまの もみじの 木の みきから チェビシェフ 2 以内の
 * くさの 地面を おちばに する（国が もみじやまの 列だけ）。木の 位置は 木を 作る ときと 同じ → 作る順に 関係なく 同じ。
 */

/** みきの まわり これだけ（ブロック）の くさを おちばに する */
const RADIUS = 2;

/** 四角（x0, z0, x1, z1。両はし ふくむ）の どれかに (x, z) が 入るか */
const inRects = (rs: readonly (readonly [number, number, number, number])[], x: number, z: number): boolean => rs.some((r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);

const GRASS = BLOCK_INDEX.grass;
const OCHIBA = BLOCK_INDEX.ochiba;
const MOMIJI = BLOCK_INDEX.momiji_leaves;

/** `out`（チャンクの ブロック）の 地面の くさを おちばに する。skip = 生成で どけた 木の 四角（どけた 木の まわりは おちばに しない）。H = 地面の 高さ（まわり 1 列 つき） */
export function placeOchiba(out: BlockArray, T: Terrain, x0: number, z0: number, H: Int16Array, skip?: readonly (readonly [number, number, number, number])[]): void {
  const M = RADIUS + 1; // 大木の みきは 2×2 → みきの 列から 2 + 1
  const trees = treesInRect(T, x0 - M - RADIUS, z0 - M - RADIUS, x0 + CHUNK_SIZE - 1 + M + RADIUS, z0 + CHUNK_SIZE - 1 + M + RADIUS);
  for (const t of trees) {
    if (BLOCK_INDEX[t.leaves] !== MOMIJI || (skip !== undefined && inRects(skip, t.x, t.z))) continue;
    const w = t.big === true ? 2 : 1;
    for (let z = Math.max(z0, t.z - RADIUS); z <= Math.min(z0 + CHUNK_SIZE - 1, t.z + w - 1 + RADIUS); z++) {
      for (let x = Math.max(x0, t.x - RADIUS); x <= Math.min(x0 + CHUNK_SIZE - 1, t.x + w - 1 + RADIUS); x++) {
        const lx = x - x0;
        const lz = z - z0;
        const o = H[(lz + 1) * HW + lx + 1]! * LAYER + lz * CHUNK_SIZE + lx;
        if (out[o] === GRASS && T.map.countryAt(x, z).kind === 'momiji') out[o] = OCHIBA;
      }
    }
  }
}
