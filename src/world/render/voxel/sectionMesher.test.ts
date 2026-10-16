import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../../VoxelWorld';
import { WorldLight } from '../../light/WorldLight';
import { SkyDarkness } from '../../light/skyDarkness';
import { SectionMesher, type SectionMeshData } from './sectionMesher';

/** 32×32 の石の台（高さ 0〜20）。ほか: bedrock は y=0 */
function slab(top = 20, height = 48): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 48, y: height, z: 48 });
  w.fill(0, 0, 0, 47, 0, 47, 'bedrock');
  w.fill(0, 1, 0, 47, top, 47, 'stone');
  return w;
}

const tris = (d: SectionMeshData) => d.triangles;
const maxOf = (d: SectionMeshData, axis: 0 | 1 | 2) => {
  let m = 0;
  for (const p of d.pieces) for (let i = axis; i < p.positions.length; i += 3) m = Math.max(m, p.positions[i]);
  return m;
};

describe('SectionMesher（セクション 1 つのメッシュ。VOX-E）', () => {
  it('全部空気のセクションは 面が 0（箱も小ブロックも）', () => {
    const w = slab();
    const m = new SectionMesher(w);
    for (const tier of ['box', 'micro'] as const) {
      const d = m.build(0, 2, 0, tier);
      expect(d.faces).toBe(0);
      expect(d.triangles).toBe(0);
      expect(d.extras.faceCount).toBe(0);
      expect(d.water.faceCount).toBe(0);
    }
  });

  it('石の台の中（まわりも石）は 面が 0。台の上の面は 箱で 1 まいにまとまる', () => {
    const w = slab(20);
    const m = new SectionMesher(w);
    expect(m.build(1, 0, 1, 'box').faces).toBe(0);
    expect(m.build(1, 0, 1, 'micro').faces).toBe(0);
    // y 16〜20 が石のセクション (1,1,1): 上の面 (y=21) が 16×16 の 1 まい。まわりも石で、横の面は無い
    const d = m.build(1, 1, 1, 'box');
    expect(d.faces).toBe(1);
    expect(tris(d)).toBe(2);
  });

  it('小ブロック（micro）は 箱（box）より 三角形が多い（ごつごつの形がある）', () => {
    const w = slab(20);
    const m = new SectionMesher(w);
    const box = m.build(1, 1, 1, 'box');
    const micro = m.build(1, 1, 1, 'micro');
    expect(micro.triangles).toBeGreaterThan(box.triangles * 4);
  });

  it('同じ入力から いつも同じ配列（決定的）', () => {
    const w = slab(20);
    const a = new SectionMesher(w).build(1, 1, 1, 'micro');
    const b = new SectionMesher(w).build(1, 1, 1, 'micro');
    expect(b.triangles).toBe(a.triangles);
    expect(b.pieces.length).toBe(a.pieces.length);
    for (let i = 0; i < a.pieces.length; i++) {
      expect(Array.from(b.pieces[i].positions)).toEqual(Array.from(a.pieces[i].positions));
      expect(Array.from(b.pieces[i].data)).toEqual(Array.from(a.pieces[i].data));
    }
  });

  it('座標はセクションの左下が 0（小ブロックの数）。箱は 0〜144 におさまる', () => {
    const w = slab(20);
    const d = new SectionMesher(w).build(1, 1, 1, 'box');
    expect(maxOf(d, 0)).toBeLessThanOrEqual(144);
    expect(maxOf(d, 2)).toBeLessThanOrEqual(144);
    expect(maxOf(d, 1)).toBe(5 * 9); // 石は y=16〜20 → 上の面は 5 ブロックぶん
  });

  it('セクションのさかい: 固いどうしの面は無い。1 ブロックほると 両がわに穴の中の面ができる', () => {
    const w = slab(40, 64);
    const m = new SectionMesher(w);
    // 石の台 y=1〜40 → セクション (1,1,1)（y 16〜31）は中まで石
    expect(m.build(1, 1, 1, 'box').faces).toBe(0);
    w.setBlock(24, 31, 24, 'air'); // セクション (1,1,1) のいちばん上の段、まんなか
    const hole = m.build(1, 1, 1, 'box');
    expect(hole.faces).toBeGreaterThan(0);
    // さかいをこえて 上のセクション (1,2,1) にも 穴の面（上のセクションの石の底は 空気の上）
    w.setBlock(24, 32, 24, 'air');
    const up = m.build(1, 2, 1, 'box');
    expect(up.faces).toBeGreaterThan(0);
  });

  it('光をあたまに焼く: たいまつの近くの面は ブロックの光が あり、遠くは 0', () => {
    const w = slab(20);
    w.setBlock(24, 21, 24, 'torch');
    const l = new WorldLight(w, new SkyDarkness());
    l.flush();
    for (const tier of ['box', 'micro'] as const) {
      const d = new SectionMesher(w, l).build(1, 1, 1, tier);
      let near = 0;
      let far = 0;
      for (const p of d.pieces) {
        for (let v = 0; v < p.vertexCount; v++) {
          const blk = p.light[v * 2 + 1];
          if (blk > 0) near++;
          else far++;
        }
      }
      expect(near, tier).toBeGreaterThan(0);
      expect(far, tier).toBeGreaterThan(0);
    }
  });

  it('光なしなら 空の光 15・ブロックの光 0（昼と同じ）', () => {
    const w = slab(20);
    const d = new SectionMesher(w).build(1, 1, 1, 'box');
    for (const p of d.pieces) {
      for (let v = 0; v < p.vertexCount; v++) {
        expect(p.light[v * 2]).toBe(255);
        expect(p.light[v * 2 + 1]).toBe(0);
      }
    }
  });

  // TEX-A（#146）: レンガは平らな箱（5.3）。実装まで it.fails。実装したら .fails を外す
  it.fails('たいまつ・十字の板・水・レンガは 別のメッシュ（extras / water）に入る。レンガは平らな箱で描く（TEX-A）', () => {
    const w = slab(20);
    w.setBlock(20, 21, 20, 'torch');
    w.setBlock(21, 21, 20, 'wild_tomato');
    w.setBlock(22, 21, 20, 'brick');
    w.fill(26, 18, 26, 28, 20, 28, 'water');
    const d = new SectionMesher(w).build(1, 1, 1, 'micro');
    expect(d.extras.faceCount).toBeGreaterThan(0);
    expect(d.water.faceCount).toBeGreaterThan(0);
    // たいまつ 5 + 十字の板 4 + レンガ 5（台の上なので下の面はかくれる）
    expect(d.extras.faceCount).toBe(5 + 4 + 5);
    const withBrick = d.faces;
    w.setBlock(22, 21, 20, 'air');
    const without = new SectionMesher(w).build(1, 1, 1, 'micro');
    expect(withBrick).not.toBe(without.faces); // 台の上の面がレンガの下でかくれる
    expect(without.extras.faceCount).toBe(d.extras.faceCount - 5);
  });

  it('小ブロック地形のとび出し: 地面のブロックの上のはみ出しは 地面のあるセクションが持つ', () => {
    // 草の地面を y=15（セクション 0 のいちばん上）に。セクション 1 は全部空気
    const w = new ArrayVoxelWorld({ x: 48, y: 48, z: 48 });
    w.fill(0, 0, 0, 47, 14, 47, 'dirt');
    w.fill(0, 15, 0, 47, 15, 47, 'grass');
    const m = new SectionMesher(w);
    const lower = m.build(1, 0, 1, 'micro');
    const upper = m.build(1, 1, 1, 'micro');
    expect(upper.faces).toBe(0);
    expect(upper.triangles).toBe(0);
    expect(maxOf(lower, 1)).toBeGreaterThan(144); // 草のふさが 上のセクションの高さにはみ出す
    expect(maxOf(lower, 1)).toBeLessThanOrEqual(144 + 9);
  });
});
