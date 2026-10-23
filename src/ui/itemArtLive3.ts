import type { Rgba } from '../world/blocks/textures';

/**
 * LIVE-3 の 絵（art 案 A「まんが にく（まる）」。仮: オーナー が えらぶ まで は 決定 では ない）。
 * もと = /mnt/project-files/livestock/art/live3/live3-A.png を 1 ドット ずつ 読んだ もの。
 * にく は 16x16・手 は 22x23（まわり に やさしい ひかり）。'.' は すきま。
 */

const NAMA_PAL: Record<string, Rgba> = {
  A: [0x2a, 0x1e, 0x14, 255], // #2A1E14
  B: [0xf2, 0xc4, 0xbe, 255], // #F2C4BE
  C: [0xf6, 0xd3, 0xcb, 255], // #F6D3CB
  D: [0xff, 0xe6, 0xde, 255], // #FFE6DE
  E: [0xdd, 0xa0, 0xa4, 255], // #DDA0A4
  F: [0xf8, 0xf3, 0xe6, 255], // #F8F3E6
  G: [0xd6, 0xcc, 0xb6, 255], // #D6CCB6
};
const NAMA_ROWS = [
  '.........AA.....',
  '.......AABBAA...',
  '......ABBBBBBA..',
  '.....ABBCCDBBBA.',
  '....ABBCCDBBBBA.',
  '....ABBCDBBBBBBA',
  '....ABBBBBBBBBEA',
  '....ABBBBBBBBEA.',
  '...ABBBBBBBBEEA.',
  '...ABBBBBBBEEA..',
  '.AAAFBBBBBEEA...',
  'AFFFFFBBAAAA....',
  '.AFFFAAA........',
  '..AGFA..........',
  '...AGA..........',
  '....A...........',
];

const YAKI_PAL: Record<string, Rgba> = {
  A: [0x2a, 0x1e, 0x14, 255], // #2A1E14
  B: [0xd8, 0x8e, 0x3c, 255], // #D88E3C
  C: [0xe9, 0xac, 0x56, 255], // #E9AC56
  D: [0xff, 0xe9, 0xa8, 255], // #FFE9A8
  E: [0xa4, 0x5f, 0x2c, 255], // #A45F2C
  F: [0xf8, 0xf3, 0xe6, 255], // #F8F3E6
  G: [0xd6, 0xcc, 0xb6, 255], // #D6CCB6
};
const YAKI_ROWS = [
  '.........AA.....',
  '.......AABBAA...',
  '......ABBBBBBA..',
  '.....ABBCCDBBBA.',
  '....ABBCCDBBBBA.',
  '....ABBCDBBBBBBA',
  '....ABBBBBBBBBEA',
  '....ABBBBBBBBEA.',
  '...ABBBBBBBBEEA.',
  '...ABBBBBBBEEA..',
  '.AAAFBBBBBEEA...',
  'AFFFFFBBAAAA....',
  '.AFFFAAA........',
  '..AGFA..........',
  '...AGA..........',
  '....A...........',
];

const HAND_PAL: Record<string, Rgba> = {
  A: [0xff, 0xf2, 0xc4, 255], // #FFF2C4
  B: [0x2a, 0x1e, 0x14, 255], // #2A1E14
  C: [0xc9, 0x90, 0x6c, 255], // #C9906C
  D: [0xff, 0xd9, 0xb8, 255], // #FFD9B8
  E: [0xe8, 0xb4, 0x8e, 255], // #E8B48E
  F: [0xff, 0xf0, 0xdc, 255], // #FFF0DC
  G: [0xe8, 0x67, 0x9a, 255], // #E8679A
  H: [0xc2, 0x4d, 0x7e, 255], // #C24D7E
};
const HAND_ROWS = [
  '........AAAAAA........',
  '......AAAABAAAAA......',
  '....AAAABBCBBAAAAA....',
  '...AAABBDBCBEBBAAAA...',
  '..AAABDBDDCEEBEBAAAA..',
  '.AAAABDEDDCEECEBAAAAA.',
  '.AAABDDEDECCECEEBAAAA.',
  'AAAABDEDDECCEECEBAAAAA',
  'AAABDDEDEDCECECEEBAAAA',
  'AAABDDEDEDCECECEEBAAAA',
  'AAABDDDDDFCDEEEEEBAAAA',
  'AAABDDDDFFCDDEEEEBAAAA',
  'AAABDDDDFFCDDEEEEBAAAA',
  'AAAABDDDFFCDDEEEBAAAAA',
  'AAAABDDDDDCEEEEEBAAAAA',
  'AAAAABDDDDCEEEEBAAAAAA',
  '.AAAABDDDDCEEEEBAAAAA.',
  '.AAAAABGGGGGGGGBAAAAA.',
  '..AAABGGGGGGGGGGBAAA..',
  '...ABGGGGGGGGGGGGBA...',
  '...BHHHHHHHHHHHHHHB...',
  '..BHHHHHHHHHHHHHHHHB..',
  '...BBBBBBBBBBBBBBBB...',
];

const CLEAR: Rgba = [0, 0, 0, 0];

function fromRows(rows: readonly string[], pal: Record<string, Rgba>): Rgba[] {
  const p: Rgba[] = [];
  for (const row of rows) for (const ch of row) p.push(pal[ch] ?? CLEAR);
  return p;
}

export type Live3Item = 'momo_nama' | 'momo_yaki';

export function isLive3Item(item: string): item is Live3Item {
  return item === 'momo_nama' || item === 'momo_yaki';
}

/** なま・やいた もも にく の 16x16（アイテム の 絵） */
export function live3ItemPixels(item: Live3Item): Rgba[] {
  return item === 'momo_nama' ? fromRows(NAMA_ROWS, NAMA_PAL) : fromRows(YAKI_ROWS, YAKI_PAL);
}

/** いただきます の 手（あわせ手 ＋ うしろ に ひかり）。幅 × 高さ */
export const HANDS_SIZE = { w: 22, h: 23 } as const;
export function handsPixels(): Rgba[] {
  // うしろ の ひかり（やさしい 黄）は 画面 側 の ぼかし で 出す ので すきま に する
  const pal = { ...HAND_PAL };
  for (const [k, v] of Object.entries(pal)) if (v[0] === 0xff && v[1] === 0xf2 && v[2] === 0xc4) pal[k] = CLEAR;
  return fromRows(HAND_ROWS, pal);
}

/** 手 の 絵 を data URL に（DOM の ある ところ で だけ） */
export function handsUrl(): string {
  const c = document.createElement('canvas');
  c.width = HANDS_SIZE.w;
  c.height = HANDS_SIZE.h;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(HANDS_SIZE.w, HANDS_SIZE.h);
  handsPixels().forEach((p, i) => img.data.set(p, i * 4));
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}
