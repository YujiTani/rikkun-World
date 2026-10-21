import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ITEM_TYPES } from '../inventory/items';
import { itemIconPixels } from './itemIcon';
import { W7_ITEMS, isW7Item, w7ItemPixels } from './itemArtW7';

/** WEAPON-7 → ART-PIPE-1 AC17: 雷神剣の 絵（そった むらさきの 刃 ＋ 金の 小さな つば ＋ こん色の 柄 ＋ 稲妻の 刃文） */
const ROWS_FILE = 'art/ART-PIPE-1/icon-raijin/raijin_ken_rows.txt';

/** raijin_ken_rows.txt（PAL と 16 行）を 読んで 期待の 256 点を 作る */
function expectedFromRows(): { px: number[][]; pal: Record<string, number>; rows: string[] } {
  const txt = readFileSync(ROWS_FILE, 'utf8');
  const palSrc = /const PAL = \{([^}]*)\}/.exec(txt)![1]!;
  const pal: Record<string, number> = {};
  for (const m of palSrc.matchAll(/(\w+):\s*0x([0-9a-fA-F]+)/g)) pal[m[1]!] = parseInt(m[2]!, 16);
  const rows = [...txt.matchAll(/'([^']{16})',?/g)].map((m) => m[1]!);
  const px: number[][] = [];
  for (const row of rows) {
    for (const ch of row) {
      if (ch === '.') px.push([0, 0, 0, 0]);
      else {
        const c = pal[ch]!;
        px.push([(c >> 16) & 255, (c >> 8) & 255, c & 255, 255]);
      }
    }
  }
  return { px, pal, rows };
}

describe('雷神剣の アイコン（ART-PIPE-1 AC17）', () => {
  const px = w7ItemPixels('raijin_ken');
  const hexOf = (c: ArrayLike<number>) => (c[0]! << 16) | (c[1]! << 8) | c[2]!;
  const has = (hex: number) => px.some((c) => c[3] === 255 && hexOf(c) === hex);
  const count = (hex: number) => px.filter((c) => c[3] === 255 && hexOf(c) === hex).length;
  it('16x16・アイテムの 絵の 口から 同じ 絵が 出る・ほかの 刀と ちがう', () => {
    expect(px).toHaveLength(256);
    expect(itemIconPixels('raijin_ken')).toEqual(px);
    expect(isW7Item('raijin_ken')).toBe(true);
    expect(isW7Item('katana')).toBe(false);
    expect(W7_ITEMS).toContain('raijin_ken'); // PR2 で 風神剣の 絵が 足されても よい
    for (const it of ['katana', 'crystal_katana', 'bokuto', 'fujin_ken'] as const) expect(itemIconPixels(it)).not.toEqual(px);
  });
  it('raijin_ken_rows.txt と 1 点も ちがわない（色が 12 以下）', () => {
    const exp = expectedFromRows();
    expect(exp.px).toHaveLength(256);
    for (let i = 0; i < 256; i++) {
      const a = px[i]!;
      const e = exp.px[i]!;
      expect(a[3] === 255, `点 ${i} の あり・なし`).toBe(e[3] === 255);
      if (e[3] === 255) expect(hexOf(a), `点 ${i} の 色`).toBe(hexOf(e));
    }
    const colors = new Set(px.filter((c) => c[3] === 255).map(hexOf));
    expect(colors.size).toBeLessThanOrEqual(12);
  });
  it('そった むらさきの 刃・金の 小さな つば・こん色の 柄（柄なし・大きな 丸い つばは NG）', () => {
    for (const hex of [0x1b1240, 0x33268a, 0x6a3fc8, 0xf1e4ff, 0x24336e, 0x3f56a8, 0xfff0a8]) expect(has(hex), hex.toString(16)).toBe(true);
    expect(has(0xa57cff)).toBe(true); // 刃の むらさき（新しい 絵）
    const gold = count(0xf2c230);
    expect(gold, '金の つばは 小さい').toBeGreaterThanOrEqual(2);
    expect(gold).toBeLessThanOrEqual(6);
  });
  it('稲妻（#FFF0A8）の 点は 5〜9 点で、いちばん 外の 行・列に ない', () => {
    const n = count(0xfff0a8);
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(9);
    px.forEach((c, i) => {
      if (c[3] === 255 && hexOf(c) === 0xfff0a8) {
        const x = i % 16;
        const y = Math.floor(i / 16);
        expect([x, y].some((v) => v === 0 || v === 15), `稲妻の 点 (${x},${y}) が はしに ある`).toBe(false);
      }
    });
  });
  it('アイテムの 表に ある・めずらしさの ことば どおり 1 本だけ', () => {
    expect(ITEM_TYPES.filter((t) => t.id === 'raijin_ken')).toHaveLength(1);
  });
});
