import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import type { ChunkColumn } from '../../contracts';
import { ChunkStream, type StreamIO } from '../stream/ChunkStream';
import { R_DRAW, R_DRAW_DROP, cheb } from '../stream/ring';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { WorldRenderer } from './WorldRenderer';

/** ストリーミングの つなぎ（ChunkStream → 光 → WorldRenderer）。平らな石の列。本当の時間にたよらない */
function flatColumn(cx: number, cz: number, h: ArrayVoxelWorld): ChunkColumn {
  const tmp = new ArrayVoxelWorld({ x: 16, z: 16, y: 32 });
  tmp.fill(0, 0, 0, 15, 5, 15, 'stone');
  void h;
  return { cx, cz, sections: tmp.column(0, 0)!.sections.slice() };
}

function make() {
  const w = new ArrayVoxelWorld({ x: 0, z: 0, y: 32 });
  const r = new WorldRenderer(w);
  r.enableStreaming();
  r.attach(new Scene());
  const saved = new Set<number>();
  const io: StreamIO = {
    generate: (cx, cz) => flatColumn(cx, cz, w),
    has: () => false,
    read: () => null,
    persistent: () => false,
    keep: () => undefined,
    canFlush: () => false,
    flush: () => undefined,
    writing: () => false,
    saving: () => false,
  };
  void saved;
  const stream = new ChunkStream({
    world: { loadColumn: (c) => w.loadColumn(c), unloadColumn: (cx, cz) => { r.noteUnloaded(cx, cz); return w.unloadColumn(cx, cz); }, column: (cx, cz) => w.column(cx, cz), isSaveDirty: (cx, cz) => w.isSaveDirty(cx, cz), requeueSaveDirty: (l) => w.requeueSaveDirty(l) },
    light: r.streamLight(),
    mesh: r.streamMesh(),
    io,
  });
  const view = (cx: number, cz: number) => r.setViewer(cx * 16 + 8, cz * 16 + 8);
  const run = (max = 3000) => {
    stream.setWork(6);
    for (let i = 0; i < max; i++) {
      r.update();
      stream.update();
      if (stream.ready && stream.queuedCount() === 0) {
        r.update();
        return i + 1;
      }
    }
    throw new Error('おわらない');
  };
  return { w, r, stream, view, run };
}

describe('ストリーミングのメッシュ', () => {
  it('開始: 半径 2 は本当の段・半径 4 まで何かの絵。描く輪の中だけ作り、仕事は 1 こずつ数える', () => {
    const { r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    expect(stream.ready).toBe(false);
    run();
    expect(stream.ready).toBe(true);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) expect(r.streamMesh().columnState(dx, dz)).toBe('true');
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) expect(r.streamMesh().columnState(dx, dz)).not.toBe('none');
    expect(r.streamMesh().pendingJobs()).toBe(0);
    expect(r.meshStats().pending).toBe(0);
    expect(r.meshStats().meshCount).toBeGreaterThan(0);
    // 光の輪の外 (8) は メッシュなし・光の外ふち 7 は 列はあるが 絵なし
    expect(r.sectionInfo(7, 0, 0).meshes).toBe(0);
    expect(r.sectionInfo(8, 0, 0).meshes).toBe(0);
  });

  it('同じ n なら 同じコマ数でそろう（機械の速さにたよらない）', () => {
    const a = make();
    a.view(0, 0);
    a.stream.restart(0, 0, 'boot');
    const b = make();
    b.view(0, 0);
    b.stream.restart(0, 0, 'boot');
    expect(a.run()).toBe(b.run());
  });

  it('歩いて中心が変わると 外の絵 (> 7) を捨て、内がわ (≤ 6) の新しい列を作る', () => {
    const { w, r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    run();
    const before = r.meshStats().meshCount;
    expect(before).toBeGreaterThan(0);
    // 西 (-6) の列は絵がある
    expect(r.streamMesh().columnState(-6, 0)).not.toBe('none');
    view(3, 0);
    stream.setCenter(3, 0);
    run();
    // -6 は 距離 9 → 絵を捨てた（列そのものは 距離 9 なので 残る）
    expect(r.sectionInfo(-6, 0, 0).meshes).toBe(0);
    // 距離 7 (-4) は 残る
    expect(r.streamMesh().columnState(-4, 0)).not.toBe('none');
    // 新しく入る東 (9) は 描く輪の中
    expect(cheb(9, 0, 3, 0)).toBe(R_DRAW);
    expect(r.streamMesh().columnState(9, 0)).not.toBe('none');
    expect(R_DRAW_DROP).toBe(7);
    // 捨てた列は stream が捨てる (距離 11 以上) と renderer の状態も無くなる
    view(8, 0);
    stream.setCenter(8, 0);
    run();
    expect(r.sectionInfo(-4, 0, 0).meshes).toBe(0);
    expect(w.column(-4, 0)).toBeUndefined();
  });

  it('プレイヤーが変えた所は 先に作り直す (距離 −1)', () => {
    const { w, r, stream, view, run } = make();
    view(0, 0);
    stream.restart(0, 0, 'boot');
    run();
    w.setBlock(5, 3, 5, 'air');
    r.update();
    expect(r.streamMesh().nextJobDist()).toBe(-1);
    stream.setWork(1);
    r.update();
    stream.update();
    r.update();
    expect(r.streamMesh().nextJobDist() === null || r.streamMesh().nextJobDist()! >= 0).toBe(true);
  });
});
