import { YOKAI_IDS } from '../content/yokai/ids';
import type { Rgba } from '../world/blocks/textures';
import { drawPixels, type Pixels } from './itemIcon';

/**
 * メダルの中の「印」の絵（仕様 §3「メダル」）と、ホットバーの右上の メダルの印。
 * 16×16 のドット絵をコードで描く。妖怪の顔は にこにこ寄り（こわくない）。
 * アイテムの絵は `itemIconUrl`（src/ui/itemIcon.ts）を使う。
 */

export const MARK_KINDS = [
  ...YOKAI_IDS, // 妖怪の メダルの 印は 種類ごと（足すと build() の switch が 型エラーで 絵を 求める）
  'heart',
  'shield',
  'clock',
  'moon',
  'sun',
  'footprint',
  'arrowUp',
  'star',
  'bag',
  'pouch',
  'mountain',
  'tree',
  'grass',
  'field',
  'spring',
  'pond',
  'river',
  'wave',
  'medalPile',
  'medal',
] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

const T: Rgba = [0, 0, 0, 0];
const rgb = (h: number): Rgba => [(h >> 16) & 255, (h >> 8) & 255, h & 255, 255];
const C = {
  ink: rgb(0x1f1f24),
  white: rgb(0xffffff),
  red: rgb(0xe8453c),
  pink: rgb(0xff3d6e),
  yellow: rgb(0xffc83d),
  orange: rgb(0xff8a1f),
  green: rgb(0x2e8b3d),
  lime: rgb(0x9bf26b),
  blue: rgb(0x3d7fe0),
  sky: rgb(0x4fc3f7),
  purple: rgb(0x8a5cc7),
  brown: rgb(0x7a4a24),
  gray: rgb(0x8a93a6),
  dark: rgb(0x505a68),
  sand: rgb(0xe8d3a0),
};

class Canvas16 {
  readonly p: Pixels = Array.from({ length: 256 }, () => T);
  put(x: number, y: number, c: Rgba): this {
    if (x >= 0 && x < 16 && y >= 0 && y < 16) this.p[y * 16 + x] = c;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: Rgba): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, c);
    return this;
  }
  disc(cx: number, cy: number, r: number, c: Rgba): this {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.put(x, y, c);
    return this;
  }
  /** 文字の地図で描く（. = すきとおり、文字 = palette） */
  map(rows: readonly string[], palette: Record<string, Rgba>, ox = 0, oy = 0): this {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch !== '.' && ch !== ' ' && palette[ch]) this.put(ox + x, oy + y, palette[ch]);
      }
    });
    return this;
  }
  /** にこにこの目と口 */
  smile(y = 8): this {
    this.rect(5, y, 2, 2, C.ink).rect(9, y, 2, 2, C.ink);
    this.put(5, y + 3, C.ink).put(10, y + 3, C.ink).rect(6, y + 4, 4, 1, C.ink);
    return this;
  }
}

function build(kind: MarkKind): Pixels {
  const c = new Canvas16();
  switch (kind) {
    case 'karakasa': // からかさ: 赤いかさ ＋ にこにこ
      c.disc(8, 8, 7, C.red).rect(0, 8, 16, 8, T).rect(1, 8, 14, 2, C.red).rect(7, 1, 2, 2, C.brown);
      c.rect(2, 9, 2, 1, T).rect(6, 9, 2, 1, T).rect(10, 9, 2, 1, T);
      c.rect(3, 10, 10, 5, C.sand).smile(10).rect(3, 15, 10, 1, C.brown);
      break;
    case 'chochin': // ちょうちん
      c.rect(6, 0, 4, 2, C.ink).disc(8, 8, 6, C.red).rect(5, 14, 6, 2, C.ink).rect(2, 6, 12, 1, C.orange).rect(2, 11, 12, 1, C.orange);
      c.smile(6);
      break;
    case 'nurikabe': // ぬりかべ
      c.rect(2, 1, 12, 14, C.gray).rect(2, 1, 12, 1, C.white).rect(2, 14, 12, 1, C.dark).smile(5);
      c.rect(4, 12, 8, 1, C.dark);
      break;
    case 'rokurokubi': // ろくろくび
      c.disc(8, 5, 4, C.sand).rect(7, 9, 2, 5, C.sand).rect(4, 13, 8, 3, C.purple).rect(5, 1, 6, 2, C.ink);
      c.rect(6, 4, 1, 2, C.ink).rect(9, 4, 1, 2, C.ink).rect(7, 7, 2, 1, C.ink);
      break;
    case 'tako_hachimaki': // タコはちまき: 赤い 頭 ＋ 白い はちまき ＋ 足（にこにこ）
      c.rect(3, 2, 10, 8, C.red).rect(3, 4, 10, 2, C.white).rect(11, 3, 2, 3, C.white).smile(6);
      c.rect(3, 10, 2, 5, C.red).rect(6, 10, 2, 5, C.red).rect(9, 10, 2, 5, C.red).rect(12, 10, 1, 5, C.red);
      c.rect(3, 14, 2, 1, C.white).rect(9, 14, 2, 1, C.white);
      break;
    case 'heart':
      c.map(
        ['..XXX...XXX....', '.XXXXX.XXXXX...', 'XXXXXXXXXXXXX..', 'XXXXXXXXXXXXX..', 'XXXXXXXXXXXXX..', '.XXXXXXXXXXX...', '..XXXXXXXXX....', '...XXXXXXX.....', '....XXXXX......', '.....XXX.......', '......X........'],
        { X: C.pink },
        1,
        2,
      );
      c.rect(3, 4, 2, 2, C.white);
      break;
    case 'shield':
      c.rect(2, 1, 12, 8, C.blue).map(['XXXXXXXXXXXX', '.XXXXXXXXXX.', '..XXXXXXXX..', '...XXXXXX...', '....XXXX....', '.....XX.....'], { X: C.blue }, 2, 9);
      c.rect(7, 2, 2, 11, C.yellow).rect(4, 5, 8, 2, C.yellow).rect(2, 1, 12, 1, C.white);
      break;
    case 'clock':
      c.disc(8, 8, 7, C.ink).disc(8, 8, 6, C.white).rect(7, 3, 2, 6, C.ink).rect(8, 8, 4, 2, C.red);
      break;
    case 'moon':
      c.disc(8, 8, 7, C.yellow).disc(11, 6, 6, T).put(4, 5, C.orange).put(5, 10, C.orange).put(3, 8, C.orange);
      break;
    case 'sun': {
      c.disc(8, 8, 4, C.orange).disc(8, 8, 3, C.yellow);
      for (const [x, y] of [[7, 0], [7, 14], [0, 7], [14, 7], [2, 2], [12, 2], [2, 12], [12, 12]] as const) c.rect(x, y, 2, 2, C.yellow);
      break;
    }
    case 'footprint':
      c.disc(5, 9, 2.5, C.brown).disc(11, 5, 2.5, C.brown);
      c.rect(3, 4, 1, 1, C.brown).rect(5, 3, 1, 1, C.brown).rect(9, 11, 1, 1, C.brown).rect(11, 12, 1, 1, C.brown).rect(3, 13, 3, 2, C.brown).rect(10, 9, 3, 2, C.brown);
      break;
    case 'arrowUp':
      c.map(['.....XX.....', '....XXXX....', '...XXXXXX...', '..XXXXXXXX..', '.XXXXXXXXXX.', '....XXXX....', '....XXXX....', '....XXXX....', '....XXXX....'], { X: C.green }, 2, 3);
      c.rect(4, 14, 8, 2, C.lime);
      break;
    case 'star':
      c.map(['.......XX.......', '.......XX.......', '......XXXX......', 'XXXXXXXXXXXXXXXX', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '...XXXXXXXXXX...', '...XXXXXXXXXX...', '..XXXXX..XXXXX..', '..XXXX....XXXX..', '.XXX........XXX.'], { X: C.yellow }, 0, 2);
      c.rect(7, 6, 2, 2, C.white);
      break;
    case 'bag':
      c.rect(3, 5, 10, 10, C.brown).rect(4, 4, 8, 2, C.brown).rect(5, 2, 6, 2, C.dark).rect(6, 8, 4, 3, C.yellow).rect(3, 5, 10, 1, C.orange);
      break;
    case 'pouch':
      c.disc(8, 10, 5, C.sand).rect(5, 3, 6, 3, C.sand).rect(4, 5, 8, 1, C.red).rect(3, 2, 2, 2, C.sand).rect(11, 2, 2, 2, C.sand);
      break;
    case 'mountain':
      c.map(['......XX......', '.....XXXX.....', '....XXXXXX....', '...XXXXXXXX...', '..XXXXXXXXXX..', '.XXXXXXXXXXXX.', 'XXXXXXXXXXXXXX'], { X: C.dark }, 1, 6);
      c.rect(6, 6, 4, 2, C.white).rect(5, 8, 2, 1, C.white).rect(9, 8, 2, 1, C.white).rect(0, 13, 16, 3, C.green);
      break;
    case 'tree':
      c.rect(7, 9, 2, 6, C.brown).disc(8, 6, 5, C.green).disc(6, 5, 2, C.lime);
      break;
    case 'grass':
      for (const x of [3, 7, 11]) c.rect(x, 7, 1, 8, C.green).rect(x + 1, 5, 1, 6, C.lime).rect(x - 1, 9, 1, 5, C.lime);
      c.rect(1, 14, 14, 2, C.brown);
      break;
    case 'field':
      c.rect(0, 6, 16, 10, C.brown);
      for (const y of [8, 11, 14]) c.rect(0, y, 16, 1, C.sand);
      c.rect(3, 2, 1, 6, C.green).rect(8, 2, 1, 6, C.green).rect(13, 2, 1, 6, C.green).rect(2, 2, 3, 1, C.lime).rect(7, 2, 3, 1, C.lime).rect(12, 2, 3, 1, C.lime);
      break;
    case 'spring':
      c.disc(8, 10, 6, C.dark).disc(8, 10, 5, C.sky).rect(7, 1, 2, 3, C.sky).put(5, 3, C.sky).put(10, 3, C.sky).rect(4, 8, 3, 1, C.white);
      break;
    case 'pond':
      c.disc(8, 9, 7, C.blue).disc(8, 9, 6, C.sky).rect(4, 8, 3, 1, C.white).rect(9, 11, 3, 1, C.white).rect(11, 4, 2, 2, C.green);
      break;
    case 'river':
      c.rect(0, 0, 16, 16, C.green);
      for (let y = 0; y < 16; y++) c.rect(5 + Math.round(3 * Math.sin(y / 2.5)), y, 6, 1, C.sky);
      c.rect(7, 4, 2, 1, C.white).rect(8, 10, 2, 1, C.white);
      break;
    case 'wave':
      for (const y of [4, 8, 12]) for (let x = 0; x < 16; x++) c.put(x, y + (Math.floor(x / 2) % 2), x % 4 < 2 ? C.sky : C.blue);
      c.rect(0, 14, 16, 2, C.blue);
      break;
    case 'medalPile':
      c.disc(5, 11, 4, C.yellow).disc(11, 11, 4, C.gray).disc(8, 6, 4, rgb(0xcd7f32)).rect(7, 5, 2, 2, C.white).rect(4, 10, 2, 2, C.white).rect(10, 10, 2, 2, C.white);
      break;
    case 'medal': // メダルの印（ホットバーの右上）
      c.rect(5, 0, 2, 6, C.red).rect(9, 0, 2, 6, C.blue).disc(8, 10, 5.5, C.ink).disc(8, 10, 4.5, C.yellow).map(['..X..', '.XXX.', 'XXXXX', '.XXX.', '.X.X.'], { X: C.orange }, 6, 8);
      break;
    default: {
      // 印を 足したのに 絵を 書き忘れたら 型エラー（白い絵にしない）
      const unreachable: never = kind;
      throw new Error(`medalArt: 絵の ない 印 ${String(unreachable)}`);
    }
  }
  return c.p;
}

const pixelCache = new Map<MarkKind, Pixels>();

/** 印の 16×16（キャッシュ。同じ配列を返す。変えないこと） */
export function markPixels(kind: MarkKind): Pixels {
  let p = pixelCache.get(kind);
  if (!p) {
    p = build(kind);
    pixelCache.set(kind, p);
  }
  return p;
}

const urlCache = new Map<MarkKind, string>();

/** 印の data URL（img で出す。DOM のある所でだけ呼ぶ） */
export function markUrl(kind: MarkKind): string {
  let url = urlCache.get(kind);
  if (!url) {
    const cv = document.createElement('canvas');
    drawPixels(cv, markPixels(kind));
    url = cv.toDataURL();
    urlCache.set(kind, url);
  }
  return url;
}
