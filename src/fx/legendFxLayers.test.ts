import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { SlashFx } from './slashFx';
import { FujinOrbitFx } from './fujinOrbitFx';
import { RaijinStormFx } from './raijinStormFx';
import { RainbowFx } from './rainbowFx';
import { LENGTHS, installFakeDocument, makeCamera } from './legendFxTestKit';

/** LEGEND-FX AC7: 武器ごとの エフェクトは 白い 斬撃より 上に 描く（描く 順 renderOrder が 大きい）。 */
let slash: THREE.Mesh[] = [];
let own: { fujin: THREE.Mesh[]; raijin: THREE.Mesh[]; rainbow: THREE.Mesh[] };
beforeAll(() => {
  installFakeDocument();
  const scene = new THREE.Scene();
  const cam = makeCamera();
  slash = meshesOf(scene, () => new SlashFx(scene, cam));
  own = {
    fujin: meshesOf(scene, () => new FujinOrbitFx(scene, cam)),
    raijin: meshesOf(scene, () => new RaijinStormFx(scene, cam, LENGTHS)),
    rainbow: meshesOf(scene, () => new RainbowFx(scene, cam, LENGTHS)),
  };
});

const meshesOf = (scene: THREE.Scene, fn: () => unknown): THREE.Mesh[] => {
  const before = new Set<THREE.Object3D>();
  scene.traverse((o) => before.add(o));
  fn();
  const out: THREE.Mesh[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !before.has(o)) out.push(o as THREE.Mesh);
  });
  return out;
};

describe('AC7: 上の レイヤー', () => {
  it('白い 斬撃は 板 1 ＋ 火花 1 の 2 つの 形', () => {
    expect(slash).toHaveLength(2);
  });
  it.each(['fujin', 'raijin', 'rainbow'] as const)('%s の 形は ぜんぶ 白い 斬撃の どの 形より あとに 描かれる', (name) => {
    expect(own[name].length).toBeGreaterThan(0);
    const top = Math.max(...slash.map((m) => m.renderOrder));
    for (const m of own[name]) expect(m.renderOrder, `${name}`).toBeGreaterThan(top);
  });
  it('ほかの 世界の 物を 隠さない: 武器ごとの エフェクトは 深さを 書きこまない', () => {
    for (const ms of Object.values(own)) for (const m of ms) expect((m.material as THREE.Material).depthWrite).toBe(false);
  });
  it('雷・虹は 加算の 発光の 層が 通常の 層の 上', () => {
    for (const name of ['raijin', 'rainbow'] as const) {
      const normal = own[name].filter((m) => (m.material as THREE.Material).blending === THREE.NormalBlending);
      const add = own[name].filter((m) => (m.material as THREE.Material).blending === THREE.AdditiveBlending);
      expect(normal.length, name).toBeGreaterThan(0);
      expect(add.length, name).toBeGreaterThan(0);
      expect(Math.min(...add.map((m) => m.renderOrder)), name).toBeGreaterThan(Math.max(...normal.map((m) => m.renderOrder)));
    }
  });
});
