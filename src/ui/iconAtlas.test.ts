import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import index from '../assets/icons32.json';
import { ICON_SIZE, hasAtlasIcon } from './iconAtlas';
import { itemIconPixels } from './itemIcon';
import { ITEM_DEFS } from '../content/items/registry';
import type { ItemId } from '../contracts/items';

describe('ICON-32 アトラス', () => {
  it('大きさは 32、表の id は 全部 アイテム', () => {
    expect(ICON_SIZE).toBe(32);
    expect(index.size).toBe(ICON_SIZE);
    for (const id of index.ids) expect(id in ITEM_DEFS, id).toBe(true);
  });
  it('PNG の 大きさが 表と あう', () => {
    const png = readFileSync('src/assets/icons32.png');
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    expect(w).toBe(index.cols * ICON_SIZE);
    expect(h).toBe(Math.ceil(index.ids.length / index.cols) * ICON_SIZE);
  });
  it('バッチ 2 で 全アイテムに 32×32 が ある（140/140）', () => {
    const miss = (Object.keys(ITEM_DEFS) as ItemId[]).filter((id) => !hasAtlasIcon(id));
    expect(miss).toEqual([]);
  });
  it('はみ出し なし: どの アイコンも ふち線ごと 1..30 に おさまる（半とうめいの かげは のぞく）', () => {
    const { w, rgba } = decodePng(readFileSync('src/assets/icons32.png'));
    const cut: string[] = [];
    index.ids.forEach((id, k) => {
      const ox = (k % index.cols) * ICON_SIZE, oy = Math.floor(k / index.cols) * ICON_SIZE;
      for (let y = 0; y < ICON_SIZE; y++)
        for (let x = 0; x < ICON_SIZE; x++) {
          const edge = x === 0 || y === 0 || x === ICON_SIZE - 1 || y === ICON_SIZE - 1;
          if (edge && rgba[((oy + y) * w + ox + x) * 4 + 3] === 255) { if (!cut.includes(id)) cut.push(id); }
        }
    });
    expect(cut).toEqual([]);
  });
  it('どの アイテムも 32×32 か 16×16 の 代わりが ある', () => {
    for (const id of Object.keys(ITEM_DEFS) as ItemId[]) {
      if (!hasAtlasIcon(id)) expect(itemIconPixels(id).length, id).toBe(256);
    }
  });
});

/** RGBA 8bit・インターレース なしの PNG だけ 読む（pack.py が 書く 形） */
function decodePng(buf: Buffer): { w: number; h: number; rgba: Uint8Array } {
  let p = 8, w = 0, h = 0;
  const idat: Buffer[] = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); }
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = w * bpp;
  const out = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? out[y * stride + i - bpp] : 0, b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= bpp && y > 0 ? out[(y - 1) * stride + i - bpp] : 0;
      let pr = 0;
      if (f === 1) pr = a; else if (f === 2) pr = b; else if (f === 3) pr = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = (v + pr) & 255;
    }
  }
  return { w, h, rgba: out };
}
