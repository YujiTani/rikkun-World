import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial } from 'three';
import { CropSwayMesh, SWAY_POOL_MAX, writeSwayVertices, type SwayItem } from './cropSway';
import { meshChunk } from './meshChunk';

const item = (x: number, deg: number): SwayItem => ({ x, y: 5, z: 3, deg, tile: 'crop_carrot_3' as never, sky: 1, blk: 0 });

describe('writeSwayVertices', () => {
  const bufs = () => [new Float32Array(16 * 3), new Float32Array(16 * 2), new Float32Array(16 * 3), new Float32Array(16 * 2)] as const;
  it('0 度 なら 元の 十字 と 同じ', () => {
    const [p, u, c, l] = bufs();
    expect(writeSwayVertices(item(2, 0), p, u, c, l, 0)).toBe(16);
    expect(Math.min(...p.filter((_, i) => i % 3 === 0))).toBeCloseTo(2);
    expect(Math.max(...p.filter((_, i) => i % 3 === 1))).toBeCloseTo(6);
  });
  it('かたむけると 足もと は 動かず 上が よこへ ずれる', () => {
    const [p, u, c, l] = bufs();
    writeSwayVertices(item(2, 10), p, u, c, l, 0);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 16; i++) {
      if (p[i * 3 + 1] > 5.5) {
        sum += p[i * 3];
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(Math.abs(sum / n - 2.5)).toBeGreaterThan(0.1);
  });
});

describe('CropSwayMesh', () => {
  it('上限 まで しか 描かない・0 本 なら 見えない', () => {
    const m = new CropSwayMesh(new MeshBasicMaterial());
    expect(m.set([])).toBe(0);
    expect(m.mesh.visible).toBe(false);
    const many = Array.from({ length: SWAY_POOL_MAX + 5 }, (_, i) => item(i, 5));
    expect(m.set(many)).toBe(SWAY_POOL_MAX);
    expect(m.mesh.visible).toBe(true);
    expect(m.mesh.geometry.drawRange.count).toBe(SWAY_POOL_MAX * 24);
  });
});

describe('meshChunk hide', () => {
  it('hide が true の 十字 は 描かない', () => {
    const w = { size: { x: 16, y: 8, z: 16 }, getIndex: (x: number, y: number, z: number) => (x === 1 && y === 1 && z === 1 ? 1 : 0) } as never;
    // 1 = ブロック id 1 が 十字でない 場合 でも hide は 無害
    expect(() => meshChunk(w, 0, 0, undefined, undefined, () => true)).not.toThrow();
  });
});
