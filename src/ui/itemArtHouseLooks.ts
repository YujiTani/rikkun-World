import type { ItemId } from '../contracts';
import { HOUSE_LOOK_ITEM_IDS } from '../content/items/ids';
import type { Rgba } from '../world/blocks/textures';
import { KIND_ICONS_32 } from './houseEditor/kindIcons32.data';

/**
 * 家の しゅるいの アイテム 42 こ（HOUSE-2B #364）の 16×16 アイコン。エディターの ボタンの 絵 32×32（アートの 決めた 絵。`houseEditor/kindIcons32.data.ts`）を
 * 2×2 ずつ 1 点に まとめる（4 点の うち いちばん 多い 色。同数なら 左上に ちかい ほう）。キー ＝ アイテム id の さいしょの `_` を `:` に（`roof_kawara_shiro` → `roof:kawara_shiro`）。
 */
const IDS: ReadonlySet<string> = new Set<string>(HOUSE_LOOK_ITEM_IDS);
export const isHouseLookItem = (item: ItemId): boolean => IDS.has(item);

const CLEAR: Rgba = [0, 0, 0, 0];
const hex = (c: string): Rgba => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];

export function houseLookItemPixels(item: ItemId): Rgba[] {
  const key = item.replace('_', ':');
  const art = KIND_ICONS_32[key];
  if (!art) throw new Error(`家の しゅるいの 絵が ない: ${key}`);
  const out: Rgba[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const votes = new Map<string, number>();
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const ch = art.rows[y * 2 + dy]![x * 2 + dx]!;
        votes.set(ch, (votes.get(ch) ?? 0) + 1);
      }
      let best = '.';
      let bestN = 0;
      for (const [ch, n] of votes) if (ch !== '.' && n > bestN) [best, bestN] = [ch, n];
      // 4 点の うち 3 点 いじょうが すきまなら すきま
      out.push(votes.get('.')! >= 3 || bestN === 0 ? CLEAR : hex(art.pal[best]!));
    }
  }
  return out;
}
