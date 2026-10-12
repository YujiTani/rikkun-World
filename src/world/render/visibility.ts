import { CHUNK_DRAW_DISTANCE } from './config';

/**
 * カメラ(px, pz)から、チャンク（x: cx*size〜(cx+1)*size, z も同じ）のいちばん近い点までの水平の距離。
 * カメラがチャンクの中にあれば 0。
 */
export function chunkNearDistance(cx: number, cz: number, px: number, pz: number, chunkSize: number): number {
  const x0 = cx * chunkSize;
  const z0 = cz * chunkSize;
  const dx = Math.max(x0 - px, 0, px - (x0 + chunkSize));
  const dz = Math.max(z0 - pz, 0, pz - (z0 + chunkSize));
  return Math.hypot(dx, dz);
}

/** そのチャンクを描くか（88 以下） */
export function isChunkInRange(
  cx: number,
  cz: number,
  px: number,
  pz: number,
  chunkSize: number,
  maxDistance: number = CHUNK_DRAW_DISTANCE,
): boolean {
  return chunkNearDistance(cx, cz, px, pz, chunkSize) <= maxDistance;
}
