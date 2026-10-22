// AC32: 切りつめた絵（public/models/char/）が もとの絵（art/char-sheets/）と 色番号まで 同じ
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAll, decodePng, type Cell } from '../../scripts/pack-char-atlas.mjs';
import { quantizeRgba } from './palette';

const ROOT = resolve(__dirname, '../..');
const SRC = resolve(ROOT, 'art/char-sheets/girl');
const OUT = resolve(ROOT, 'public/models/char/girl');
const CELL = 256;
const PAD = 2;

interface MotionInfo {
  frames: number;
  packed?: { width: number; height: number; cells: Cell[] };
}
const srcAtlas = JSON.parse(readFileSync(resolve(SRC, 'atlas.json'), 'utf8'));
const outAtlas = JSON.parse(readFileSync(resolve(OUT, 'atlas.json'), 'utf8'));
const names = Object.keys(srcAtlas.motions);

describe('AC32 切りつめた絵', () => {
  it('16 の動き・3,480 コマ（145 列 × 24 行）', () => {
    expect(names).toHaveLength(16);
    let cols = 0;
    for (const n of names) cols += (srcAtlas.motions[n] as MotionInfo).frames;
    expect(cols).toBe(145);
    expect(cols * 24).toBe(3480);
  });

  it('atlas.json は もとの中身 ＋ packed', () => {
    for (const k of Object.keys(srcAtlas)) {
      if (k === 'motions') continue;
      expect(outAtlas[k]).toEqual(srcAtlas[k]);
    }
    for (const n of names) {
      const { packed, ...rest } = outAtlas.motions[n] as MotionInfo;
      expect(packed).toBeTruthy();
      expect(rest).toEqual(srcAtlas.motions[n]);
    }
  });

  for (const n of names) {
    it(`${n}: 四角が ぴったり・重ならない・色番号が 1 ドットも ちがわない`, () => {
      const frames = (srcAtlas.motions[n] as MotionInfo).frames;
      const packed = (outAtlas.motions[n] as MotionInfo).packed!;
      const src = decodePng(readFileSync(resolve(SRC, `${n}.png`)));
      const out = decodePng(readFileSync(resolve(OUT, `${n}.png`)));
      expect([src.width, src.height]).toEqual([frames * CELL, 24 * CELL]);
      expect([out.width, out.height]).toEqual([packed.width, packed.height]);
      expect([2048, 4096]).toContain(packed.width);
      expect(packed.height).toBeLessThanOrEqual(8192);
      expect(packed.cells).toHaveLength(24 * frames);
      const sIdx = quantizeRgba(src.data, src.width, src.height);
      const oIdx = quantizeRgba(out.data, out.width, out.height);
      for (let row = 0; row < 24; row++) {
        for (let f = 0; f < frames; f++) {
          const c = packed.cells[row * frames + f]!;
          const [x, y, w, h, ox, oy] = c;
          expect(w).toBeGreaterThanOrEqual(1);
          expect(h).toBeGreaterThanOrEqual(1);
          expect(w).toBeLessThanOrEqual(CELL);
          expect(h).toBeLessThanOrEqual(CELL);
          expect(ox).toBeGreaterThanOrEqual(0);
          expect(oy).toBeGreaterThanOrEqual(0);
          expect(ox + w).toBeLessThanOrEqual(CELL);
          expect(oy + h).toBeLessThanOrEqual(CELL);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(x + w).toBeLessThanOrEqual(packed.width);
          expect(y + h).toBeLessThanOrEqual(packed.height);
          // もとのコマで 見えるドットの 四角
          let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
          const bx = f * CELL, by = row * CELL;
          for (let j = 0; j < CELL; j++)
            for (let i = 0; i < CELL; i++)
              if (sIdx[(by + j) * src.width + bx + i]! > 0) {
                if (i < x0) x0 = i;
                if (i > x1) x1 = i;
                if (j < y0) y0 = j;
                if (j > y1) y1 = j;
              }
          expect(x1).toBeGreaterThanOrEqual(0); // 空のコマは ない
          const ex0 = Math.max(0, x0 - PAD), ey0 = Math.max(0, y0 - PAD);
          const ex1 = Math.min(CELL - 1, x1 + PAD), ey1 = Math.min(CELL - 1, y1 + PAD);
          expect([ox, oy, w, h]).toEqual([ex0, ey0, ex1 - ex0 + 1, ey1 - ey0 + 1]);
          // もとの位置へ もどして くらべる
          for (let j = 0; j < CELL; j++) {
            for (let i = 0; i < CELL; i++) {
              const want = sIdx[(by + j) * src.width + bx + i]!;
              const inside = i >= ox && i < ox + w && j >= oy && j < oy + h;
              const got = inside ? oIdx[(y + j - oy) * out.width + x + i - ox]! : 0;
              if (got !== want) throw new Error(`${n} row${row} f${f} (${i},${j}): ${got} != ${want}`);
            }
          }
        }
      }
      // 四角どうしが 重ならない（棚づめなので 点の塗り直しで 調べる）
      const seen = new Uint8Array(packed.width * packed.height);
      for (const [x, y, w, h] of packed.cells) {
        for (let j = y; j < y + h; j++)
          for (let i = x; i < x + w; i++) {
            const k = j * packed.width + i;
            if (seen[k]) throw new Error(`${n}: 四角が 重なる (${i},${j})`);
            seen[k] = 1;
          }
      }
    });
  }

  it('スクリプトを 回しなおすと 同じ atlas.json・同じ絵', () => {
    const built = buildAll(SRC, { encode: false });
    const committed = readFileSync(resolve(OUT, 'atlas.json'), 'utf8');
    expect(built.files['atlas.json']!.toString('utf8')).toBe(committed);
    for (const n of names) {
      const out = decodePng(readFileSync(resolve(OUT, `${n}.png`)));
      const mine = built.pngs[n]!;
      expect([out.width, out.height]).toEqual([mine.width, mine.height]);
      expect(Buffer.compare(Buffer.from(out.data), Buffer.from(mine.data))).toBe(0);
    }
  }, 60000);
});
