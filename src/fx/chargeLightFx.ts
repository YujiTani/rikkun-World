import * as THREE from 'three';
import type { ChargeLightView, ChargePalette } from '../legend/chargeLight';
import type { HandInfo } from '../legend/handPos';
import { DotPoints } from './dotPoints';

/**
 * WEAPON-8 §3.5: ため中の 手もとの 光（T1）の 絵。素材 `public/models/fx/charge_light.{png,json}`（雷神剣・風神剣 共通。色の 表だけ ちがう）。
 * - 板 3 まい（芯・輪・剣先の きらり。カメラに 向く）を 1 つの メッシュで 1 回 ＋ 点（すいこまれる つぶ・光の 走り・回る つぶ）1 回 = 描画 2・三角形 6。
 * - 光は 剣を 持つ 手に あつまる。体は かくさない（深さの 判定は しない）。うすく なる ときは 網で ぬく（半透明の 点は 作らない）。
 * - 「動きを減らす」の ふるまいは `ChargeLightView`（つぶ・輪・回る つぶ なし）が 決める。
 */
const BASE = './models/fx/';
const SHEET = 128;
const QUAD_DOT = 1 / 16;

/** 絵の 場所 [x, y, w, h]（`charge_light.json` の sprites） */
const CORES: readonly (readonly number[])[] = [0, 1, 2, 3, 4, 5].map((i) => [i * 10, 0, 9, 9]);
const RINGS: readonly (readonly number[])[] = [
  [60, 0, 11, 11],
  [72, 0, 11, 11],
  [84, 0, 13, 13],
  [98, 0, 13, 13],
  [112, 0, 15, 15],
  [0, 16, 15, 15],
  [16, 16, 17, 17],
  [34, 16, 17, 17],
  [52, 16, 19, 19],
  [72, 16, 19, 19],
  [92, 16, 21, 21],
  [0, 38, 21, 21],
];
const STAR: readonly number[] = [22, 38, 7, 7];

export const CHARGE_PALETTES: Record<ChargePalette, readonly string[]> = {
  fujin: ['#F4FCFF', '#CDEFFC', '#8FD6F2', '#4FA8D8', '#2B6699'],
  raijin: ['#FFF8DC', '#FFE98A', '#F0C24A', '#9A7430', '#4E3C1A'],
};

const VERT = `
attribute vec4 aRect;
varying vec2 vUv;
varying vec4 vRect;
void main() {
  vUv = uv;
  vRect = aRect;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform sampler2D uTex;
uniform vec3 uPal[5];
uniform float uLevel;
varying vec2 vUv;
varying vec4 vRect;
void main() {
  vec2 p = floor(vec2(vRect.x + vUv.x * vRect.z, vRect.y + (1.0 - vUv.y) * vRect.w));
  vec4 c = texture2D(uTex, (p + 0.5) / ${SHEET}.0);
  if (c.a < 0.5) discard;
  if (uLevel > 0.5 && mod(p.x + p.y, 4.0) < uLevel) discard;
  int i = int(clamp(floor((255.0 - c.r * 255.0) / 51.0 + 0.5), 0.0, 4.0));
  vec3 col = uPal[0];
  for (int k = 1; k < 5; k++) if (k == i) col = uPal[k];
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

function hash(n: number): number {
  let x = (n * 374761393 + 668265263) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export interface ChargeLightFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
}

export class ChargeLightFx {
  private readonly quads: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly rect: Float32Array;
  private readonly geo = new THREE.BufferGeometry();
  private readonly dots = new DotPoints(64, { depthTest: false, renderOrder: 71 });
  private readonly tex: THREE.Texture;
  private readonly pal: Record<ChargePalette, THREE.Color[]> = {
    fujin: CHARGE_PALETTES.fujin.map((c) => new THREE.Color(c)),
    raijin: CHARGE_PALETTES.raijin.map((c) => new THREE.Color(c)),
  };
  private readonly camR = new THREE.Vector3();
  private readonly camU = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly tipP = new THREE.Vector3();
  private readonly body = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly dirv = new THREE.Vector3();

  constructor(private readonly deps: ChargeLightFxDeps) {
    this.tex = new THREE.TextureLoader().load(`${deps.basePath ?? BASE}charge_light.png`);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.flipY = false;
    this.pos = new Float32Array(12 * 3);
    this.rect = new Float32Array(12 * 4);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute('aRect', new THREE.BufferAttribute(this.rect, 4));
    this.geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.tex }, uPal: { value: this.pal.fujin }, uLevel: { value: 0 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.quads = new THREE.Mesh(this.geo, this.mat);
    this.quads.frustumCulled = false;
    this.quads.renderOrder = 70;
    this.quads.visible = false;
    deps.scene.add(this.quads);
    deps.scene.add(this.dots.points);
  }

  private quad(i: number, r: readonly number[], center: THREE.Vector3, scale: number): void {
    const hw = (r[2]! * QUAD_DOT * scale) / 2;
    const hh = (r[3]! * QUAD_DOT * scale) / 2;
    const corners = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as const;
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      const c = corners[k]!;
      this.tmp.copy(center).addScaledVector(this.camR, c[0]).addScaledVector(this.camU, c[1]);
      this.pos[v * 3] = this.tmp.x;
      this.pos[v * 3 + 1] = this.tmp.y;
      this.pos[v * 3 + 2] = this.tmp.z;
      this.rect[v * 4] = r[0]!;
      this.rect[v * 4 + 1] = r[1]!;
      this.rect[v * 4 + 2] = r[2]!;
      this.rect[v * 4 + 3] = r[3]!;
    }
  }
  private hideQuad(i: number): void {
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      this.pos[v * 3] = this.pos[v * 3 + 1] = this.pos[v * 3 + 2] = 0;
    }
  }

  /** 1 ステップに 1 回。body = 体の まん中（つぶが 体の 前を 横切らない ための 向き。なければ 下） */
  step(v: ChargeLightView, h: HandInfo, body: { x: number; y: number; z: number } | null): void {
    if (v.phase === 'off' || !v.palette) {
      this.quads.visible = false;
      this.dots.reset();
      this.dots.done();
      return;
    }
    const cam = this.deps.camera;
    const k = h.scale;
    this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this.camU.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.hand.set(h.world.x, h.world.y, h.world.z);
    this.tipP.set(h.tip.x, h.tip.y, h.tip.z);
    const pal = this.pal[v.palette];
    const level = Math.round((1 - v.alpha) * 4);
    this.mat.uniforms.uPal!.value = pal;
    this.mat.uniforms.uLevel!.value = level;

    // 板 3 まい: 芯・輪・剣先の きらり
    this.quad(0, CORES[Math.max(0, Math.min(5, v.core))]!, this.hand, k);
    if (v.ring > 0) this.quad(1, RINGS[Math.max(0, Math.min(11, Math.round(v.ring * 12) - 1))]!, this.hand, k);
    else this.hideQuad(1);
    if (v.sparkles > 0) this.quad(2, STAR, this.tipP, k);
    else this.hideQuad(2);
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aRect') as THREE.BufferAttribute).needsUpdate = true;
    this.quads.visible = true;

    // 点
    const d = this.dots;
    d.reset();
    const F = v.F;
    if (v.particles > 0) {
      // 体の まん中の 向き（画面の 平面で）。この 向きの ±70° からは つぶを 出さない
      let phiB = -Math.PI / 2;
      if (body) {
        this.body.set(body.x, body.y, body.z).sub(this.hand);
        phiB = Math.atan2(this.body.dot(this.camU), this.body.dot(this.camR));
      }
      for (let t = Math.max(1, F - 17); t <= F; t++) {
        if (t >= 60 && t % 2 === 0) continue;
        const u = (F - t) / 18;
        const r0 = (0.8 + 0.3 * hash(t * 5 + 1)) * k;
        const ang = phiB + ((70 + 220 * hash(t * 5 + 2)) * Math.PI) / 180;
        const rr = r0 * (1 - u * u);
        this.dirv.copy(this.camR).multiplyScalar(Math.cos(ang)).addScaledVector(this.camU, Math.sin(ang));
        this.tmp.copy(this.hand).addScaledVector(this.dirv, rr);
        d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[0]!, k, level);
        if (u > 0.3) {
          this.tmp.copy(this.hand).addScaledVector(this.dirv, rr + 0.09 * k);
          d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[1]!, k, level);
          this.tmp.copy(this.hand).addScaledVector(this.dirv, rr + 0.19 * k);
          d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[2]!, k, level);
        }
      }
    }
    if (v.sweep > 0) {
      for (let j = 0; j < 3; j++) {
        const s = v.sweep - 0.06 * j;
        if (s < 0) continue;
        this.tmp.copy(this.hand).lerp(this.tipP, s);
        d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[j === 0 ? 0 : 1]!, j === 0 ? 2 : 1, level);
      }
    }
    if (v.orbit > 0) {
      for (let j = 0; j < v.orbit; j++) {
        const a = ((v.orbitAngle + j * 180) * Math.PI) / 180;
        this.tmp.copy(this.hand).addScaledVector(this.camR, Math.cos(a) * 0.32 * k).addScaledVector(this.camU, Math.sin(a) * 0.32 * k);
        d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[1]!, 2, level);
      }
    }
    d.done();
  }

  dispose(): void {
    this.quads.removeFromParent();
    this.dots.points.removeFromParent();
    this.dots.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
