import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NUSHI_GLOW, buildNickMarks, createNushiGlow, nushiGlowOpacity } from './nickMarks';

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
const KINDS = ['karakasa', 'chochin', 'rokurokubi'] as const;

describe('頭の印', () => {
  it('おやぶん・二つ名なし・ぬりかべ は 印なし', () => {
    for (const k of [...KINDS, 'nurikabe'] as const) {
      expect(buildNickMarks(k, 'none')).toBeNull();
      expect(buildNickMarks(k, 'oyabun')).toBeNull();
    }
    expect(buildNickMarks('nurikabe', 'taisho')).toBeNull();
    expect(buildNickMarks('nurikabe', 'nushi')).toBeNull();
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

describe('ヌシの ふんわり光', () => {
  it('光の箱 1 枚: #FFF0B0・たし算・すけ・うしろを 書かない。地面から 高さの 1 割 うかす', () => {
    const g = createNushiGlow({ width: 2, height: 3, depth: 2 });
    const mat = g.material as THREE.MeshBasicMaterial;
    expect(mat.color.getHex()).toBe(0xfff0b0);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.opacity).toBeGreaterThanOrEqual(0.06);
    expect(mat.opacity).toBeLessThanOrEqual(0.12);
    const box = new THREE.Box3().setFromObject(g);
    expect(box.min.y).toBeCloseTo(0.3, 6);
    expect(box.max.y - box.min.y).toBeGreaterThanOrEqual(3 * 0.9);
    expect(box.max.x - box.min.x).toBeGreaterThanOrEqual(2);
  });
  it('明るさ: すけ 6%〜12% の間を なめらかに、周期 2.5 秒。点滅しない', () => {
    expect(NUSHI_GLOW).toMatchObject({ color: 0xfff0b0, period: 2.5, minOpacity: 0.06, maxOpacity: 0.12, liftRatio: 0.1 });
    let lo = 1;
    let hi = 0;
    let prev = nushiGlowOpacity(0);
    let maxStep = 0;
    for (let i = 1; i <= 60 * 10; i++) {
      const t = i / 60;
      const v = nushiGlowOpacity(t);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
      maxStep = Math.max(maxStep, Math.abs(v - prev));
      prev = v;
      expect(Math.abs(v - nushiGlowOpacity(t + 2.5))).toBeLessThan(1e-9);
    }
    expect(lo).toBeGreaterThanOrEqual(0.06 - 1e-9);
    expect(hi).toBeLessThanOrEqual(0.12 + 1e-9);
    expect(lo).toBeLessThan(0.065); // 幅を つかいきる
    expect(hi).toBeGreaterThan(0.115);
    // 1 ステップ（1/60 秒）の変わりは 幅の 1/10 以下（なめらか）。1 秒に 1 回より 速くは 明暗がかわらない（周期 2.5 秒）
    expect(maxStep).toBeLessThanOrEqual(0.06 / 10);
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
