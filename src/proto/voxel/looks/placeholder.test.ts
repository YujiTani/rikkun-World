import { describe, expect, it } from 'vitest';
import { BLOCK_TYPES } from '../../../world/blocks/blockTypes';
import { buildShapeTextureData, TEX_N } from '../shapeTexture';
import '../meshVoxel';
import { ALL_FACES, FACE_BIT, LOOK_N, LOOK_VOLUME, PALETTE_RGB, fillBlockLook, hasLook } from './placeholder';

const kinds = BLOCK_TYPES.map((_, i) => i).filter((i) => hasLook(i));
const idOf = (k: number): string => BLOCK_TYPES[k].id;

function boundaryEmpty(out: Uint8Array, face: number): number {
  let n = 0;
  for (let y = 0; y < LOOK_N; y++) {
    for (let z = 0; z < LOOK_N; z++) {
      for (let x = 0; x < LOOK_N; x++) {
        const on = [y === 8, y === 0, x === 8, x === 0, z === 8, z === 0][face];
        if (on && out[(y * 9 + z) * 9 + x] === 0) n++;
      }
    }
  }
  return n;
}

describe('仮の小ブロックの形', () => {
  it('固い種類には形がある（水・十字の板・たいまつ・空気には無い）', () => {
    for (const id of ['grass', 'dirt', 'stone', 'sand', 'coal_ore', 'iron_ore', 'log', 'leaves']) {
      expect(kinds.map(idOf)).toContain(id);
    }
    for (const id of ['air', 'water', 'torch', 'crop_onion']) expect(kinds.map(idOf)).not.toContain(id);
  });

  it('同じ入力からは いつも同じ形。位置がちがうと形がかわる', () => {
    const a = new Uint8Array(LOOK_VOLUME);
    const b = new Uint8Array(LOOK_VOLUME);
    const c = new Uint8Array(LOOK_VOLUME);
    for (const k of kinds) {
      fillBlockLook(k, 3, 4, 5, ALL_FACES, a);
      fillBlockLook(k, 3, 4, 5, ALL_FACES, b);
      fillBlockLook(k, 9, 4, 5, ALL_FACES, c);
      expect(Array.from(a)).toEqual(Array.from(b));
    }
    const stone = BLOCK_TYPES.findIndex((t) => t.id === 'stone');
    fillBlockLook(stone, 3, 4, 5, ALL_FACES, a);
    fillBlockLook(stone, 9, 4, 5, ALL_FACES, c);
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('見えない面（となりにくっつく面）の外側は ぜんぶ つまっている（はっぱ以外）', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    for (const k of kinds) {
      if (idOf(k) === 'leaves') continue;
      for (let h = 0; h < 6; h++) {
        for (let face = 0; face < 6; face++) {
          fillBlockLook(k, h * 7, 3, h * 3, ALL_FACES & ~FACE_BIT[face], out);
          expect(boundaryEmpty(out, face), `${idOf(k)} face ${face}`).toBe(0);
        }
      }
      fillBlockLook(k, 1, 1, 1, 0, out);
      expect(out.every((v) => v !== 0)).toBe(true);
    }
  });

  it('くさは 上が見えるとき上の段がでこぼこ、石は表面が所々へこむ', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    const grass = BLOCK_TYPES.findIndex((t) => t.id === 'grass');
    fillBlockLook(grass, 2, 2, 2, ALL_FACES, out);
    let topFilled = 0;
    for (let z = 0; z < 9; z++) for (let x = 0; x < 9; x++) if (out[(8 * 9 + z) * 9 + x] !== 0) topFilled++;
    expect(topFilled).toBeGreaterThan(10);
    expect(topFilled).toBeLessThan(81);
    const stone = BLOCK_TYPES.findIndex((t) => t.id === 'stone');
    let dents = 0;
    for (let i = 0; i < 20; i++) {
      fillBlockLook(stone, i, 2, 2, ALL_FACES, out);
      dents += out.filter((v) => v === 0).length;
    }
    expect(dents).toBeGreaterThan(20);
  });

  it('色番号は パレットの中、3D テクスチャは種類ぶんの大きさ', () => {
    const out = new Uint8Array(LOOK_VOLUME);
    for (const k of kinds) {
      fillBlockLook(k, 1, 2, 3, ALL_FACES, out);
      for (const v of out) expect(v * 3 + 2).toBeLessThan(PALETTE_RGB.length);
    }
    const data = buildShapeTextureData(BLOCK_TYPES.length);
    expect(data.length).toBe(TEX_N * TEX_N * TEX_N * BLOCK_TYPES.length * 4);
    // 形のある種類は ぜんぶのテクセルに色（アルファ 255）
    const stone = BLOCK_TYPES.findIndex((t) => t.id === 'stone');
    const start = stone * TEX_N * TEX_N * TEX_N * 4;
    for (let i = 0; i < TEX_N * TEX_N * TEX_N; i++) expect(data[start + i * 4 + 3]).toBe(255);
  });
});
