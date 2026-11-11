import { describe, expect, it } from 'vitest';
import { fillBambooVoxel } from './leafBambooFill';

const N = 9;
const cells = (out: Uint8Array, pick: (x: number, y: number, z: number) => boolean): number => {
  let n = 0;
  for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (out[(y * N + z) * N + x] === 1 && pick(x, y, z)) n++;
  return n;
};

describe('fillBambooVoxel（細い たけ。yuzu 2026-11-11）', () => {
  it('稈は はば 2、ふしは はば 4 で 高さ 1（ふしの 間は 長い）', () => {
    const out = new Uint8Array(N * N * N);
    fillBambooVoxel(0, 0, 0, 0, out); // 上も 下も ふさがれて いる = 葉なし
    const row = (y: number) => cells(out, (_x, yy) => yy === y);
    const widths = Array.from({ length: N }, (_, y) => row(y));
    expect(widths.filter((n) => n === 4).length, '稈（2×2 = 4 マス）の 段').toBeGreaterThanOrEqual(7);
    expect(widths.filter((n) => n === 16).length, 'ふし（4×4 = 16 マス）の 段').toBe(1);
  });

  it('てっぺん（上が あいている）には 必ず 葉の ふさ', () => {
    const top = new Uint8Array(N * N * N);
    fillBambooVoxel(1, 3, 7, 5, top);
    const bare = new Uint8Array(N * N * N);
    fillBambooVoxel(0, 3, 7, 5, bare);
    expect(cells(top, () => true)).toBeGreaterThan(cells(bare, () => true));
  });

  it('横の 葉は 場所で 決まり（同じ 場所は 同じ 形）、上が あいて いない 段の 約 1/3 に 出る。いちばん 下（下が ふさがれた 段）には 出ない', () => {
    const base = cells((() => { const o = new Uint8Array(N * N * N); fillBambooVoxel(0, 0, 0, 0, o); return o; })(), () => true);
    let withLeaf = 0;
    const total = 300;
    for (let i = 0; i < total; i++) {
      const a = new Uint8Array(N * N * N), b = new Uint8Array(N * N * N);
      fillBambooVoxel(0b10, 10 + i, 20, 30 + i * 7, a); // 下が あいて いる（下の 段ではない）
      fillBambooVoxel(0b10, 10 + i, 20, 30 + i * 7, b);
      expect(Array.from(a)).toEqual(Array.from(b));
      if (cells(a, () => true) > base) withLeaf++;
    }
    expect(withLeaf / total).toBeGreaterThan(0.2);
    expect(withLeaf / total).toBeLessThan(0.5);
    for (let i = 0; i < 50; i++) {
      const a = new Uint8Array(N * N * N);
      fillBambooVoxel(0, 10 + i, 20, 30 + i * 7, a); // 下が ふさがれた = 根もと
      expect(cells(a, () => true)).toBe(base);
    }
  });
});
