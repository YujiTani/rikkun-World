import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { pushKotatsuCell } from '../render/kotatsuMesh';
import { emptyMesh } from '../render/meshChunk';
import { KOTATSU_ART_ROWS, KOTATSU_PALETTE } from './kotatsuArt';
import { KOTATSU_CELLS, KOTATSU_TEX, isBigKotatsu, isKotatsuBlock, kotatsuAnchorOf, kotatsuUv } from './kotatsu';
import { ATLAS_COLS, ATLAS_HEIGHT, ATLAS_WIDTH, TILE_NAMES, TILE_SIZE, getTilePixels } from './textures';

function place(w: ArrayVoxelWorld, ax: number, y: number, az: number): void {
  for (const c of KOTATSU_CELLS) w.setBlock(ax + c.dx, y, az + c.dz, c.block);
}

describe('こたつ 2×2 の きまり', () => {
  it('3 マス から 本体 の マス が わかる', () => {
    expect(kotatsuAnchorOf('nukunuku', 5, 7)).toEqual({ x: 5, z: 7 });
    expect(kotatsuAnchorOf('nukunuku_e', 6, 7)).toEqual({ x: 5, z: 7 });
    expect(kotatsuAnchorOf('nukunuku_s', 5, 8)).toEqual({ x: 5, z: 7 });
    expect(kotatsuAnchorOf('nukunuku_se', 6, 8)).toEqual({ x: 5, z: 7 });
    expect(kotatsuAnchorOf('stone', 3, 3)).toEqual({ x: 3, z: 3 });
    expect(isKotatsuBlock('nukunuku_se')).toBe(true);
    expect(isKotatsuBlock('toriya_box')).toBe(false);
  });
  it('4 マス そろえば 大きい こたつ、1 マス だけ（古い セーブ）は 大きく ない', () => {
    const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
    w.setBlock(2, 5, 2, 'nukunuku');
    expect(isBigKotatsu((x, y, z) => String(w.getBlock(x, y, z)), 2, 5, 2)).toBe(false);
    place(w, 6, 5, 6);
    expect(isBigKotatsu((x, y, z) => String(w.getBlock(x, y, z)), 6, 5, 6)).toBe(true);
    w.setBlock(7, 5, 7, 'air');
    expect(isBigKotatsu((x, y, z) => String(w.getBlock(x, y, z)), 6, 5, 6)).toBe(false);
  });
});

describe('こたつ の 絵（atlas に つないで 置く）', () => {
  /** UV から atlas の 1 点 を 引いて、その 色 の 文字 を 返す */
  function charAt(u: number, v: number): string {
    const ax = Math.floor(u * ATLAS_WIDTH);
    const ay = Math.floor(v * ATLAS_HEIGHT);
    const tile = TILE_NAMES[Math.floor(ay / TILE_SIZE) * ATLAS_COLS + Math.floor(ax / TILE_SIZE)]!;
    const px = getTilePixels(tile)[(TILE_SIZE - 1 - (ay % TILE_SIZE)) * TILE_SIZE + (ax % TILE_SIZE)]!;
    if (px[3] === 0) return '.';
    const hex = '#' + [px[0], px[1], px[2]].map((c) => c.toString(16).padStart(2, '0').toUpperCase()).join('');
    return Object.entries(KOTATSU_PALETTE).find(([, h]) => h === hex)?.[0] ?? '?';
  }
  for (const key of ['top', 'slope', 'corner'] as const) {
    it(`${key}: 絵 の どの 点 も 元 の 絵 と 同じ`, () => {
      const t = KOTATSU_TEX[key];
      // 元 の 絵 を 16 の 倍数 の 大きさ に つなぎ なおす
      const rows: string[] = [];
      for (let ry = 0; ry < t.rows; ry++) {
        for (let y = 0; y < 16; y++) {
          let line = '';
          for (let cx = 0; cx < t.cols; cx++) line += KOTATSU_ART_ROWS[t.tiles[ry * t.cols + cx]!]![y]!;
          rows.push(line);
        }
      }
      for (let y = 0; y < t.h; y++) {
        for (let x = 0; x < t.w; x++) {
          const [u, v] = kotatsuUv(t, x + 0.5, y + 0.5);
          expect(charAt(u, v), `${key} (${x},${y})`).toBe(rows[y]![x]);
        }
      }
      // 絵 の 外（すきま）は 透明
      if (t.w < t.cols * 16) expect(rows[0]![t.w]).toBe('.');
    });
  }
});

describe('こたつ の メッシュ', () => {
  const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
  place(w, 6, 5, 6);
  const m = emptyMesh();
  for (const c of KOTATSU_CELLS) expect(pushKotatsuCell(m, w, undefined, 6 + c.dx, 5, 6 + c.dz, c.block)).toBe(true);
  const tri = m.indices.length / 3;
  it('三角形 は 仕様 の 1,250 より ずっと 少ない', () => {
    expect(tri).toBeGreaterThan(0);
    expect(tri).toBeLessThanOrEqual(64);
  });
  it('どの 三角形 も 上 を 向く（表 が そと）', () => {
    for (let i = 0; i < m.indices.length; i += 3) {
      const p = [0, 1, 2].map((k) => m.indices[i + k]! * 3);
      const a = [0, 1, 2].map((d) => m.positions[p[1]! + d]! - m.positions[p[0]! + d]!);
      const b = [0, 1, 2].map((d) => m.positions[p[2]! + d]! - m.positions[p[0]! + d]!);
      const ny = a[2]! * b[0]! - a[0]! * b[2]!;
      expect(ny, `三角形 ${i / 3}`).toBeGreaterThan(0);
    }
  });
  it('足もと は 2×2 の 中、天板 は 高さ 1、かど だけ 外 へ 3 点 はみ出す', () => {
    let minX = 99, maxX = -99, maxY = -99;
    for (let i = 0; i < m.positions.length; i += 3) {
      minX = Math.min(minX, m.positions[i]!);
      maxX = Math.max(maxX, m.positions[i]!);
      maxY = Math.max(maxY, m.positions[i + 1]!);
    }
    expect(maxY).toBeCloseTo(6, 6);
    expect(minX).toBeCloseTo(6 - 3 / 16, 6);
    expect(maxX).toBeCloseTo(8 + 3 / 16, 6);
  });
  it('1 マス だけ の 古い こたつ は 箱 の まま（false）', () => {
    const w1 = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
    w1.setBlock(2, 5, 2, 'nukunuku');
    expect(pushKotatsuCell(emptyMesh(), w1, undefined, 2, 5, 2, 'nukunuku')).toBe(false);
  });
});
