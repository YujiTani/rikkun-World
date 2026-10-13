import type { ItemId } from '../contracts';
import type { Rgba } from '../world/blocks/textures';

/** M7-2（農業 フェーズ 2）の新しいアイテム 3 こ の ドット絵 16x16（仕様 §3.2 (1)〜(3)）。まわり 1 ドットを #2A1E14 で ふちどる */
export const M72_ITEMS = ['watering_can', 'long_watering_can', 'sprinkler'] as const;
export type M72ItemId = (typeof M72_ITEMS)[number];

export function isM72Item(item: ItemId): item is M72ItemId {
  return (M72_ITEMS as readonly string[]).includes(item);
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
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      this.put(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), c);
    }
  }
  clear(x: number, y: number): void {
    if (x >= 0 && y >= 0 && x < S && y < S) this.px[y * S + x] = CLEAR;
  }
  outline(): void {
    const src = this.px.slice();
    const near = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < S && yy < S && src[yy * S + xx][3] !== 0;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        if (src[y * S + x][3] !== 0) continue;
        if (near(x - 1, y) || near(x + 1, y) || near(x, y - 1) || near(x, y + 1)) this.px[y * S + x] = hex(OUTLINE);
      }
    }
  }
}

/** じょうろ: 青い どう体 8x8・とって・ななめ の そそぎ口・はす口（灰色） */
function wateringCan(): Rgba[] {
  const c = new Canvas();
  c.rect(2, 6, 8, 8, 0x5c9bd5);
  for (const [x, y] of [[2, 6], [9, 6], [2, 13], [9, 13]]) c.clear(x, y);
  c.rect(9, 7, 1, 6, 0x3f78b0);
  c.rect(3, 13, 6, 1, 0x3f78b0);
  c.rect(3, 7, 2, 2, 0x9cc8f0);
  for (const [x, y] of [[3, 5], [3, 4], [4, 3], [5, 3], [6, 3], [7, 3], [8, 4], [8, 5]]) c.put(x, y, 0x2f5f8f);
  c.line(10, 11, 13, 6, 0x3f78b0);
  c.line(9, 11, 12, 6, 0x3f78b0);
  c.rect(13, 4, 2, 3, 0xb0bec5);
  c.put(13, 4, 0x78909c);
  c.put(14, 6, 0x78909c);
  c.outline();
  return c.px;
}

/** ながい じょうろ: みどり・そそぎ口 が ながい・はす口 が 金色 */
function longWateringCan(): Rgba[] {
  const c = new Canvas();
  c.rect(1, 7, 6, 7, 0x4caf50);
  c.rect(6, 8, 1, 6, 0x2e7d32);
  c.rect(2, 13, 4, 1, 0x2e7d32);
  c.rect(2, 8, 1, 2, 0xa5d6a7);
  for (const [x, y] of [[2, 6], [2, 5], [3, 4], [4, 4], [5, 5], [5, 6]]) c.put(x, y, 0x1b5e20);
  c.line(7, 12, 13, 4, 0x2e7d32);
  c.line(6, 12, 12, 4, 0x2e7d32);
  c.rect(13, 2, 2, 3, 0xffd54f);
  c.put(14, 3, 0xc9a44e);
  c.put(14, 4, 0xc9a44e);
  c.put(13, 4, 0xc9a44e);
  c.outline();
  return c.px;
}

/** スプリンクラー: 横の面（12x10）・上に ふんしゃ口・左右に 水の つぶ 3 つずつ */
function sprinkler(): Rgba[] {
  const c = new Canvas();
  c.rect(2, 5, 12, 10, 0x78909c);
  c.rect(2, 9, 12, 2, 0x4fc3f7);
  c.rect(2, 13, 12, 2, 0x546e7a);
  for (const [x, y] of [[3, 6], [12, 6]]) c.put(x, y, 0x455a64);
  c.rect(6, 3, 4, 2, 0x455a64);
  for (const [x, y] of [[4, 2], [2, 3], [0, 4]]) c.rect(x, y, 2, 2, 0x81d4fa);
  for (const [x, y] of [[10, 2], [12, 3], [14, 4]]) c.rect(x, y, 2, 2, 0x81d4fa);
  c.outline();
  return c.px;
}

const cache = new Map<M72ItemId, Rgba[]>();

/** M7-2 アイテムの 16x16（y = 0 が上） */
export function m72ItemPixels(item: M72ItemId): Rgba[] {
  let p = cache.get(item);
  if (!p) {
    p = item === 'watering_can' ? wateringCan() : item === 'long_watering_can' ? longWateringCan() : sprinkler();
    cache.set(item, p);
  }
  return p;
}
