/**
 * HOUSE-2A（#364）まきものの 16×16 の 絵（十字の 板に はる）。HOUSE-2B で アートの 絵（案 C。タイル `h2_kozan_makimono_tile`）に した:
 * 床に 置いた ひろげかけの まきもの。上の ほうは すきま（十字の 板なので 空）。乱数なし。
 */
import { HOUSE_LOOK_TILES } from './houseLookTiles.data';

export const MAKIMONO_TILE = 'makimono' as const;

type Rgba = readonly [number, number, number, number];
const ART = HOUSE_LOOK_TILES.h2_kozan_makimono_tile!;
const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/** アートの 絵（pal ＋ rows。「.」 ＝ すきま）→ 16×16 */
export function paintMakimonoTile(): Rgba[] {
  const out: Rgba[] = [];
  for (const row of ART.rows) for (const ch of row) out.push(ART.pal[ch] === undefined ? [0, 0, 0, 0] : hex(ART.pal[ch]!));
  return out;
}
