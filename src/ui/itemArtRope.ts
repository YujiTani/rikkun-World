import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';
import { ROPE } from '../world/blocks/rope';

const ROPE_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>([ROPE]);

/**
 * ROPE-1: ロープの アイテムの 絵（16×16）。くるっと まいた なわの わ ＋ 下に たれた はし。
 * 世界の 絵（world/blocks/ropeTextures.ts）と 同じ 2 色。持って いる 本数は マスの 右下の 数字（hotbar の slot-count）で 出る。
 */
const LIGHT: Rgba = [0xc9, 0xa4, 0x6a, 255];
const DARK: Rgba = [0x8a, 0x6a, 0x3a, 255];
const EDGE: Rgba = [0x4a, 0x32, 0x18, 255];
const CLEAR: Rgba = [0, 0, 0, 0];
const N = 16;

export function isRopeItem(item: ItemId): boolean {
  return ROPE_ITEMS.has(item);
}

/** わ（だ円の 輪を 2 本）と、右下へ たれた はし */
export function ropeItemPixels(): Rgba[] {
  const p = new Array<Rgba>(N * N).fill(CLEAR);
  const put = (x: number, y: number, c: Rgba): void => {
    if (x >= 0 && x < N && y >= 0 && y < N) p[y * N + x] = c;
  };
  for (const [cx, cy, rx, ry] of [[7, 7, 6, 4], [7, 7, 4, 2.5]] as const) {
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const x = Math.round(cx + rx * Math.cos(t));
      const y = Math.round(cy + ry * Math.sin(t));
      put(x, y + 1, EDGE); // 下の かげ = ふちどり
      put(x, y, a % 8 < 4 ? LIGHT : DARK);
    }
  }
  for (let y = 10; y < 15; y++) {
    put(12, y, y % 2 ? LIGHT : DARK);
    put(13, y, EDGE);
  }
  return p;
}
