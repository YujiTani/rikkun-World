// HOUSE-2B（#364）しゅるいの ボタン・ばしょの ボタンの 絵（SVG の 文字列）。アートの 絵（32×32 の ドット絵。yuzu OK 済み。`kindIcons32.data.ts`）を
// 色ごとに 行の 横 1 本 ずつ まとめた <path> に して 出す（1 ドット 1 つの <rect> では ない。`shape-rendering="crispEdges"`）。表示は 32 の 整数倍が きれい。
// 「なし」の 点線は 色が 決まって いる（#E6DEC8）。絵の 大きさは ボタンの 枠（CSS）に 合わせて のびる（ボタンの 大きさは かわらない）。
import type { Part } from '../../house/recipes/kinds';
import { ICONS } from './icons';
import { KIND_ICONS_32 } from './kindIcons32.data';

const cache = new Map<string, string>();

/** 絵 1 つの SVG（key ＝ 「ばしょ:しゅるい」。ない 絵は 空）。size ＝ 絵の 1 辺の ドット（ふつう 32。「あたらしい！」は 20） */
function art(key: string, cls: string): string {
  const id = `${cls}|${key}`;
  const got = cache.get(id);
  if (got !== undefined) return got;
  const a = KIND_ICONS_32[key];
  if (!a) {
    cache.set(id, '');
    return '';
  }
  const n = a.rows.length;
  const byColor = new Map<string, string>();
  a.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      let e = x;
      while (e < row.length && row[e] === ch) e++;
      const col = a.pal[ch];
      if (ch !== '.' && col) byColor.set(col, `${byColor.get(col) ?? ''}M${x} ${y}h${e - x}v1h-${e - x}z`);
      x = e;
    }
  });
  const paths = [...byColor].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join('');
  const out = `<svg class="${cls}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" aria-hidden="true">${paths}</svg>`;
  cache.set(id, out);
  return out;
}

/** しゅるいの ボタンの 絵（part ＝ やね・かべ・まど・と・かざり。kind ＝ しゅるいの id） */
export function kindArt(part: Part, kind: string): string {
  return art(`${part}:${kind}`, 'ed-art');
}

/** ばしょの ボタンの 絵（一目で その ばしょと 分かる 絵。字は ボタンの 下に 別に 出す） */
export function placeArt(part: Part): string {
  return art(`place:${part}`, 'ed-art');
}

/** 32×32 の 絵が なく、いつもの 絵を つかう あかり */
const OWN_ART: ReadonlySet<string> = new Set(['lantern']);

/** あかりの ボタンの 絵（lantern・hotaru・suisho）。ちょうちんは いつもの 絵 */
export function lightArt(kind: string): string {
  return OWN_ART.has(kind) ? ICONS.lantern.replace('class="ed-ico"', 'class="ed-art"') : art(`light:${kind}`, 'ed-art');
}

/** 「あたらしい！」の 印（朱の ひしがた ＋ 白ぶち ＋「!」。20×20。動かない。ボタンの 右上に おさめる） */
export const NEW_MARK = art('mark:new', 'ed-newmark__svg');
