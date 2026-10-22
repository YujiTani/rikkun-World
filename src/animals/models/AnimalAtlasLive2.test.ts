import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AnimalFx } from '../../fx/animalFx';
import { AnimalRenderer } from './AnimalRenderer';

describe('LIVE-2 つぶ の 絵（Z・いえ の しるし）', () => {
  it('12 まい 並び。Z と いえ 4 まい に 絵が ある。いえ は 1/3・2/3・ぜんぶ と 色が ふえる', () => {
    const r = new AnimalRenderer({ fx: new AnimalFx({ sound: { playTones: () => {} } }) });
    let data: Uint8Array | null = null;
    let w = 0;
    r.group.traverse((o) => {
      if (o instanceof THREE.Points) {
        const img = ((o.material as THREE.PointsMaterial).map as THREE.DataTexture).image;
        data = img.data as unknown as Uint8Array;
        w = img.width;
      }
    });
    expect(w).toBe(16 * 12);
    const px = (tile: number, pred: (r: number, g: number, b: number) => boolean): number => {
      let n = 0;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const o = (y * w + tile * 16 + x) * 4;
          if (data![o + 3] > 0 && pred(data![o], data![o + 1], data![o + 2])) n++;
        }
      }
      return n;
    };
    for (const t of [7, 8, 9, 10, 11]) expect(px(t, () => true), `tile ${t}`).toBeGreaterThan(30);
    const wood = (r0: number, g: number, b: number): boolean => r0 === 0xe0 && g === 0xa0 && b === 0x50;
    const counts = [8, 9, 10, 11].map((t) => px(t, wood));
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[3]).toBeGreaterThan(counts[2]);
    // 輪郭 の 形 は どれ も 同じ（ふち の 点 の 数）
    const edge = (r0: number, g: number, b: number): boolean => r0 === 0x5a && g === 0x3a && b === 0x24;
    expect(new Set([8, 9, 10, 11].map((t) => px(t, edge))).size).toBe(1);
    // LIVE-1 の 並び は かわらない: ハート（0）は あか
    expect(px(0, (r0, g, b) => r0 === 0xf0 && g === 0x50 && b === 0x3c)).toBeGreaterThan(10);
  });
});
