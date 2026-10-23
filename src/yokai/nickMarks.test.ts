import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NUSHI_FLAME, buildNickMarks, createNushiFlames, updateNushiFlames } from './nickMarks';

/**
 * BAL-G 頭の印・ヌシの光（DESIGN 13.2、BALANCE §2.5、AC19 の点滅・AC21）。
 * 窓口: `src/yokai/nickMarks.ts`
 *  - `buildNickMarks(kind, title)`: { group, kind: 'hachimaki' | 'crown' } | null（おやぶん・なし・ぬりかべ は null）
 *  - `createNushiGlow({ width, height, depth })`: 光の箱 1 枚の Mesh
 *  - `NUSHI_GLOW`: { color: 0xfff0b0, period: 2.5, minOpacity: 0.06, maxOpacity: 0.12, liftRatio: 0.1 }
 *  - `nushiGlowOpacity(t秒)`: 光の すけ（0.06〜0.12 の間を なめらかに、周期 2.5 秒）
 */
function meshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => o instanceof THREE.Mesh && out.push(o));
  return out;
}
const colorsOf = (g: THREE.Object3D) => new Set(meshes(g).map((m) => (m.material as THREE.MeshBasicMaterial).color.getHex()));
const tris = (g: THREE.Object3D) => meshes(g).reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position!.count / 3), 0);
const KINDS = ['karakasa', 'chochin', 'rokurokubi', 'nurikabe'] as const;

describe('頭の印', () => {
  it('おやぶん・二つ名なし は 印なし（ぬりかべ も。#270）', () => {
    for (const k of KINDS) {
      expect(buildNickMarks(k, 'none')).toBeNull();
      expect(buildNickMarks(k, 'oyabun')).toBeNull();
    }
  });
  it('たいしょう = はちまき: きなり #FFF6E0 と あい #3D5A9E の 4 つ（帯・結び目・はし 2 本）、48 三角形以下', () => {
    for (const k of KINDS) {
      const m = buildNickMarks(k, 'taisho')!;
      expect(m.kind).toBe('hachimaki');
      expect(meshes(m.group)).toHaveLength(4);
      expect(colorsOf(m.group)).toEqual(new Set([0xfff6e0, 0x3d5a9e]));
      expect(tris(m.group)).toBeLessThanOrEqual(48);
    }
  });
  it('ヌシ = かんむり: 金 #FFD23F・濃い金 #D9A520・水色の玉 #5FD3FF。箱 8 つ以下・96 三角形以下', () => {
    for (const k of KINDS) {
      const m = buildNickMarks(k, 'nushi')!;
      expect(m.kind).toBe('crown');
      expect(colorsOf(m.group)).toEqual(new Set([0xffd23f, 0xd9a520, 0x5fd3ff]));
      expect(meshes(m.group).length).toBeLessThanOrEqual(8);
      expect(tris(m.group)).toBeLessThanOrEqual(96);
    }
  });
  it('印の材料は 色つきの MeshBasicMaterial（夜の暗さを かけられる。光らせない）', () => {
    for (const t of ['taisho', 'nushi'] as const) for (const m of meshes(buildNickMarks('karakasa', t)!.group)) {
      expect(m.material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect((m.material as THREE.Material).blending).toBe(THREE.NormalBlending);
    }
  });
});

describe('ヌシの 青い ひとだま（PROTOTYPE）', () => {
  it('3 つ・十字の板 2 まいずつ・夜も 暗くしない・うしろを 書かない。固定ステップの 時間だけで 動く', () => {
    const g = createNushiFlames({ width: 2, height: 3, depth: 2 });
    expect(g.children.length).toBe(NUSHI_FLAME.count);
    const mat = (g.children[0]!.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(g.children[0]!.children.length).toBe(2);
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.userData.skip).toBe(true);
    updateNushiFlames(g, 1.25);
    const a = g.children.map((c) => c.position.toArray().join());
    updateNushiFlames(g, 1.25);
    expect(g.children.map((c) => c.position.toArray().join())).toEqual(a);
  });
});

describe('ヌシの光は たおれる演出で 消える（G14）', () => {
  it('die() で 光が 見えなくなり、revive() で もどる', async () => {
    const { createYokai } = await import('./index');
    const m = createYokai('karakasa');
    m.setNickMarks('nushi');
    const glow = () => m.nickInfo().glow!;
    expect(glow().visible).toBe(true);
    m.die();
    m.update(0.1);
    expect(glow().visible).toBe(false);
    m.revive();
    m.update(0.1);
    expect(glow().visible).toBe(true);
  });
});
