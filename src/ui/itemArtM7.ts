import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/** M7（農業）の新しいアイテム 9 こ（たね 4・やさい 4・くわ）の ドット絵 16x16（仕様 §3.2 (3)）。まわり 1 ドットを こい色 #2A1E14 で ふちどる */
export const M7_ITEMS = [
  'seed_onion',
  'seed_tomato',
  'seed_pumpkin',
  'seed_eggplant',
  'onion',
  'tomato',
  'pumpkin',
  'eggplant',
  'kuwa',
] as const;
export type M7ItemId = (typeof M7_ITEMS)[number];

export function isM7Item(item: ItemId): item is M7ItemId {
  return (M7_ITEMS as readonly string[]).includes(item);
}

const S = 16;
const CLEAR: Rgba = [0, 0, 0, 0];
const OUTLINE = 0x2a1e14;
const hex = (c: number): Rgba => [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];

class Canvas {
  readonly px: Rgba[] = new Array<Rgba>(S * S).fill(CLEAR);
  put(x: number, y: number, c: number): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    this.px[y * S + x] = hex(c);
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.put(xx, yy, c);
  }
  /** だ円（中心 cx, cy・半径 rx, ry）。右下を かげの色に、左上に 光 */
  blob(cx: number, cy: number, rx: number, ry: number, base: number, shade: number, light?: number): void {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        this.put(x, y, dx + dy > 0.7 ? shade : base);
      }
    }
    if (light !== undefined) {
      this.put(Math.round(cx - rx * 0.5), Math.round(cy - ry * 0.5), light);
      this.put(Math.round(cx - rx * 0.5) + 1, Math.round(cy - ry * 0.5), light);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      this.put(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
    }
  }
  /** まわり 1 ドット（たて・よこ 4 方向）を こい色で ふちどる */
  outline(): void {
    const src = this.px.slice();
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (src[y * S + x][3] !== 0) continue;
        const near = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < S && yy < S && src[yy * S + xx][3] !== 0;
        if (near(x - 1, y) || near(x + 1, y) || near(x, y - 1) || near(x, y + 1)) this.px[y * S + x] = hex(OUTLINE);
      }
    }
  }
}

/** 5x5 の 小さな やさい（たねの ふくろの 前） */
function miniVeg(c: Canvas, kind: 'onion' | 'tomato' | 'pumpkin' | 'eggplant', x: number, y: number): void {
  switch (kind) {
    case 'onion':
      c.rect(x + 1, y + 1, 3, 4, 0xf5f0dc);
      c.rect(x, y + 2, 5, 2, 0xf5f0dc);
      c.put(x + 4, y + 3, 0xd8cfae);
      c.put(x + 2, y, 0x43a047);
      c.put(x + 2, y + 1, 0x43a047);
      break;
    case 'tomato':
      c.rect(x, y + 1, 5, 4, 0xe53935);
      c.rect(x + 1, y + 4, 3, 1, 0xe53935);
      c.put(x + 4, y + 4, 0xb71c1c);
      c.put(x + 1, y + 1, 0xff8a80);
      c.put(x + 2, y, 0x2e7d32);
      break;
    case 'pumpkin':
      c.rect(x, y + 1, 5, 4, 0xf57c00);
      c.put(x + 2, y + 1, 0xe65100);
      c.put(x + 2, y + 2, 0xe65100);
      c.put(x + 2, y + 3, 0xe65100);
      c.put(x + 2, y, 0x6d4c41);
      break;
    case 'eggplant':
      c.rect(x + 1, y + 1, 3, 4, 0x6a1b9a);
      c.put(x + 2, y + 4, 0x9c4dcc);
      c.put(x + 1, y + 1, 0x9c4dcc);
      c.rect(x + 1, y, 3, 1, 0x2e7d32);
      break;
  }
}

function seed(kind: 'onion' | 'tomato' | 'pumpkin' | 'eggplant'): Rgba[] {
  const c = new Canvas();
  // 紙の ふくろ（はば 10・高さ 12）
  c.rect(3, 1, 10, 12, 0xe8d3a0);
  c.rect(12, 2, 1, 11, 0xc9ae78);
  c.rect(3, 12, 10, 1, 0xc9ae78);
  // 上を 折った線
  c.rect(3, 3, 10, 1, 0xa88a55);
  c.rect(3, 1, 10, 1, 0xc9ae78);
  miniVeg(c, kind, 5, 6);
  // こぼれた たね 3 つぶ
  c.put(13, 13, 0x8d6e63);
  c.put(14, 12, 0x8d6e63);
  c.put(14, 14, 0x8d6e63);
  c.outline();
  return c.px;
}

function veg(kind: 'onion' | 'tomato' | 'pumpkin' | 'eggplant'): Rgba[] {
  const c = new Canvas();
  switch (kind) {
    case 'onion': {
      // 白い玉 10x9・うすい たて すじ・上に みどりの め 2x4・下に ひげ根
      c.blob(8, 9, 5, 4.5, 0xf5f0dc, 0xd8cfae, 0xffffff);
      for (const x of [6, 9]) for (let y = 6; y <= 11; y++) if (c.px[y * S + x][3] !== 0 && c.px[y * S + x][0] === 0xf5) c.put(x, y, 0xe0d5b5);
      c.rect(7, 1, 2, 4, 0x43a047);
      c.put(7, 1, 0x7cc756);
      c.put(8, 13, 0x8a5a2e);
      c.put(7, 14, 0x8a5a2e);
      c.put(9, 14, 0x8a5a2e);
      break;
    }
    case 'tomato': {
      c.blob(8, 9, 5.5, 5, 0xe53935, 0xb71c1c);
      c.rect(5, 6, 2, 2, 0xff8a80);
      // みどりの ほし形の へた（5 ドット）
      c.put(8, 3, 0x2e7d32);
      c.put(7, 4, 0x2e7d32);
      c.put(8, 4, 0x2e7d32);
      c.put(9, 4, 0x2e7d32);
      c.put(6, 3, 0x2e7d32);
      c.put(10, 3, 0x2e7d32);
      break;
    }
    case 'pumpkin': {
      c.blob(8, 9, 6.5, 5, 0xf57c00, 0xe65100);
      for (const x of [5, 8, 11]) for (let y = 5; y <= 13; y++) if (c.px[y * S + x][3] !== 0) c.put(x, y, 0xe65100);
      c.rect(5, 6, 2, 2, 0xffb74d);
      c.rect(7, 2, 2, 3, 0x6d4c41);
      break;
    }
    case 'eggplant': {
      // むらさきの 長い形を ななめ（左下 → 右上）
      for (let i = 0; i < 12; i++) {
        const x = 2 + i * 0.85;
        const y = 13 - i * 0.8;
        const w = i < 2 ? 2 : i > 9 ? 3 : 5;
        for (let k = 0; k < w; k++) c.put(Math.round(x) + k, Math.round(y), k >= w - 2 ? 0x6a1b9a : 0x6a1b9a);
        c.put(Math.round(x) + 1, Math.round(y), 0x9c4dcc);
        if (w >= 5) c.put(Math.round(x) + 1, Math.round(y) + 1, 0x9c4dcc);
      }
      c.put(11, 3, 0x2e7d32);
      c.put(12, 3, 0x2e7d32);
      c.put(12, 2, 0x2e7d32);
      c.put(13, 2, 0x2e7d32);
      break;
    }
  }
  c.outline();
  return c.px;
}

/** くわ: つるはし と同じ ななめの 茶色の え。上はしに L 字の 灰色の 刃（よこ 5・たて 3） */
function kuwa(): Rgba[] {
  const c = new Canvas();
  c.line(2, 14, 11, 5, 0x6b4421);
  c.line(3, 14, 12, 5, 0x8a5a2e);
  c.line(2, 13, 10, 5, 0x8a5a2e);
  // L 字の 刃（よこ 5・たて 3）
  c.rect(8, 1, 5, 2, 0x9e9e9e);
  c.rect(8, 3, 2, 2, 0x9e9e9e);
  c.rect(10, 2, 3, 1, 0x757575);
  c.put(9, 4, 0x757575);
  c.put(12, 1, 0xd0d0d0);
  c.outline();
  return c.px;
}

const cache = new Map<M7ItemId, Rgba[]>();

/** M7 アイテムの 16x16（y = 0 が上） */
export function m7ItemPixels(item: M7ItemId): Rgba[] {
  let p = cache.get(item);
  if (!p) {
    if (item === 'kuwa') p = kuwa();
    else if (item.startsWith('seed_')) p = seed(item.slice(5) as 'onion');
    else p = veg(item as 'onion');
    cache.set(item, p);
  }
  return p;
}

/** 小さな絵（アイテムでない）: しずく（しめった はたけ の しるし。#6F8FB8）・月（くらい ときの しるし。#FFD54F の 三日月、ふち --rk-bg-900） */
export type FarmExtraIcon = 'droplet' | 'moon';

const DROP_ROWS = [
  '................',
  '.......XX.......',
  '.......XX.......',
  '......XXXX......',
  '......XXXX......',
  '.....XXXXXX.....',
  '.....XXXXXX.....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '....XXXXXXXX....',
  '.....XXXXXX.....',
  '......XXXX......',
  '................',
  '................',
  '................',
];

/** 三日月（外の まる 半径 6・内の まる で 右上を くりぬく） */
function moonRows(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < S; y++) {
    let r = '';
    for (let x = 0; x < S; x++) {
      const o = (x + 0.5 - 7.5) ** 2 + (y + 0.5 - 8) ** 2 <= 6.5 ** 2;
      const i = (x + 0.5 - 10.5) ** 2 + (y + 0.5 - 6) ** 2 <= 5.2 ** 2;
      r += o && !i ? 'X' : '.';
    }
    rows.push(r);
  }
  return rows;
}

export function farmExtraPixels(kind: FarmExtraIcon): Rgba[] {
  const rows = kind === 'droplet' ? DROP_ROWS : moonRows();
  const c = new Canvas();
  const color = kind === 'droplet' ? 0x6f8fb8 : 0xffd54f;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (rows[y][x] === 'X') c.put(x, y, color);
  if (kind === 'moon') c.outline();
  return c.px;
}
