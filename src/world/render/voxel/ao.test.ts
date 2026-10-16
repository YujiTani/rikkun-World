import { describe, expect, it } from 'vitest';
import { AO_LEVELS, FACE_NAMES, FACE_SHADE_BY_INDEX, faceShadeTable } from '../config';
import { OCC_BYTES, OCC_NZ, OCC_W, aoAtCell, aoLevel, occGet, occIndex, packOccupancy } from './ao';
import { aoFadeFactor } from './aoUniforms';

/** うまりを 小ブロック座標の集まりから 作る */
function occOf(cells: [number, number, number][]): Uint8Array {
  const occ = new Uint8Array(OCC_BYTES);
  for (const [x, y, z] of cells) occ[occIndex(x, y, z)] |= 1 << ((x + 1) & 7);
  return occ;
}
/** 床（y < 5）と 壁 */
function floorAnd(walls: [number, number, number][]): Uint8Array {
  const cells: [number, number, number][] = [];
  for (let x = -1; x < 30; x++) for (let z = -1; z < 30; z++) for (let y = -1; y < 5; y++) cells.push([x, y, z]);
  return occOf([...cells, ...walls]);
}
const wallX = (x: number, z0: number, z1: number): [number, number, number][] => {
  const r: [number, number, number][] = [];
  for (let z = z0; z <= z1; z++) for (let y = 5; y < 12; y++) r.push([x, y, z]);
  return r;
};
const wallZ = (z: number, x0: number, x1: number): [number, number, number][] => {
  const r: [number, number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = 5; y < 12; y++) r.push([x, y, z]);
  return r;
};

describe('角の暗がり（AO）の段（TEX-A 基準 7）', () => {
  it('横の 2 つが どちらも うまっていれば 3。ほかは s1 + s2 + c', () => {
    expect(aoLevel(false, false, false)).toBe(0);
    expect(aoLevel(true, false, false)).toBe(1);
    expect(aoLevel(true, true, false)).toBe(3);
    expect(aoLevel(true, true, true)).toBe(3);
    expect(aoLevel(true, false, true)).toBe(2);
    expect(aoLevel(false, true, true)).toBe(2);
    expect(aoLevel(false, false, true)).toBe(1);
  });
  it('4 段の明るさ: 1.0 / 0.82 / 0.68 / 0.55', () => {
    expect([...AO_LEVELS]).toEqual([1.0, 0.82, 0.68, 0.55]);
  });
  it('開けた所は 1.0', () => {
    const occ = floorAnd([]);
    for (const f of [0.1, 0.5, 0.9]) expect(aoAtCell(occ, 10, 4, 10, 0, f, f)).toBe(1);
  });
  it('かべの前の床: かべに ふれる角は 0.68（s1 + c）、かべから はなれた角は 1.0。面の中は 双線形', () => {
    const occ = floorAnd(wallX(11, 0, 29)); // x = 11 に かべ。床の上の面 = y 4 の 小ブロック
    // 小ブロック (10, 4, 10) の上の面: +x がわの 2 つの角が かべに ふれる
    expect(aoAtCell(occ, 10, 4, 10, 0, 1, 0)).toBeCloseTo(0.68, 5); // +x, -z の角
    expect(aoAtCell(occ, 10, 4, 10, 0, 1, 1)).toBeCloseTo(0.68, 5);
    expect(aoAtCell(occ, 10, 4, 10, 0, 0, 0)).toBe(1);
    expect(aoAtCell(occ, 10, 4, 10, 0, 0, 1)).toBe(1);
    // 面のまんなか: 4 つの角の平均
    expect(aoAtCell(occ, 10, 4, 10, 0, 0.5, 0.5)).toBeCloseTo((0.68 + 0.68 + 1 + 1) / 4, 5);
    // 双線形: x の向きに 1.0 → 0.68
    expect(aoAtCell(occ, 10, 4, 10, 0, 0.25, 0.5)).toBeCloseTo(1 - 0.32 * 0.25, 5);
  });
  it('内かど（かべが 2 まい）の すみの角は 0.55', () => {
    const occ = floorAnd([...wallX(11, 0, 29), ...wallZ(9, 0, 29)]);
    // (10, 4, 10): +x に かべ、-z に かべ（z = 9）。+x, -z の角が 両方に ふれる
    expect(aoAtCell(occ, 10, 4, 10, 0, 1, 0)).toBeCloseTo(0.55, 5);
    expect(aoAtCell(occ, 10, 4, 10, 0, 0, 0)).toBeCloseTo(0.68, 5); // かべ z だけ
    expect(aoAtCell(occ, 10, 4, 10, 0, 0, 1)).toBe(1);
  });
  it('かべの横の面（東西・南北）でも 同じ式。かべの すその角が 暗い', () => {
    const occ = floorAnd(wallX(11, 0, 29));
    // かべの -x がわの面（西向き）の 小ブロック (11, 6, 10): 面の前 = (10, 6, 10)。すぐ下は うまりなし（空き）→ 床の上 y=5 より上
    const n = aoAtCell(occ, 11, 5, 10, 3, 0.5, 0); // 面の下のへり（b = y の 0）: 前の層の 下は 床 (y 4)
    expect(n).toBeLessThan(1);
  });
  it('AO を 消す距離: r の 8 ブロック手前から r で 0', () => {
    expect(aoFadeFactor(0, 32)).toBe(1);
    expect(aoFadeFactor(24, 32)).toBe(1);
    expect(aoFadeFactor(32, 32)).toBe(0);
    expect(aoFadeFactor(60, 32)).toBe(0);
    expect(aoFadeFactor(28, 32)).toBeCloseTo(0.5, 5);
  });
});

describe('うまりの 3D テクスチャ（S1）', () => {
  it('大きさ: 146 × 146 × 155 を 8 こずつ つめて 19 バイト。1 セクション 0.4 MB くらい', () => {
    expect(OCC_W).toBe(19);
    expect(OCC_BYTES).toBe(19 * 146 * 155);
    expect(OCC_BYTES / 1048576).toBeLessThan(0.5);
  });
  it('つめた格子を 読みもどせる（範囲の外は 空）', () => {
    const gs = 162;
    const margin = 9;
    const grid = new Uint8Array(gs * gs * gs);
    const set = (x: number, y: number, z: number) => (grid[((y + margin) * gs + (z + margin)) * gs + x + margin] = 7);
    const cells: [number, number, number][] = [[0, 0, 0], [143, 10, 143], [-1, 5, 20], [144, 151, 3], [77, 100, 144], [5, -1, 5], [8, 152, 8]];
    for (const [x, y, z] of cells) set(x, y, z);
    const out = new Uint8Array(OCC_BYTES);
    packOccupancy(grid, gs, margin, 0, gs, out);
    for (const [x, y, z] of cells) expect(occGet(out, x, y, z), `${x},${y},${z}`).toBe(true);
    expect(occGet(out, 1, 0, 0)).toBe(false);
    expect(occGet(out, 0, 1, 0)).toBe(false);
    expect(occGet(out, 143, 10, 142)).toBe(false);
    expect(occGet(out, 200, 0, 0)).toBe(false);
    // 数: 立っているビットは 7 つ
    let n = 0;
    for (const b of out) for (let k = 0; k < 8; k++) n += (b >> k) & 1;
    expect(n).toBe(cells.length);
    expect(OCC_NZ).toBe(146);
  });
  it('中身のある行だけ つめる（ほかの行は 空のまま）', () => {
    const gs = 162;
    const grid = new Uint8Array(gs * gs * gs).fill(1);
    const out = new Uint8Array(OCC_BYTES);
    packOccupancy(grid, gs, 9, 27, 54, out); // 格子の y 27〜53 → 小ブロックの y 18〜44
    expect(occGet(out, 10, 18, 10)).toBe(true);
    expect(occGet(out, 10, 44, 10)).toBe(true);
    expect(occGet(out, 10, 17, 10)).toBe(false);
    expect(occGet(out, 10, 45, 10)).toBe(false);
  });
});

describe('面の明るさ（TEX-A 基準 6）', () => {
  it('上 1.0・南北 0.8・東西 0.6・下 0.5', () => {
    expect(faceShadeTable()).toEqual({ top: 1, bottom: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 });
    expect([...FACE_SHADE_BY_INDEX]).toEqual([1, 0.5, 0.6, 0.6, 0.8, 0.8]);
    expect(FACE_NAMES.length).toBe(6);
  });
});
