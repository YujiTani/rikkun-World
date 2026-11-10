import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ArrayVoxelWorld } from '../VoxelWorld';
import { WorldRenderer } from './WorldRenderer';

/** 光と メッシュが 落ちつくまで 進める */
function settle(r: WorldRenderer): void {
  for (let n = 0; n < 2000; n++) {
    r.update();
    if (r.light.pendingCount() === 0 && r.meshStats().pending === 0) return;
  }
  throw new Error('settle: おわらない');
}

/**
 * 32×48×32。y 0〜31 は 石、その上は 空気。
 * (8,8) の 下（y 4〜8）に ほらあな。つなぐ たて穴は テストが ほる。
 */
function world(): { w: ArrayVoxelWorld; r: WorldRenderer } {
  const w = new ArrayVoxelWorld({ x: 32, y: 48, z: 32 });
  w.fill(0, 0, 0, 31, 31, 31, 'stone');
  w.fill(6, 4, 6, 12, 8, 12, 'air');
  const r = new WorldRenderer(w, 0);
  r.setViewer(8, 8);
  r.attach(new Scene());
  settle(r);
  return { w, r };
}

function look(r: WorldRenderer, eye: [number, number, number], at: [number, number, number]): void {
  const cam = new PerspectiveCamera(70, 16 / 9, 0.1, 200);
  cam.position.set(eye[0], eye[1], eye[2]);
  cam.lookAt(at[0], at[1], at[2]);
  cam.updateProjectionMatrix();
  r.applyView(cam);
}

describe('地下の メッシュを かくす', () => {
  it('ふさがった ほらあなは 描かず、地面は 描く。穴を あけて のぞくと 描き、そらすと かくす', () => {
    const { w, r } = world();
    // たて穴の まえ: ほらあなは 空と つながっていないので メッシュが 無い（見えない 印）か、あっても かくす
    look(r, [8.5, 40, 8.5], [8.5, 0, 8.5]);
    expect(r.sectionMeshVisible(0, 1, 0), '地面').toBe(true);
    const sealed = r.sectionMeshVisible(0, 0, 0);
    expect(sealed === null || sealed === false, 'ふさがった ほらあな').toBe(true);

    for (let y = 9; y <= 40; y++) w.setBlock(8, y, 8, 'air');
    settle(r);
    look(r, [8.5, 40, 8.5], [8.5, 4, 8.5]);
    expect(r.caveStats().complete, 'さがしきる').toBe(true);
    expect(r.sectionMeshVisible(0, 0, 0), '穴を のぞく').toBe(true);
    expect(r.sectionMeshVisible(0, 1, 0), 'のぞいても 地面').toBe(true);

    look(r, [8.5, 40, 24], [8.5, 40, 40]);
    expect(r.sectionMeshVisible(0, 0, 0), '穴から 目を そらす').toBe(false);
    expect(r.sectionMeshVisible(0, 1, 1), '前の 地面').toBe(true);

    // 別の カメラで 描く 物（影の 地図・調べる用の 1 画素）は かくした 分も 見る。おわったら また かくす
    expect(r.withAllSections(() => r.sectionMeshVisible(0, 0, 0)), '一時 ぜんぶ 見せる').toBe(true);
    expect(r.sectionMeshVisible(0, 0, 0), 'おわったら また かくす').toBe(false);

    for (let y = 9; y <= 40; y++) w.setBlock(8, y, 8, 'stone');
    settle(r);
    look(r, [8.5, 40, 8.5], [8.5, 4, 8.5]);
    const closed = r.sectionMeshVisible(0, 0, 0);
    expect(closed === null || closed === false, '穴を ふさいだら ほらあなは 見えない').toBe(true);
    expect(r.sectionMeshVisible(0, 1, 0), 'ふさいても 地面').toBe(true);
  });
});
