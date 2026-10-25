import * as THREE from 'three';
import { TILE_COUNT } from '../../fx/animalFxConfig';
import type { ParticleOut } from '../../fx/animalParticles';
import { atlasTexture } from './animalAtlas';

/** 点の 最大数（Points 1 つ） */
export const POINT_CAP = 480;

/** 面の 明るさ（動いた あとの 向き: 上 1.0・南北 0.8・東西 0.6・下 0.5）を かける 材料 */
export function shadeMat(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
        vShade = wn.y * wn.y * (wn.y > 0.0 ? 1.0 : 0.5) + wn.z * wn.z * 0.8 + wn.x * wn.x * 0.6;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vShade;');
  };
  return m;
}

/** 丸い 影の 絵（DOM なし。中心 0.5 → ふちで 0） */
export function blobTexture(): THREE.DataTexture {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2);
      const a = d >= 1 ? 0 : d < 0.6 ? 0.5 - (0.12 * d) / 0.6 : 0.38 * (1 - (d - 0.6) / 0.4);
      const o = (y * N + x) * 4;
      data[o + 3] = Math.round(a * 255);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** 紙ふぶき・ハート・けむり・キラッ・頭の 上の ハート を 1 回で 描く Points（光の しくみに 入れない） */
export function makePoints(): { points: THREE.Points; out: ParticleOut; attrs: THREE.BufferAttribute[] } {
  const out: ParticleOut = {
    pos: new Float32Array(POINT_CAP * 3),
    col: new Float32Array(POINT_CAP * 3),
    size: new Float32Array(POINT_CAP),
    tile: new Float32Array(POINT_CAP),
  };
  const g = new THREE.BufferGeometry();
  const attrs = [
    new THREE.BufferAttribute(out.pos, 3).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(out.col, 3).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(out.size, 1).setUsage(THREE.DynamicDrawUsage),
    new THREE.BufferAttribute(out.tile, 1).setUsage(THREE.DynamicDrawUsage),
  ];
  g.setAttribute('position', attrs[0]);
  g.setAttribute('color', attrs[1]);
  g.setAttribute('aSize', attrs[2]);
  g.setAttribute('aTile', attrs[3]);
  g.setDrawRange(0, 0);
  const m = new THREE.PointsMaterial({ size: 1, map: atlasTexture(), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'attribute float aSize;\nattribute float aTile;\nvarying float vTile;\nvoid main() {\n  vTile = aTile;')
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'varying float vTile;\nvoid main() {')
      .replace(
        '#include <map_particle_fragment>',
        `vec2 tileUv = vec2((gl_PointCoord.x + vTile) / ${TILE_COUNT}.0, gl_PointCoord.y);
         diffuseColor *= texture2D( map, tileUv );`,
      );
  };
  m.userData.noDim = true; // 夜でも 同じ 明るさ・光の しくみに 入れない
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;
  return { points, out, attrs };
}
