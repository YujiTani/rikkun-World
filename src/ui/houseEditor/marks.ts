// HOUSE-1B ② なかの 方眼の かべの 帯に 出す 窓と 戸の 印（SVG）。窓 ＝ 白い しょうじ、戸 ＝ 戸の 絵（立てた 戸）。
// 色は 見本の 家（houseLook.ts）と そろえる。UI の 色の きまり（トークン）には SVG の 中身は 入らない。
import { HOUSE_LOOK } from '../../world/blocks/houseArt';

const P = HOUSE_LOOK.pal;
/** しょうじの 白い 紙（見本の 紙より 白く して、帯の 木の 色と はっきり 分ける）・くっきりした ふち */
const PAPER = '#FFFDF2';
const OUTLINE = '#2E2620';

/** しょうじの 印: かべの 帯に そって len × thick。白い 紙・こい わく・ほそい くみこ（長い ほうを 4 つに 分ける） */
export function shojiMark(len: number, thick: number, horiz: boolean): string {
  const w = horiz ? len : thick;
  const h = horiz ? thick : len;
  const bars: string[] = [];
  for (const q of [0.25, 0.5, 0.75]) {
    bars.push(horiz ? `<path d="M${(len * q).toFixed(1)} 2v${thick - 4}"/>` : `<path d="M2 ${(len * q).toFixed(1)}h${thick - 4}"/>`);
  }
  bars.push(horiz ? `<path d="M2 ${thick / 2}h${len - 4}"/>` : `<path d="M${thick / 2} 2v${len - 4}"/>`);
  return `<svg class="ed-mark__svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="2" fill="${PAPER}" stroke="${OUTLINE}" stroke-width="2"/><rect x="3" y="3" width="${w - 6}" height="${h - 6}" fill="none" stroke="${P.frame}" stroke-width="1.5"/><g stroke="${P.kumiko}" stroke-width="1.5" fill="none">${bars.join('')}</g></svg>`;
}

/** 戸の 印の 高さ（px）。はばは 1 マス。帯 16 ＋ 外へ 8（余白 16 を 上下に 分けた 8 の 中に おさまる） */
export const DOOR_MARK_H = 24;

/** 戸の 印（はば w）: 2 まい とびら（見本の 戸と おなじ 色）・まん中の あわせ・てつの 輪。こい ふちで 帯との 明るさの 差を つける */
export function doorMark(w: number): string {
  const h = DOOR_MARK_H;
  const half = w / 2;
  const lw = half - 1.5;
  const leaf = (x: number): string =>
    `<rect x="${x}" y="1" width="${lw}" height="${h - 2}" rx="2" fill="${P.door}" stroke="${OUTLINE}" stroke-width="2"/><rect x="${x + 3}" y="5" width="${lw - 6}" height="${h - 10}" rx="1" fill="${P.doorL}" stroke="${P.doorD}" stroke-width="1.2"/>`;
  return `<svg class="ed-mark__svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">${leaf(1)}${leaf(half + 0.5)}<circle cx="${half - 5}" cy="${h / 2}" r="2" fill="${P.iron}" stroke="${P.ring}" stroke-width="1"/><circle cx="${half + 5}" cy="${h / 2}" r="2" fill="${P.iron}" stroke="${P.ring}" stroke-width="1"/></svg>`;
}
