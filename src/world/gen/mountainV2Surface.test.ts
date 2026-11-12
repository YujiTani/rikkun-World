import { describe, expect, it } from 'vitest';
import { SEA_Y } from '../../contracts';
import { v2RockBlock, v2TopBlock } from './mountainV2Surface';

/** ?mountain=v2 の 表面: 雪の まだら（上ほど 多い・かたまりで のこる）と 岩の 水平な 帯 */

/** ゆるい 坂（x が 1 ふえると 高さ 0.35 ふえる。海から 20 〜 90）に すこし でこぼこ */
const slope = (x: number, z: number): number => SEA_Y + 20 + Math.round(0.35 * x + 0.9 * Math.sin(x * 0.7 + z * 0.3) * Math.cos(z * 0.45));
const W = 200;
const D = 64;

function snowGrid(): Uint8Array {
  const g = new Uint8Array(W * D);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) g[z * W + x] = v2TopBlock(3, 'yuki', x, z + 500, slope(x, z + 500), (a, b) => slope(a, b)) === 'snow' ? 1 : 0;
  return g;
}

describe('山の形 v2: 雪の まだら', () => {
  const g = snowGrid();
  const share = (x0: number, x1: number): number => {
    let n = 0;
    for (let x = x0; x < x1; x++) for (let z = 0; z < D; z++) n += g[z * W + x]!;
    return n / ((x1 - x0) * D);
  };
  // 高さ（海から）= 20 + 0.35 x。雪の線 30（±8）= x ≈ 29（±23）
  it('上ほど 雪が 多い（まだら）: 線の ちかく < 高い 所 < 頂上の ちかく', () => {
    const low = share(0, 20);
    const mid = share(40, 60);
    const high = share(120, 140);
    const top = share(180, 200);
    expect([low, mid, high, top].map((v) => Math.round(v * 100)), 'low mid high top').toBeTruthy();
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(top).toBeGreaterThan(0.85);
    expect(top).toBeLessThan(1);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.75);
  });
  it('1 マスだけ ぽつんと 白い・白の 中に 1 マスの あな は ない（4 近傍）', () => {
    let lone = 0;
    let hole = 0;
    for (let x = 1; x < W - 1; x++) {
      for (let z = 1; z < D - 1; z++) {
        const near = g[z * W + x + 1]! + g[z * W + x - 1]! + g[(z + 1) * W + x]! + g[(z - 1) * W + x]!;
        if (g[z * W + x] === 1 && near === 0) lone++;
        if (g[z * W + x] === 0 && near === 4) hole++;
      }
    }
    expect(lone, 'ぽつん').toBe(0);
    expect(hole, 'あな').toBe(0);
  });
});

describe('山の形 v2: 岩の 帯', () => {
  it('同じ 高さなら どこでも ほぼ 同じ 材料（横の 帯）、高さが かわると かわる', () => {
    let same = 0;
    let total = 0;
    const kinds = new Set<string>();
    for (let y = 150; y < 190; y++) {
      const b0 = v2RockBlock(3, 0, y, 0);
      kinds.add(b0);
      for (let i = 1; i < 30; i++) {
        total++;
        if (v2RockBlock(3, i * 3, y, i * 5) === b0) same++;
      }
    }
    expect(same / total, '同じ 高さで 同じ 材料の わりあい').toBeGreaterThan(0.6);
    expect(kinds.size, '帯の 種類').toBeGreaterThan(1);
  });
});
