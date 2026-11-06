import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HeldTool } from './heldTool';

/** 道具を 持った 形（HOUSE-1C PR-2）: 1 つの メッシュ ＝ 描画 +1・持って いない 間は 描かない・動きの あとで 体の 大きさが もとに もどる */
function rig() {
  const sprite = new THREE.Object3D();
  sprite.scale.set(1, 2, 1);
  const tool = new HeldTool(() => sprite);
  const meshes = (): THREE.Mesh[] => {
    const out: THREE.Mesh[] = [];
    tool.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
    });
    return out;
  };
  return { tool, sprite, meshes };
}

describe('HeldTool（みずもり・どうづきを 持った 形）', () => {
  it('持って いない 間は 見えない。持つと 1 つだけ 見える（描画 +1）', () => {
    const { tool, meshes } = rig();
    expect(tool.root.visible).toBe(false);
    tool.hold('level');
    expect(tool.root.visible).toBe(true);
    expect(meshes().filter((m) => m.visible)).toHaveLength(1);
    tool.hold('tamp');
    expect(meshes().filter((m) => m.visible)).toHaveLength(1);
    tool.hold(null);
    expect(tool.root.visible).toBe(false);
  });

  it('1 つの メッシュに まとまって いる（箱ごとに 描かない）・三角形は 少ない', () => {
    const { tool, meshes } = rig();
    tool.hold('tamp');
    for (const m of meshes()) expect((m.geometry.getAttribute('position').count / 3) | 0).toBeLessThanOrEqual(7 * 12);
    expect(meshes()).toHaveLength(2); // みずもり・どうづき（見えるのは 持った 1 つだけ）
  });

  it('どうづきを 使うと 体が つぶれ、動きが おわると もとの 大きさに もどる', () => {
    const { tool, sprite } = rig();
    tool.hold('tamp');
    tool.apply();
    expect(sprite.scale.y).toBe(2);
    tool.kick();
    let squashed = false;
    for (let i = 0; i < 40; i++) {
      tool.tick();
      tool.apply();
      if (sprite.scale.y < 2) squashed = true;
    }
    expect(squashed).toBe(true);
    expect(sprite.scale.toArray()).toEqual([1, 2, 1]);
  });

  it('動きの 途中で 道具を しまっても 体の 大きさが もどる', () => {
    const { tool, sprite } = rig();
    tool.hold('level');
    tool.kick();
    for (let i = 0; i < 6; i++) {
      tool.tick();
      tool.apply();
    }
    tool.hold(null);
    expect(sprite.scale.toArray()).toEqual([1, 2, 1]);
  });

  it('使う 動きの 間、道具の 高さが かわる（どうづきの ふりあげ）', () => {
    const { tool } = rig();
    tool.hold('tamp');
    tool.apply();
    const y0 = tool.root.position.y;
    tool.kick();
    let max = y0;
    for (let i = 0; i < 20; i++) {
      tool.tick();
      tool.apply();
      max = Math.max(max, tool.root.position.y);
    }
    expect(max).toBeGreaterThan(y0 + 0.2);
  });
});
