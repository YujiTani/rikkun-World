import * as THREE from 'three';
import type { SpiralEvent, WaveEvent, WaveView } from '../legend/WaveSystem';

/**
 * WEAPON-8 §3.8: 風神剣の ふつうの 真空波の 見た目 K1「みかづきの 刃」（絵: `public/models/fx/fujin_blade.png`、数: `fujin_blade.json`）。
 * - カメラに 正面の 板 1 まい（22×22 点 = 1.375 ブロック）。絵の 向きは 画面で 進む 向きを 8 向きに まるめた `face`（板は 回さない）。
 * - 8 つ 同時でも 描画 1（InstancedMesh。いちばん 手前の 1 つに 本体を 置き、ほかは そこからの ずれ）・三角形 16。
 * - 位置は `drawPos`（剣の 手の 側へ 0.4 ずらした 見た目）。当たりの `position` は 使わない。
 * - 出る 2 ステップは 0.6 倍・さいご 4 ステップは 網で 消える（点滅しない）。ブロックで 消えたら 小さな 風の けむり（6 ステップ）。
 * 毎フレーム new しない（使い回し）。
 */
const BASE = './models/fx/';
export const WAVE_SIZE = 1.375;
export const PUFF_STEPS = 6;
const MAX_WAVES = 8;
const MAX_PUFFS = 4;
const SHEET = { w: 128, h: 64 };

/** 絵の 場所 [x, y, w, h]（`fujin_blade.json` の sprites）。キーは `${向きの 絵}_${コマ}` */
export const BLADE_SPRITES: Record<string, readonly [number, number, number, number]> = {
  '0_0': [0, 0, 22, 22],
  '0_1': [0, 22, 22, 22],
  '45_0': [22, 0, 22, 22],
  '45_1': [22, 22, 22, 22],
  '90_0': [44, 0, 22, 22],
  '90_1': [44, 22, 22, 22],
};
/** face 0〜7（右から 反時計回りに 45 度）→ 使う 絵と 反転（`fujin_blade.json` の directions.table） */
export const BLADE_FACES: readonly { sprite: '0' | '45' | '90'; flipX: boolean; flipY: boolean }[] = [
  { sprite: '0', flipX: false, flipY: false },
  { sprite: '45', flipX: false, flipY: false },
  { sprite: '90', flipX: false, flipY: false },
  { sprite: '45', flipX: true, flipY: false },
  { sprite: '0', flipX: true, flipY: false },
  { sprite: '45', flipX: true, flipY: true },
  { sprite: '90', flipX: false, flipY: true },
  { sprite: '45', flipX: false, flipY: true },
];
export const BLADE_FRAME_STEPS = 3;
export const BLADE_APPEAR_STEPS = 2;
export const BLADE_FADE_FROM = 16;

const VERT = `
attribute vec4 aRect;
attribute vec3 aFlipCut;
varying vec2 vUv;
varying vec4 vRect;
varying vec3 vFlipCut;
void main() {
  vUv = uv;
  vRect = aRect;
  vFlipCut = aFlipCut;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FRAG = `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vRect;
varying vec3 vFlipCut;
void main() {
  vec2 uv = vUv;
  if (vFlipCut.x > 0.5) uv.x = 1.0 - uv.x;
  if (vFlipCut.y > 0.5) uv.y = 1.0 - uv.y;
  vec2 p = floor(vec2(vRect.x + uv.x * vRect.z, vRect.y + (1.0 - uv.y) * vRect.w));
  vec4 c = texture2D(uTex, (p + 0.5) / vec2(${SHEET.w}.0, ${SHEET.h}.0));
  if (c.a < 0.5) discard;
  if (mod(p.x + p.y, 4.0) < vFlipCut.z) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

export interface WindWaveFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
}

export class WindWaveFx {
  private readonly blades: THREE.InstancedMesh;
  private readonly rect: THREE.InstancedBufferAttribute;
  private readonly flipCut: THREE.InstancedBufferAttribute;
  private readonly puffMat: THREE.MeshBasicMaterial;
  private readonly puffMeshes: THREE.Mesh[] = [];
  private readonly puffAge: number[] = [];
  private readonly puffSize: number[] = [];
  private readonly group = new THREE.Group();
  private readonly m = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();

  constructor(private readonly deps: WindWaveFxDeps) {
    const tex = new THREE.TextureLoader().load(`${deps.basePath ?? BASE}fujin_blade.png`);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.rect = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WAVES * 4), 4);
    this.flipCut = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WAVES * 3), 3);
    geo.setAttribute('aRect', this.rect);
    geo.setAttribute('aFlipCut', this.flipCut);
    const mat = new THREE.ShaderMaterial({ uniforms: { uTex: { value: tex } }, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.blades = new THREE.InstancedMesh(geo, mat, MAX_WAVES);
    this.blades.frustumCulled = false;
    this.blades.visible = false;
    this.blades.count = 0;
    this.blades.renderOrder = 40;
    this.group.add(this.blades);

    this.puffMat = new THREE.MeshBasicMaterial({ color: 0xe6f8ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const pg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_PUFFS; i++) {
      const mesh = new THREE.Mesh(pg, this.puffMat.clone());
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.puffMeshes.push(mesh);
      this.puffAge.push(-1);
      this.puffSize.push(1);
      this.group.add(mesh);
    }
    deps.scene.add(this.group);
  }

  onEvent(e: { type: string }): void {
    if (e.type !== 'waveEnd' && e.type !== 'spiralEnd') return;
    const we = e as (WaveEvent & { type: 'waveEnd' }) | (SpiralEvent & { type: 'spiralEnd' });
    if (we.reason !== 'block') return;
    const i = this.puffAge.findIndex((a) => a < 0);
    const k = i >= 0 ? i : 0;
    this.puffAge[k] = 0;
    this.puffSize[k] = e.type === 'spiralEnd' ? 2.2 : 1;
    this.puffMeshes[k]!.position.set(we.position.x, we.position.y, we.position.z);
  }

  /** 1 ステップに 1 回。らせん（kind 'spiral'）は ここでは 描かない */
  step(waves: readonly WaveView[], _reduced = false): void {
    void _reduced;
    const cam = this.deps.camera;
    let n = 0;
    let anchor: THREE.Vector3 | null = null;
    for (let i = 0; i < waves.length && n < MAX_WAVES; i++) {
      const w = waves[i]!;
      if (w.kind === 'spiral') continue;
      const age = Math.round(w.traveled / 0.25);
      const f = BLADE_FACES[((w.face ?? 0) % 8 + 8) % 8]!;
      const frame = Math.floor(age / BLADE_FRAME_STEPS) % 2;
      const r = BLADE_SPRITES[`${f.sprite}_${frame}`]!;
      this.rect.setXYZW(n, r[0], r[1], r[2], r[3]);
      this.flipCut.setXYZ(n, f.flipX ? 1 : 0, f.flipY ? 1 : 0, age >= BLADE_FADE_FROM ? Math.min(3, age - BLADE_FADE_FROM) : 0);
      const dp = w.drawPos;
      if (!anchor) {
        anchor = this.pos.set(dp.x, dp.y, dp.z).clone();
        this.blades.position.copy(anchor);
        this.blades.quaternion.copy(cam.quaternion);
      }
      this.m.compose(this.pos.set(dp.x - anchor.x, dp.y - anchor.y, dp.z - anchor.z), this.quat.identity(), this.scl.setScalar(WAVE_SIZE * (age < BLADE_APPEAR_STEPS ? 0.6 : 1)));
      this.blades.setMatrixAt(n, this.m);
      n += 1;
    }
    this.blades.count = n;
    this.blades.visible = n > 0;
    if (n > 0) {
      this.blades.instanceMatrix.needsUpdate = true;
      this.rect.needsUpdate = true;
      this.flipCut.needsUpdate = true;
    }
    for (let i = 0; i < this.puffMeshes.length; i++) {
      const a = this.puffAge[i]!;
      const mesh = this.puffMeshes[i]!;
      if (a < 0) {
        mesh.visible = false;
        continue;
      }
      if (a >= PUFF_STEPS) {
        this.puffAge[i] = -1;
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.quaternion.copy(cam.quaternion);
      const s = (0.25 + a * 0.12) * this.puffSize[i]!;
      mesh.scale.set(s, s, s);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - a / PUFF_STEPS);
      this.puffAge[i] = a + 1;
    }
  }
}
