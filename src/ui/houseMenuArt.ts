import type { Rgba } from '../world/blocks/textures';
import { drawPixels, extraIconUrl, itemIconUrl } from './itemIcon';

/**
 * 建築士さんの メニューの ボタンの 絵（HOUSE-1A。docs/design/HOUSE-1.md §2.3）。16x16 のドット絵。
 * 【仮の 絵】アートの 3 案が 決まる まで コードで 描いた もの。形と 色は 本番の 絵に かわる。
 *   kura: 蔵（白い かべ・黒い かわらの 屋根・とびら）／ editor: 方眼と 家 ／ rename: えんぴつ
 *   talk: ふきだし（メニューではなく、建築士さんを ねらった とき 照準の 下の 案内「はなす」の 絵）
 *   build は とんかち（extraIconUrl('hammer')）、tools は みずもり ＋ どうづき（itemIconUrl）を そのまま 使う。
 */

const CLEAR: Rgba = [0, 0, 0, 0];

const KURA_PAL: Record<string, number> = {
  O: 0x3b2a1a, // ふち
  K: 0x4a5a7a, // かわら
  k: 0x6c7ea0, // かわらの つや
  W: 0xf0e6cc, // かべ
  D: 0x8a5a2e, // とびら
  S: 0x9aa0a8, // いしだん
};
const KURA = [
  '................',
  '.......OO.......',
  '.....OOkkOO.....',
  '...OOkKKKKkOO...',
  '.OOKKKKKKKKKKOO.',
  'OKKKKKKKKKKKKKKO',
  '.OOOOOOOOOOOOOO.',
  '..OWWWWWWWWWWO..',
  '..OWWWOOOOWWWO..',
  '..OWWWODDOWWWO..',
  '..OWWWODDOWWWO..',
  '..OWWWODDOWWWO..',
  '..OWWWODDOWWWO..',
  '..OOOOOOOOOOOO..',
  '.SSSSSSSSSSSSSS.',
  '................',
];

const EDITOR_PAL: Record<string, number> = {
  B: 0x3a6ea8, // わく
  F: 0x1f3a5c, // 方眼の 下地
  L: 0x4f86c4, // 方眼の 線
  R: 0xd04a3c, // 屋根
  W: 0xf0e6cc, // かべ
  K: 0x2e2438, // まど
  D: 0x8a5a2e, // 戸
};
const EDITOR = [
  '................',
  '.BBBBBBBBBBBBBB.',
  '.BFFLFFFFFFLFFB.',
  '.BFFLFFRRFFLFFB.',
  '.BFFLFRRRRFLFFB.',
  '.BLLLRRRRRRLLLB.',
  '.BFFRRRRRRRRFFB.',
  '.BFFLWWWWWWLFFB.',
  '.BFFLWKWWKWLFFB.',
  '.BFFLWWWWWWLFFB.',
  '.BLLLWWDDWWLLLB.',
  '.BFFLWWDDWWLFFB.',
  '.BFFLWWDDWWLFFB.',
  '.BFFLFFFFFFLFFB.',
  '.BBBBBBBBBBBBBB.',
  '................',
];

const TALK_PAL: Record<string, number> = {
  O: 0x3b2a1a, // ふち
  W: 0xfffaf0, // ふきだし
  D: 0xe07a3a, // 「…」の 点
};
const TALK = [
  '................',
  '...OOOOOOOOOO...',
  '..OWWWWWWWWWWO..',
  '.OWWWWWWWWWWWWO.',
  '.OWWWWWWWWWWWWO.',
  '.OWDDWWDDWWDDWO.',
  '.OWDDWWDDWWDDWO.',
  '.OWWWWWWWWWWWWO.',
  '.OWWWWWWWWWWWWO.',
  '..OWWWWWWWWWWO..',
  '...OWWOOOOOOO...',
  '..OWWO..........',
  '.OWO............',
  '.OO.............',
  '................',
  '................',
];

/** 文字の 絵 → 色。16 行 × 16 字でないもの・表に ない 字は 書きまちがいなので 投げる */
const fromRows = (rows: readonly string[], pal: Record<string, number>): Rgba[] => {
  if (rows.length !== 16) throw new Error(`絵の 行が ${rows.length} 本（16 本）`);
  const out: Rgba[] = [];
  for (const row of rows) {
    if (row.length !== 16) throw new Error(`絵の 行「${row}」が ${row.length} 字（16 字）`);
    for (const ch of row) {
      const c = pal[ch];
      if (c === undefined && ch !== '.') throw new Error(`絵の 字「${ch}」が 色の 表に ない`);
      out.push(c === undefined ? CLEAR : [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
    }
  }
  return out;
};

const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

/** えんぴつ: 左下の 先から 右上の けしゴムへ、ななめ 3 マス はば（ふち → 色の 順に 重ねる） */
function pencil(): Rgba[] {
  const p: Rgba[] = new Array<Rgba>(256).fill(CLEAR);
  const put = (x: number, y: number, c: Rgba): void => {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) p[y * 16 + x] = c;
  };
  const OUT = hex(0x3b2a1a);
  // 中心線 i = 0..9: (3 + i, 12 − i)。0 = 先、1 = けずった 木、2〜6 = 軸、7 = 金具、8〜9 = けしゴム
  const color = (i: number): Rgba => (i === 0 ? hex(0x333333) : i === 1 ? hex(0xe8c08a) : i <= 6 ? hex(i === 4 ? 0xd9a520 : 0xf2c230) : i === 7 ? hex(0xb0b4bc) : hex(0xe88aa0));
  for (let i = 0; i < 10; i++) {
    for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) put(3 + i + dx, 12 - i + dy, OUT);
  }
  for (let i = 0; i < 10; i++) {
    const x = 3 + i;
    const y = 12 - i;
    put(x, y, color(i));
    if (i >= 1) {
      put(x + 1, y, color(i));
      put(x, y + 1, color(i));
    }
  }
  return p;
}

/** メニューの 絵（ドット絵）。DOM なし */
export function houseMenuPixels(kind: 'kura' | 'editor' | 'rename' | 'talk'): Rgba[] {
  if (kind === 'kura') return fromRows(KURA, KURA_PAL);
  if (kind === 'editor') return fromRows(EDITOR, EDITOR_PAL);
  if (kind === 'talk') return fromRows(TALK, TALK_PAL);
  return pencil();
}

const cache = new Map<string, string>();

function urlOf(kind: 'kura' | 'editor' | 'rename' | 'talk'): string {
  let url = cache.get(kind);
  if (!url) {
    const c = document.createElement('canvas');
    drawPixels(c, houseMenuPixels(kind));
    url = c.toDataURL();
    cache.set(kind, url);
  }
  return url;
}

/** 照準の 下の 案内「はなす」の ふきだしの 絵（data URL。DOM の ある 所で だけ 呼ぶ） */
export function houseTalkIconUrl(): string {
  return urlOf('talk');
}

/** ボタンの 絵の URL（data URL。DOM の ある 所で だけ 呼ぶ）。ボタンの id → 絵。close は 絵なし（✕ の 字） */
export function houseButtonIcons(id: string): string[] {
  if (id === 'kura' || id === 'editor' || id === 'rename') return [urlOf(id)];
  if (id === 'build') return [extraIconUrl('hammer')];
  if (id === 'tools') return [itemIconUrl('mizumori'), itemIconUrl('dotsuki')];
  return [];
}
