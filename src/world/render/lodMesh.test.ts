import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld, CHUNK_SIZE } from '../VoxelWorld';
import { WorldRenderer } from './WorldRenderer';
import { meshChunk } from './meshChunk';
import { meshChunkLod } from './lodMesh';
import { CHUNK_DRAW_DISTANCE } from './config';
import { chunkNearDistance } from './visibility';
import { BOX_OUTER, TIER_HYSTERESIS } from './voxel/tier';

/** 平地＋山っぽい凸凹＋池（128×48×128） */
export function makeBumpyWorld(): ArrayVoxelWorld {
  const w = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
  for (let z = 0; z < 128; z++) {
    for (let x = 0; x < 128; x++) {
      const bump = Math.round(5 * Math.sin(x / 9) * Math.cos(z / 11) + 3 * Math.sin((x + z) / 5));
      const top = 10 + Math.max(0, bump);
      w.setBlock(x, 0, z, 'bedrock');
      for (let y = 1; y < top - 1; y++) w.setBlock(x, y, z, 'stone');
      w.setBlock(x, top - 1, z, 'dirt');
      w.setBlock(x, top, z, top <= 9 ? 'sand' : 'grass');
      for (let y = top + 1; y <= 12; y++) w.setBlock(x, y, z, 'water');
    }
  }
  return w;
}

const tris = (m: { indices: number[] }): number => m.indices.length / 3;

describe('LOD メッシュ（遠くのかんたんメッシュ）', () => {
  it('ふつうのメッシュより三角形がずっと少ない', () => {
    const w = makeBumpyWorld();
    let full = 0;
    let lod = 0;
    for (let cz = 0; cz < 8; cz++) {
      for (let cx = 0; cx < 8; cx++) {
        const a = meshChunk(w, cx, cz);
        const b = meshChunkLod(w, cx, cz);
        full += tris(a.opaque) + tris(a.water);
        lod += tris(b.opaque) + tris(b.water);
      }
    }
    expect(lod).toBeGreaterThan(0);
    expect(lod).toBeLessThan(full * 0.5);
  });

  it('平らな所は 1 まいにまとまる。水は水面 1 まい（半透明側）。テクスチャの UV は無い', () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    w.fill(0, 0, 0, 31, 0, 31, 'bedrock');
    w.fill(0, 1, 0, 31, 3, 31, 'stone');
    w.fill(0, 4, 0, 15, 5, 15, 'water');
    const r = meshChunkLod(w, 0, 0);
    expect(r.opaque.faceCount).toBe(1); // 上の面 1 まい（まわりは同じ高さか世界の外）
    expect(r.opaque.uvs.length).toBe(0);
    expect(r.water.faceCount).toBe(1);
    expect(r.water.positions[1]).toBe(6);
  });

  it('段差のところに横の面が出る（穴があかない）', () => {
    const w = new ArrayVoxelWorld({ x: 32, y: 16, z: 32 });
    w.fill(0, 0, 0, 31, 3, 31, 'stone');
    w.fill(16, 4, 0, 31, 6, 31, 'dirt');
    const r = meshChunkLod(w, 0, 0);
    // x=15 の列の +x 向き: 低い側(15)にある。高い側は x>=16 のチャンク。このチャンクは平らで 1 まい
    expect(r.opaque.faceCount).toBe(1);
    const r2 = meshChunkLod(w, 1, 0);
    // 上の面 1 まい + 段の横の面（-x 向き）1 まい
    expect(r2.opaque.faceCount).toBe(2);
  });

  it('光（空の光）が頂点にそのまま入る', () => {
    const w = new ArrayVoxelWorld({ x: 16, y: 16, z: 16 });
    w.fill(0, 0, 0, 15, 3, 15, 'stone');
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    const d = meshChunkLod(w, 0, 0, r.light);
    expect(Math.max(...d.opaque.lights.filter((_, i) => i % 2 === 0))).toBeGreaterThan(0.9);
  });
});

describe('WorldRenderer: 距離で LOD に切りかわる', () => {
  it('lodDistance より遠いチャンクだけ LOD。近づくともとにもどる', () => {
    const w = makeBumpyWorld();
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    r.setViewer(1, 1);
    let expectedLod = 0;
    for (let cz = 0; cz < 8; cz++) {
      for (let cx = 0; cx < 8; cx++) {
        const d = chunkNearDistance(cx, cz, 1, 1, CHUNK_SIZE);
        // VOX-E: 箱 → LOD は 48 + 2 のずらし（はじめは視点なしで全部 小ブロックだったので 箱の内がわから出る）
        if (d > BOX_OUTER + TIER_HYSTERESIS && d <= CHUNK_DRAW_DISTANCE) expectedLod++;
      }
    }
    expect(expectedLod).toBeGreaterThan(0);
    expect(r.chunkStats().lodDrawn).toBe(expectedLod);
    r.setViewer(64, 64);
    expect(r.chunkStats().lodDrawn).toBeGreaterThan(0);
    r.setViewer(1, 1);
    // VOX-E: 段の境目に ±2 のずらしがあるので、行って もどると 境目の列の段が はじめと同じとは限らない（三角形の一致はやめた）
    expect(r.chunkStats().lodDrawn).toBeGreaterThan(0);
    // 1 つのチャンクに見えているのは ふつう か LOD のどちらか 1 組だけ
    expect(r.group.children.filter((m) => m.visible).length).toBe(r.meshCount());
  });

  it('LOD にすると、三角形が減る', () => {
    const w = makeBumpyWorld();
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    const all = r.triangleCount(); // viewer なし = 全部ふつう
    r.setViewer(1, 1);
    let inRangeFull = 0;
    for (let cz = 0; cz < 8; cz++) {
      for (let cx = 0; cx < 8; cx++) {
        if (chunkNearDistance(cx, cz, 1, 1, CHUNK_SIZE) > CHUNK_DRAW_DISTANCE) continue;
        const m = meshChunk(w, cx, cz, r.light);
        inRangeFull += tris(m.opaque) + tris(m.water);
      }
    }
    expect(r.triangleCount()).toBeLessThan(inRangeFull * 0.8);
    expect(all).toBeGreaterThan(r.triangleCount());
  });

  it('ブロックを置くと、LOD のチャンクも作り直される', () => {
    const w = makeBumpyWorld();
    const r = new WorldRenderer(w);
    r.attach(new Scene());
    r.setViewer(1, 1);
    const before = r.triangleCount();
    w.fill(64, 13, 64, 79, 30, 79, 'stone');
    r.update();
    expect(r.triangleCount()).not.toBe(before);
  });
});
