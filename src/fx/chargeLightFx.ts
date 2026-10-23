import * as THREE from 'three';
import { GATHER_LIFE, type ChargeLightView, type ChargePalette } from '../legend/chargeLight';
import type { HandInfo } from '../legend/handPos';
import { DotPoints } from './dotPoints';

/**
 * WEAPON-9 PR-1（§5.8）: ため中の 光の 絵（体の 中心へ あつまる つぶ ＋ いっぱいで 右手の 光）。元は WEAPON-8 §3.5 の 絵。素材 `public/models/fx/charge_light.{png,json}`（雷神剣・風神剣 共通。色の 表だけ ちがう）。
 * - 右手の 光は ドット絵の 十字（たて板 ＋ よこ板を 重ねる。オーナー 2026-10-23）。たて板は カメラの 横向きに 合わせて まわる（うすく ならない）、よこ板は ねかせる。
 *   芯と 輪の 2 しゅるい × 2 まい = 板 4 まいを 1 つの メッシュで 1 回 ＋ 点（すいこまれる つぶ）1 回 = 描画 2・三角形 8。
 * - 光は 体の 中心へ あつまる（いっぱいに なっても つづく）。右手は いっぱいの とき ピカピカ またたく（絵が 切りかわる ドットアニメ）。体は かくさない（深さの 判定は しない）。はなしたら すぐ 消える。
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

export const CHARGE_PALETTES: Record<ChargePalette, readonly string[]> = {
  fujin: ['#F4FCFF', '#CDEFFC', '#8FD6F2', '#4FA8D8', '#2B6699'],
  raijin: ['#FFF8DC', '#FFE98A', '#F0C24A', '#9A7430', '#4E3C1A'],
  // WEAPON-9: 虹（にじ色）。白 → 緑 → 青 → 赤むらさき → こい むらさき
  niji: ['#FBF6FF', '#9FF0C4', '#8EC4FF', '#E39CF0', '#5A4496'],
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
    niji: CHARGE_PALETTES.niji.map((c) => new THREE.Color(c)),
  };
  private readonly camR = new THREE.Vector3();
  private readonly flatF = new THREE.Vector3();
  private readonly UP = new THREE.Vector3(0, 1, 0);
  private readonly hand = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly dirv = new THREE.Vector3();

  constructor(private readonly deps: ChargeLightFxDeps) {
    this.tex = new THREE.TextureLoader().load(`${deps.basePath ?? BASE}charge_light.png`);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.flipY = false;
    this.pos = new Float32Array(16 * 3);
    this.rect = new Float32Array(16 * 4);
    const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute('aRect', new THREE.BufferAttribute(this.rect, 4));
    this.geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15]);
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

  /** 板 i を center に 置く。right・up は 板の 2 つの 軸（長さ 1） */
  private quad(i: number, r: readonly number[], center: THREE.Vector3, scale: number, right: THREE.Vector3, up: THREE.Vector3): void {
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
      this.tmp.copy(center).addScaledVector(right, c[0]).addScaledVector(up, c[1]);
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

  /** 1 ステップに 1 回。body = 体の 中心（むね）。つぶは まわりから ここへ あつまる（手には あつまらない） */
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
    this.hand.set(h.world.x, h.world.y, h.world.z);
    const pal = this.pal[v.palette];
    this.mat.uniforms.uPal!.value = pal;
    this.mat.uniforms.uLevel!.value = 0;

    // 右手の 光: 十字（たて板 ＋ よこ板）。芯は 毎ステップ ビュー（handCore）の 絵、輪は あるときだけ（handRing）。
    // たて板 = 0（芯）・2（輪）、よこ板 = 1（芯）・3（輪）
    for (let i = 0; i < 4; i++) this.hideQuad(i);
    if (v.hand > 0) {
      this.camR.set(1, 0, 0).applyQuaternion(cam.quaternion);
      this.camR.y = 0;
      if (this.camR.lengthSq() < 1e-6) this.camR.set(1, 0, 0);
      this.camR.normalize();
      this.flatF.crossVectors(this.UP, this.camR); // 水平の まえ（板を ねかせる 軸）
      const core = CORES[v.handCore]!;
      this.quad(0, core, this.hand, k, this.camR, this.UP);
      this.quad(1, core, this.hand, k, this.camR, this.flatF);
      if (v.handRing >= 0) {
        const ring = RINGS[v.handRing]!;
        this.quad(2, ring, this.hand, k, this.camR, this.UP);
        this.quad(3, ring, this.hand, k, this.camR, this.flatF);
      }
      this.quads.visible = true;
    } else {
      this.quads.visible = false;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aRect') as THREE.BufferAttribute).needsUpdate = true;

    // 点: 体の 中心へ あつまる つぶ。数も はやさも ため中 ずっと 同じ（つぶ i は GATHER_LIFE ステップで 外から 中心へ まっすぐ）
    const d = this.dots;
    d.reset();
    if (v.particles > 0 && body) {
      const F = v.F;
      for (let i = 0; i < v.particles; i++) {
        const off = Math.floor((i * GATHER_LIFE) / v.particles);
        const age = (F + off) % GATHER_LIFE; // 0（外）〜 LIFE-1（中心に ちかい）
        const cycle = Math.floor((F + off) / GATHER_LIFE);
        const key = cycle * 31 + i * 7;
        // 球の 上の 向き（まわり ぜんぶから）
        const z = 2 * hash(key + 1) - 1;
        const ph = 2 * Math.PI * hash(key + 2);
        const rxy = Math.sqrt(1 - z * z);
        const R = (1.0 + 0.35 * hash(key + 3)) * k;
        const rr = R * (1 - age / GATHER_LIFE);
        this.dirv.set(rxy * Math.cos(ph), z * 0.8, rxy * Math.sin(ph));
        this.tmp.set(body.x, body.y, body.z).addScaledVector(this.dirv, rr);
        const near = age / GATHER_LIFE;
        d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[near > 0.6 ? 0 : near > 0.3 ? 1 : 2]!, k, 0);
        // しっぽ（外がわに 1 つ）
        this.tmp.set(body.x, body.y, body.z).addScaledVector(this.dirv, rr + 0.12 * k);
        d.add(this.tmp.x, this.tmp.y, this.tmp.z, pal[near > 0.3 ? 2 : 3]!, k, 0);
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
