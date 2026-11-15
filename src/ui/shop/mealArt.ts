import type { FoodKind } from '../../town/vendor/vendorTable';
import type { Rgba } from '../../world/blocks/textures';
import { drawPixels } from '../itemIcon';

/**
 * やたいの 食べ物の 絵（TOWN-1 1E。だんご・ごはん。もちものには 入らない ので アイテムの 絵では ない）。16×16・ふちどり `#3A3442`。
 * 仮の 絵【アートの 確認 まち】。1 しゅるい 1 回 だけ data URL に する。
 */
const ART = {
  /** だんご: くしに 3 つ（もも・しろ・みどり） */
  dango: {
    pal: { K: '#3A3442', P: '#F3A0B4', p: '#D97790', W: '#F7F1E3', w: '#D9CFBA', G: '#9ACB6A', g: '#6E9F45', S: '#B98A52' },
    rows: [
      '.............KK.',
      '...........KKSK.',
      '.........KKPPK..',
      '........KPPPpK..',
      '.......KKPPppK..',
      '......KWWKppK...',
      '.....KWWWwKK....',
      '....KWWWwwK.....',
      '...KKWwwwK......',
      '..KGGKwwK.......',
      '.KGGGgKK........',
      '.KGGggK.........',
      '.KKggK..........',
      '.KSKK...........',
      'KSK.............',
      'KK..............',
    ],
  },
  /** ごはん: あいいろの ちゃわんに しろい ごはんの 山もり */
  gohan: {
    pal: { K: '#3A3442', W: '#FBF7EC', w: '#E3DCCB', B: '#3E5C9A', b: '#2C4472', L: '#6F8CC8' },
    rows: [
      '................',
      '................',
      '......KKKK......',
      '....KKWWWWKK....',
      '...KWWWWWWWwK...',
      '..KWWWWWWWWWwK..',
      '..KWWWWWWWWwwK..',
      '.KKKKKKKKKKKKKK.',
      '.KLBBBBBBBBBBbK.',
      '..KLBBBBBBBBbK..',
      '..KLBBBBBBBBbK..',
      '...KBBBBBBBbK...',
      '....KKbbbbKK....',
      '.....KbbbbK.....',
      '.....KKKKKK.....',
      '................',
    ],
  },
} as const satisfies Record<FoodKind, { pal: object; rows: readonly string[] }>;

const hex = (c: string): Rgba => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

const cache = new Map<FoodKind, string>();

/** 食べ物の 絵（data URL。DOM の ある 所でだけ 呼ぶ） */
export function mealIconUrl(kind: FoodKind): string {
  const hit = cache.get(kind);
  if (hit) return hit;
  const art = ART[kind];
  const pal: Readonly<Record<string, string>> = art.pal;
  const px: Rgba[] = [];
  for (const row of art.rows) for (const ch of row) px.push(pal[ch] === undefined ? [0, 0, 0, 0] : hex(pal[ch]!));
  const c = document.createElement('canvas');
  drawPixels(c, px);
  const url = c.toDataURL();
  cache.set(kind, url);
  return url;
}
