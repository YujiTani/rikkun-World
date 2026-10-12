import { drawPixels, type Pixels } from './itemIcon';

type Rgba = Pixels[number];

/** 16x16 の文字の絵（. = すきとおる）。色は PALETTE の 1 文字 */
const PALETTE: Record<string, Rgba> = {
  o: [0x2a, 0x1c, 0x10, 255],
  s: [0xf2, 0xc2, 0x8f, 255],
  d: [0xd8, 0xa0, 0x6c, 255],
  w: [255, 255, 255, 255],
  g: [0xc8, 0xcf, 0xdc, 255],
  y: [0xff, 0xc8, 0x3d, 255],
  k: [0x3a, 0x47, 0x66, 255],
  q: [0x4f, 0xc3, 0xf7, 255],
};

function fromRows(rows: readonly string[]): Pixels {
  const p: Pixels = [];
  for (let y = 0; y < 16; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < 16; x++) p.push(PALETTE[row[x] ?? '.'] ?? [0, 0, 0, 0]);
  }
  return p;
}

/** 下向きに おす手（ゆびの印。16×16 を 2 倍で出す） */
export function fingerPixels(): Pixels {
  return fromRows([
    '................',
    '...oooooooooo...',
    '..osssssssssso..',
    '..osssssssssso..',
    '..oddsdsdsddso..',
    '..osssssssssso..',
    '...ossssssssso..',
    '....ossssssso...',
    '.....osssssso...',
    '.....osssssso...',
    '.....osssssso...',
    '.....osssssso...',
    '.....osssssso...',
    '.....osssssso...',
    '.....oddddddo...',
    '......oooooo....',
  ]);
}

/** ？の印 */
export function questionPixels(): Pixels {
  return fromRows([
    '................',
    '.....oooooo.....',
    '....owwwwwwo....',
    '...owwooooowo...',
    '...owo....owo...',
    '.........owo....',
    '........owwo....',
    '.......owwo.....',
    '......owwo......',
    '......owo.......',
    '......owo.......',
    '................',
    '......owo.......',
    '......owo.......',
    '.......o........',
    '................',
  ]);
}

/** マウス（白い まるい四角。押す所が黄色） */
export function mousePixels(which: 'left' | 'right'): Pixels {
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) {
      const inBody = x >= 3 && x <= 12 && y >= 1 && y <= 14;
      if (!inBody) {
        r += '.';
        continue;
      }
      const edge = x === 3 || x === 12 || y === 1 || y === 14;
      const corner = (x === 3 || x === 12) && (y === 1 || y === 14);
      if (corner) r += '.';
      else if (edge) r += 'o';
      else if (y <= 7 && x === 7) r += 'o';
      else if (y === 8) r += 'o';
      else if (y < 8) r += (which === 'left' ? x < 7 : x > 7) ? 'y' : 'w';
      else r += 'w';
    }
    rows.push(r);
  }
  return fromRows(rows);
}

const urls = new Map<string, string>();

function urlOf(key: string, pixels: () => Pixels): string {
  let u = urls.get(key);
  if (!u) {
    const c = document.createElement('canvas');
    drawPixels(c, pixels());
    u = c.toDataURL();
    urls.set(key, u);
  }
  return u;
}

export const fingerUrl = () => urlOf('finger', fingerPixels);
export const questionUrl = () => urlOf('question', questionPixels);
export const mouseUrl = (which: 'left' | 'right') => urlOf(`mouse-${which}`, () => mousePixels(which));
