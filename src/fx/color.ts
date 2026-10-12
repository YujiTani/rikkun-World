import type { BlockId } from '../contracts';
import { BLOCK_TILES, getTilePixels } from '../world/blocks/textures';

const cache = new Map<BlockId, number>();

/** ブロックの色（横の面の平均）0xRRGGBB。はじける四角の色 */
export function blockColor(id: BlockId): number {
  let c = cache.get(id);
  if (c !== undefined) return c;
  const tiles = BLOCK_TILES[id];
  if (!tiles) {
    c = 0x888888;
  } else {
    const px = getTilePixels(tiles[2]);
    let r = 0, g = 0, b = 0, n = 0;
    for (const p of px) {
      if (p[3] === 0) continue;
      r += p[0]; g += p[1]; b += p[2]; n++;
    }
    c = n === 0 ? 0x888888 : (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  }
  cache.set(id, c);
  return c;
}
