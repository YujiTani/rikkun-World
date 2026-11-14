import { CHUNK_SIZE, WORLD_HEIGHT, type BlockArray } from '../contracts';
import { blockIdFromIndex } from '../world/blocks/blockTypes';
import { LAYER } from '../world/gen/columnLayout';
import { TOWN } from './townTuning';

/**
 * TOWN-1 1.4 §2.16 の 4: その マスの 設計・生成の 中身（街を 作った ときの ブロック）を 読む。
 * 列を 作りなおして（`build`）、よく 使う 列だけ 少し おぼえる（TOWN.repair.planCache 列）。同じ 世界なら いつも 同じ 中身。
 * `build` は 作業用の 入れものでは なく 自分の 入れものを 返す こと（あとで 読む ため）。
 */
export function createPlanReader(build: (cx: number, cz: number) => BlockArray): (x: number, y: number, z: number) => string {
  const cache = new Map<number, BlockArray>();
  return (x, y, z) => {
    if (y < 0 || y >= WORLD_HEIGHT) return 'air';
    const cx = Math.floor(x) >> 4;
    const cz = Math.floor(z) >> 4;
    const k = cx * 65536 + cz;
    let col = cache.get(k);
    if (col === undefined) {
      col = build(cx, cz);
      cache.set(k, col);
      if (cache.size > TOWN.repair.planCache) cache.delete(cache.keys().next().value!); // いちばん ふるい 列を すてる
    } else {
      cache.delete(k); // 使った 列を あたらしい 側へ
      cache.set(k, col);
    }
    return blockIdFromIndex(col[y * LAYER + (Math.floor(z) - cz * CHUNK_SIZE) * CHUNK_SIZE + (Math.floor(x) - cx * CHUNK_SIZE)]!);
  };
}
