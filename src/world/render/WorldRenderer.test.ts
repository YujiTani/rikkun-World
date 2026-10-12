import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld, CHUNK_SIZE } from '../VoxelWorld';
import { WorldRenderer } from './WorldRenderer';
import { chunkNearDistance } from './visibility';
import { CHUNK_DRAW_DISTANCE } from './config';

function setup() {
  const w = new ArrayVoxelWorld({ x: 128, y: 48, z: 128 });
  w.fill(0, 0, 0, 127, 0, 127, 'bedrock');
  w.fill(0, 1, 0, 127, 6, 127, 'stone');
  const r = new WorldRenderer(w);
  r.attach(new Scene());
  return { w, r };
}

describe('距離でチャンクを描く／描かない (AC15)', () => {
  it('はじめは 64 チャンクぜんぶ描く（カメラの位置を知らないうち）', () => {
    const { r } = setup();
    expect(r.chunkStats()).toMatchObject({ total: 64, drawn: 64 });
  });

  it('かどに立つと、88 より遠いチャンクは visible=false で、数は距離から計算した数と同じ', () => {
    const { r } = setup();
    r.setViewer(1, 1);
    let expected = 0;
    for (let cz = 0; cz < 8; cz++) {
      for (let cx = 0; cx < 8; cx++) {
        if (chunkNearDistance(cx, cz, 1, 1, CHUNK_SIZE) <= CHUNK_DRAW_DISTANCE) expected++;
      }
    }
    const s = r.chunkStats();
    expect(expected).toBeLessThan(64);
    expect(s.drawn).toBe(expected);
    expect(r.meshCount()).toBe(expected);
    expect(r.group.children.filter((m) => m.visible).length).toBe(expected);
  });

  it('スタート (64,64) では 64 個ぜんぶ描く。動くと切りかわる', () => {
    const { r } = setup();
    r.setViewer(64, 64);
    expect(r.chunkStats().drawn).toBe(64);
    r.setViewer(127, 127);
    const far = r.chunkStats().drawn;
    r.setViewer(64, 64);
    expect(r.chunkStats().drawn).toBe(64);
    expect(far).toBeLessThan(64);
  });

  it('遠いチャンクを作り直しても、描かないままになる', () => {
    const { w, r } = setup();
    r.setViewer(1, 1);
    const before = r.chunkStats().drawn;
    w.setBlock(126, 6, 126, 'air');
    r.update();
    expect(r.chunkStats().drawn).toBe(before);
    expect(r.group.children.filter((m) => m.visible).length).toBe(before);
  });
});
