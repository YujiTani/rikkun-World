// CHAR-2 AC33: 板の絵の引き方（切りつめた PNG の どこを 引くか）と readCell
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodePng } from '../../scripts/pack-char-atlas.mjs';
import { quantizeRgba, PALETTE_RGB } from './palette';
import { cellUniforms, cellRectCrop, shaderTexel, unpackCell, type Cell } from './packing';
import { createCharSprite } from './index';
import type { LoadImage } from './loader';
import * as THREE from 'three';
import { Lighting } from '../sky/lighting';
import { TECH_CURVES, TECH_PHASES, BOW_SHOT_TICKS, BOW_RAPID_TICKS } from './techCurves';

const ROOT = resolve(__dirname, '../..');
const SRC = resolve(ROOT, 'art/char-sheets/girl');
const OUT = resolve(ROOT, 'public/models/char/girl');
const atlas = JSON.parse(readFileSync(resolve(OUT, 'atlas.json'), 'utf8'));
const srcAtlas = JSON.parse(readFileSync(resolve(SRC, 'atlas.json'), 'utf8'));
const names = Object.keys(atlas.motions);

describe('techCurves.ts は atlas.json の写し', () => {
  it('ticks・advance・step・phases・弓の ticks が 同じ', () => {
    for (const t of ['thrust', 'kesa', 'kiriage'] as const) {
      const m = atlas.motions[{ thrust: 'katana_thrust', kesa: 'katana_kesa', kiriage: 'katana_kiriage' }[t]];
      expect(TECH_CURVES[t]).toEqual({ ticks: m.ticks, advance: m.advance, step: m.step });
      expect(TECH_PHASES[t]).toEqual(m.phases);
    }
    expect(BOW_SHOT_TICKS).toEqual(atlas.motions.bow_shot.ticks);
    expect(BOW_RAPID_TICKS).toEqual(atlas.motions.bow_rapid.ticks);
  });
});

describe('AC33 引く位置の計算', () => {
  for (const n of names) {
    it(`${n}: 段 0・1・2 × 方向 0・4 の コマの ぜんぶのドットが もとの色番号と同じ`, () => {
      const frames = srcAtlas.motions[n].frames as number;
      const packed = atlas.motions[n].packed as { width: number; height: number; cells: Cell[] };
      const src = decodePng(readFileSync(resolve(SRC, `${n}.png`)));
      const out = decodePng(readFileSync(resolve(OUT, `${n}.png`)));
      const sIdx = quantizeRgba(src.data, src.width, src.height);
      const oIdx = quantizeRgba(out.data, out.width, out.height);
      for (const tier of [0, 1, 2]) {
        for (const dir of [0, 4]) {
          const row = tier * 8 + dir;
          for (let f = 0; f < frames; f++) {
            const cell = packed.cells[row * frames + f]!;
            const u = cellUniforms(cell, packed.width, packed.height);
            const un = unpackCell(oIdx, packed.width, cell);
            for (let j = 0; j < 256; j++) {
              for (let i = 0; i < 256; i++) {
                const want = sIdx[(row * 256 + j) * src.width + f * 256 + i]!;
                const t = shaderTexel(u, packed.width, packed.height, i, j);
                const got = t ? oIdx[t.y * packed.width + t.x]! : 0;
                if (got !== want) throw new Error(`${n} row${row} f${f} (${i},${j}): 板 ${got} != ${want}`);
                if (un[j * 256 + i] !== want) throw new Error(`${n} row${row} f${f} (${i},${j}): unpack ${un[j * 256 + i]} != ${want}`);
              }
            }
          }
        }
      }
    }, 60000);
  }
});

describe('AC33 readCell (Promise)', () => {
  const fileImage: LoadImage = async (url) => {
    const name = /([A-Za-z_]+)\.png$/.exec(url)![1]!;
    const p = decodePng(readFileSync(resolve(OUT, `${name}.png`)));
    return { width: p.width, height: p.height, data: new Uint8ClampedArray(p.data) } as unknown as ImageData;
  };
  it('14 の動きの いくつかのコマが もとの PNG と ぴったり同じ（色・とうめい）', async () => {
    const sprite = createCharSprite({
      parent: new THREE.Group(),
      camera: new THREE.PerspectiveCamera(),
      lighting: new Lighting(),
      basePath: './models/char/girl/',
      loadJson: async () => atlas,
      loadImage: fileImage,
    });
    for (const n of names) {
      const frames = srcAtlas.motions[n].frames as number;
      const src = decodePng(readFileSync(resolve(SRC, `${n}.png`)));
      const sIdx = quantizeRgba(src.data, src.width, src.height);
      for (const [tier, dir, f] of [[0, 0, 0], [1, 3, frames - 1], [2, 5, Math.floor(frames / 2)]] as const) {
        const cell = await sprite.readCell(n as never, tier, dir, f);
        expect(cell.length).toBe(256 * 256 * 4);
        const row = tier * 8 + dir;
        for (let j = 0; j < 256; j++) {
          for (let i = 0; i < 256; i++) {
            const idx = sIdx[(row * 256 + j) * src.width + f * 256 + i]!;
            const o = (j * 256 + i) * 4;
            if (idx === 0) {
              if (cell[o + 3] !== 0) throw new Error(`${n} ${tier}/${dir}/${f} (${i},${j}) とうめいのはず`);
            } else {
              const c = PALETTE_RGB[idx - 1]!;
              if (cell[o] !== c[0] || cell[o + 1] !== c[1] || cell[o + 2] !== c[2] || cell[o + 3] !== 255) {
                throw new Error(`${n} ${tier}/${dir}/${f} (${i},${j}) 色がちがう`);
              }
            }
          }
        }
      }
    }
    sprite.dispose();
  }, 120000);
});

describe('cellRectCrop: 動きの 絵から 段・コマの 四角を 決める（板と 影の板で 同じ）', () => {
  it('格子の絵（packed なし）は コマ = 格子の 1 つ、crop はコマ全体', () => {
    const r = cellRectCrop({ cols: 4, packed: undefined, width: 1024, height: 6144 }, 9, 3);
    expect(r.rect).toEqual([3 / 4, 9 / 24, 1 / 4, 1 / 24]);
    expect(r.crop).toEqual([0, 0, 1, 1]);
  });
  it('コマ番号は cols - 1 までにおさえる', () => {
    const r = cellRectCrop({ cols: 4, packed: undefined, width: 1024, height: 6144 }, 0, 9);
    expect(r.rect[0]).toBe(3 / 4);
  });
  it('packed があれば cellUniforms と同じ', () => {
    const cells: Cell[] = [];
    for (let i = 0; i < 48; i++) cells.push([i, 2 * i, 20 + i, 30, 5, 6]);
    const packed = { width: 100, height: 200, cells };
    const r = cellRectCrop({ cols: 2, packed, width: 100, height: 200 }, 5, 1);
    const u = cellUniforms(cells[5 * 2 + 1]!, 100, 200);
    expect(r).toEqual(u);
  });
});
