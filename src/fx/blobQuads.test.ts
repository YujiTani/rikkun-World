import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BlobQuads } from './blobQuads';

/** 丸い 影の 板を まとめた 形（プレイヤーの 影に 建築士さんの 影を まぜる。HOUSE-1A）。DOM・WebGL なし */

const attr = (q: BlobQuads, name: string) => q.geometry.getAttribute(name);
const posOf = (q: BlobQuads, i: number): number[] => Array.from((attr(q, 'position').array as Float32Array).slice(i * 12, i * 12 + 12));

describe('板の 置き方', () => {
  it('i 番目の 板を (x, y, z) の まん中に 一辺 size で ねかせる。ほかの 板は そのまま', () => {
    const q = new BlobQuads(3);
    q.set(1, 10, 5, -4, 0.9, 1);
    expect(posOf(q, 1).map((v) => +v.toFixed(3))).toEqual([9.55, 5, -4.45, 9.55, 5, -3.55, 10.45, 5, -3.55, 10.45, 5, -4.45]);
    expect(posOf(q, 0).every((v) => v === 0)).toBe(true);
    expect(posOf(q, 2).every((v) => v === 0)).toBe(true);
  });

  it('こさ alpha は その 板の 4 つの 頂点だけ。色（rgb）は 白の まま', () => {
    const q = new BlobQuads(2);
    q.set(0, 0, 0, 0, 1, 0.25);
    q.set(1, 0, 0, 0, 1, 1);
    const c = attr(q, 'color').array as Float32Array;
    for (let k = 0; k < 4; k++) {
      expect(c[k * 4 + 3]).toBeCloseTo(0.25, 6);
      expect(c[16 + k * 4 + 3]).toBe(1);
    }
    expect(c.filter((_v, i) => i % 4 !== 3).every((v) => v === 1)).toBe(true);
    expect(attr(q, 'color').itemSize).toBe(4);
  });

  it('hide は 面積 0（何も 描かれない）。もういちど set で もどる', () => {
    const q = new BlobQuads(2);
    q.set(1, 3, 2, 1, 0.9, 1);
    q.hide(1);
    const p = posOf(q, 1);
    expect(new Set([p[0], p[3], p[6], p[9]]).size).toBe(1);
    expect(new Set([p[2], p[5], p[8], p[11]]).size).toBe(1);
    q.set(1, 3, 2, 1, 0.9, 1);
    expect(posOf(q, 1)[0]).toBeCloseTo(2.55, 5);
  });

  it('置くたびに 更新の 目印（version）が ふえる', () => {
    const q = new BlobQuads(2);
    const version = () => (attr(q, 'position') as THREE.BufferAttribute).version;
    const v = version();
    q.set(0, 0, 0, 0, 1, 1);
    expect(version()).toBeGreaterThan(v);
  });
});

describe('形', () => {
  it('板 1 まい = 三角形 2 つ。どの 板も おもてが 上（+y）を むく', () => {
    const n = 4;
    const q = new BlobQuads(n);
    for (let i = 0; i < n; i++) q.set(i, i * 2, 0, 0, 1, 1);
    const idx = q.geometry.getIndex()!.array;
    expect(idx.length).toBe(n * 6);
    const p = attr(q, 'position').array as Float32Array;
    for (let t = 0; t < n * 2; t++) {
      const [a, b, c] = [idx[t * 3]!, idx[t * 3 + 1]!, idx[t * 3 + 2]!];
      const ab = [p[b * 3]! - p[a * 3]!, p[b * 3 + 1]! - p[a * 3 + 1]!, p[b * 3 + 2]! - p[a * 3 + 2]!];
      const ac = [p[c * 3]! - p[a * 3]!, p[c * 3 + 1]! - p[a * 3 + 1]!, p[c * 3 + 2]! - p[a * 3 + 2]!];
      const ny = ab[2]! * ac[0]! - ab[0]! * ac[2]!;
      expect(ny, `三角形 ${t} の おもて`).toBeGreaterThan(0);
    }
    // 板どうしは 頂点を わけあわない（i 番目 = 4i〜4i+3）
    expect(Math.max(...Array.from(idx.slice(0, 6)))).toBe(3);
    expect(Math.min(...Array.from(idx.slice(6, 12)))).toBe(4);
  });

  it('絵の 座標（uv）は 板ごとに 0〜1 の 四すみ', () => {
    const q = new BlobQuads(2);
    const uv = Array.from(attr(q, 'uv').array as Float32Array);
    expect(uv.slice(0, 8)).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
    expect(uv.slice(8, 16)).toEqual([0, 0, 0, 1, 1, 1, 1, 0]);
  });
});
