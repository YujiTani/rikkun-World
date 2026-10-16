// #144 影の試作（本番ではない。?shadow=1 のときだけ main.ts がつくる）。
// しくみ（くわしくは docs/design/SHADOW.md）:
// - 太陽・月: 光の向きから見た「深さの地図」（shadow map）。止まっている世界の地図 2 枚（近く 2048²・遠く 1024²）は
//   変わったときだけ描き直す（太陽が 0.25° 動いた・プレイヤーが 4 ブロック動いた・メッシュが変わった）。
//   動く物（キャラの板・妖怪）は 小さい地図 1 枚に 毎コマ描く。
// - 受ける側（ブロックの材料・キャラの板）は 地図を引いて、空の光の明るさに「影のこさ」をかける。
//   引く場所を 小ブロックの目（1/9）の面の真ん中にそろえるので、影のへりが ドットの段になる。
// - たいまつ: 近い 2 本だけ、立方体の深さの地図（6 面）。止まっている世界は変わったときだけ、近くで物が動いたら描き直す。
// - 丸い影: キャラ・妖怪の足もとに、地図とは別に うすい丸（上を向いた面だけ）。
import * as THREE from 'three';
import type { TimeSettings } from '../../time/config';
import { skyDirection, sunMoonPose } from '../../sky/sunMoon';
import { SKY_VIEW } from '../../sky/config';
import type { WorldRenderer } from '../../world/render/WorldRenderer';
import type { ArrayVoxelWorld } from '../../world/VoxelWorld';
import { isTorchIndex } from '../../world/blocks/blockTypes';
import { bearingDeg, dirIndex } from '../../char/view';
import {
  MAX_BLOBS,
  MAX_TORCH_SHADOWS,
  SHADOW_DERIV_NORMAL,
  SHADOW_FRAG_PARS,
  SHADOW_VARYINGS,
  createShadowUniforms,
  type ShadowUniforms,
} from './shadowGlsl';

export interface ShadowParams {
  /** 影の中の明るさ（こさ）。0.55 なら 空の光を 55% にする */
  darkness: number;
  /** 月の影の強さ（太陽を 1 として） */
  moon: number;
  /** 小ブロックの目にそろえる（9 = 1/9、0 = しない） */
  snap: number;
  /** やわらかさ: 0 = かたい（1 点）、1 = となりとまぜる（PCF 2×2） */
  soft: number;
  /** 地図の数（1 = 近くだけ、2 = 近く＋遠く） */
  cascades: number;
  /** 近くの地図の 1 辺の画素 */
  size0: number;
  /** 近くの地図の はんぶんの はば（ブロック） */
  half0: number;
  size1: number;
  half1: number;
  sizeD: number;
  halfD: number;
  /** 太陽がこれだけ動いたら止まっている地図を描き直す（度） */
  angleStep: number;
  /** 丸い影のこさ（0 = 出さない） */
  blob: number;
  /** たいまつの影の数（0〜2） */
  torches: number;
  /** たいまつの影の中の明るさ（0..1） */
  torchDarkness: number;
  /** 止まっている地図の 深さの ずらし（ブロック。0.02 = 凸凹の小さい影も 出す） */
  bias: number;
  /** たいまつの地図の 1 面の画素 */
  torchSize: number;
  /** たいまつの地図に 世界（ブロック）も描く（false: キャラ・妖怪だけ。世界のさえぎりは 今の 1 ブロックの光にまかせる） */
  torchWorld: boolean;
  /** キャラの板も影を落とす */
  spriteCasts: boolean;
  /** 妖怪も影を落とす */
  yokaiCasts: boolean;
  /** メッシュが変わってから描き直すまでの最小のコマ数 */
  throttle: number;
}

export const DEFAULT_SHADOW_PARAMS: ShadowParams = {
  darkness: 0.55,
  moon: 0.5,
  snap: 9,
  soft: 1,
  cascades: 2,
  size0: 2048,
  half0: 32,
  size1: 1024,
  half1: 96,
  sizeD: 1024,
  halfD: 20,
  angleStep: 0.25,
  blob: 0.35,
  torches: 2,
  torchDarkness: 0.3,
  bias: 0.22,
  torchSize: 256,
  torchWorld: false,
  spriteCasts: true,
  yokaiCasts: true,
  throttle: 4,
};

/** URL（?shadow=1&shDark=0.6&shSnap=0 …）から設定を読む */
export function parseShadowParams(search: string): ShadowParams | null {
  const q = new URLSearchParams(search);
  if (q.get('shadow') !== '1') return null;
  const p = { ...DEFAULT_SHADOW_PARAMS };
  const num = (k: string, set: (v: number) => void) => {
    const v = q.get(k);
    if (v !== null && v !== '' && Number.isFinite(Number(v))) set(Number(v));
  };
  num('shDark', (v) => (p.darkness = v));
  num('shMoon', (v) => (p.moon = v));
  num('shSnap', (v) => (p.snap = v));
  num('shSoft', (v) => (p.soft = v));
  num('shCascades', (v) => (p.cascades = v));
  num('shSize', (v) => (p.size0 = v));
  num('shHalf', (v) => (p.half0 = v));
  num('shBlob', (v) => (p.blob = v));
  num('shTorches', (v) => (p.torches = v));
  num('shTorchDark', (v) => (p.torchDarkness = v));
  num('shBias', (v) => (p.bias = v));
  num('shAngle', (v) => (p.angleStep = v));
  if (q.get('shSprite') === '0') p.spriteCasts = false;
  if (q.get('shTorchWorld') === '1') p.torchWorld = true;
  if (q.get('shYokai') === '0') p.yokaiCasts = false;
  return p;
}

export interface PassStats {
  calls: number;
  triangles: number;
  /** JS の時間（ms。GPU の時間はふくまない） */
  cpuMs: number;
}

export interface ShadowStats {
  /** 止まっている地図を描き直した回数（はじまってから） */
  staticUpdates: number[];
  torchUpdates: number;
  /** 最後に描いたときの数 */
  last: { static: PassStats[]; dynamic: PassStats; torch: PassStats };
  /** このコマで描いた数（地図ぜんぶ） */
  frame: PassStats;
  sun: { x: number; y: number; z: number; strength: number; source: 'sun' | 'moon' };
  torchesActive: number;
  gpuBytes: number;
}

interface Cascade {
  rt: THREE.WebGLRenderTarget;
  depth: THREE.DepthTexture;
  cam: THREE.OrthographicCamera;
  size: number;
  half: number;
  matrix: THREE.Matrix4;
  /** 最後に描いたときの中心・光の向き・メッシュの版 */
  center: THREE.Vector3 | null;
  dir: THREE.Vector3;
  version: number;
  framesSince: number;
  recenter: number;
  angleStep: number;
}

interface TorchMap {
  rt: THREE.WebGLCubeRenderTarget;
  depth: THREE.CubeDepthTexture;
  pos: THREE.Vector3 | null;
  version: number;
  dynamicNear: boolean;
}

const DEPTH_REACH = 160; // 光の向きの後ろへ 160 ブロック（高い山・木も入る）
const TORCH_RANGE = 10;
const CUBE_DIRS = [
  new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];
const CUBE_UPS = [
  new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0),
];
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export interface ShadowDeps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  world: ArrayVoxelWorld;
  worldRenderer: WorldRenderer;
  timeSettings: TimeSettings;
  dayTick: () => number;
  /** 動く物（妖怪）のグループ */
  yokaiGroup: THREE.Object3D;
  /** キャラの足もと（ワールド座標） */
  player: () => { x: number; y: number; z: number };
  /** キャラの向き（度。yaw と同じ数え方） */
  facing?: () => number;
  /** 丸い影を出す妖怪の足もと・半径（近い順に使う） */
  yokaiFeet?: () => { x: number; y: number; z: number; r: number }[];
}

function makeDepthTarget(size: number, soft: boolean): { rt: THREE.WebGLRenderTarget; depth: THREE.DepthTexture } {
  const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  depth.format = THREE.DepthFormat;
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = depth.magFilter = soft ? THREE.LinearFilter : THREE.NearestFilter;
  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RedFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    depthTexture: depth,
  });
  return { rt, depth };
}

export class ShadowProto {
  readonly uniforms: ShadowUniforms = createShadowUniforms();
  readonly params: ShadowParams;
  private readonly cascades: Cascade[] = [];
  private readonly dyn: Cascade;
  private readonly torchMaps: TorchMap[] = [];
  private readonly torchCam = new THREE.PerspectiveCamera(90, 1, 0.05, TORCH_RANGE);
  private readonly depthBasic = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly depthCutout: THREE.MeshBasicMaterial;
  private readonly cardScene = new THREE.Scene();
  private card: THREE.Mesh | null = null;
  private spriteMesh: THREE.Mesh | null = null;
  /** 影を落とす板の 絵の場所（光の側から見た向きの絵） */
  private readonly cardRect = new THREE.Vector4(0, 0, 1, 1);
  private readonly L = new THREE.Vector3(0, 1, 0);
  private strength = 0;
  private source: 'sun' | 'moon' = 'sun';
  private readonly st: ShadowStats;
  private frameStats: PassStats = { calls: 0, triangles: 0, cpuMs: 0 };
  private torchScanFrame = -999;
  private torchScanVersion = -1;
  private frameNo = 0;
  private torchList: THREE.Vector3[] = [];
  /** テスト・計測用: true なら毎コマ 止まっている地図も描き直す */
  forceStatic = false;
  enabled = true;

  constructor(
    private readonly d: ShadowDeps,
    params: ShadowParams,
  ) {
    this.params = params;
    const opaque = d.worldRenderer.materials()[1];
    this.depthCutout = new THREE.MeshBasicMaterial({ map: opaque.map, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false });
    const soft = params.soft > 0;
    const mk = (size: number, half: number, recenter: number, angleStep: number): Cascade => {
      const { rt, depth } = makeDepthTarget(size, soft);
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0, DEPTH_REACH * 2);
      return { rt, depth, cam, size, half, matrix: new THREE.Matrix4(), center: null, dir: new THREE.Vector3(), version: -1, framesSince: 999, recenter, angleStep };
    };
    this.cascades.push(mk(params.size0, params.half0, 4, params.angleStep));
    if (params.cascades > 1) this.cascades.push(mk(params.size1, params.half1, 16, params.angleStep * 2));
    this.dyn = mk(params.sizeD, params.halfD, 0, 0);
    const u = this.uniforms;
    u.uShMap0.value = this.cascades[0].depth;
    u.uShMap1.value = (this.cascades[1] ?? this.cascades[0]).depth;
    u.uShMapD.value = this.dyn.depth;
    u.uShTexel.value.set(
      (2 * params.half0) / params.size0,
      this.cascades[1] ? (2 * params.half1) / params.size1 : 1,
      (2 * params.halfD) / params.sizeD,
      this.cascades.length,
    );
    u.uShRange.value.set(DEPTH_REACH * 2, DEPTH_REACH * 2, DEPTH_REACH * 2);
    u.uShP.value.set(0, params.darkness, params.snap, params.torchDarkness);
    u.uShBlobK.value = params.blob;
    u.uShBias.value = params.bias;
    for (let i = 0; i < MAX_TORCH_SHADOWS; i++) {
      // 使わないときも 本物の深さの立方体を つないでおく（からの立方体だと 比べる sampler に合わない）
      const n = i < params.torches ? params.torchSize : 4;
      const rt = new THREE.WebGLCubeRenderTarget(n, { format: THREE.RedFormat, type: THREE.UnsignedByteType, generateMipmaps: false });
      const depth = new THREE.CubeDepthTexture(n, THREE.UnsignedIntType);
      depth.format = THREE.DepthFormat;
      depth.compareFunction = THREE.LessEqualCompare;
      depth.minFilter = depth.magFilter = soft ? THREE.LinearFilter : THREE.NearestFilter;
      rt.depthTexture = depth as unknown as THREE.DepthTexture; // three の型は 2D だけだが、WebGLShadowMap と同じく立方体の深さも使える
      this.torchMaps.push({ rt, depth, pos: null, version: -1, dynamicNear: false });
    }
    u.uShTorchMap0.value = this.torchMaps[0].depth;
    u.uShTorchMap1.value = this.torchMaps[1].depth;
    this.st = {
      staticUpdates: this.cascades.map(() => 0),
      torchUpdates: 0,
      last: { static: this.cascades.map(() => ({ calls: 0, triangles: 0, cpuMs: 0 })), dynamic: { calls: 0, triangles: 0, cpuMs: 0 }, torch: { calls: 0, triangles: 0, cpuMs: 0 } },
      frame: { calls: 0, triangles: 0, cpuMs: 0 },
      sun: { x: 0, y: 1, z: 0, strength: 0, source: 'sun' },
      torchesActive: 0,
      gpuBytes: 0,
    };
  }

  // ------------------------------------------------------------------ 受ける側の材料をなおす

  /** ブロックの材料（WorldRenderer.materials() の順: 小ブロック, 絵, 水, LOD, LOD 水）に 影を入れる */
  patchWorldMaterials(): void {
    const [voxel, ...atlasMats] = this.d.worldRenderer.materials();
    this.patchVoxel(voxel);
    for (const m of atlasMats) this.patchAtlas(m);
  }

  private wrap(m: THREE.Material, edit: (s: THREE.WebGLProgramParametersWithUniforms) => void, suffix: string): void {
    const prev = m.onBeforeCompile.bind(m);
    const prevKey = m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      Object.assign(shader.uniforms, this.uniforms);
      edit(shader);
    };
    m.customProgramCacheKey = () => `${prevKey()}-${suffix}`;
    m.needsUpdate = true;
  }

  private patchVoxel(m: THREE.Material): void {
    this.wrap(
      m,
      (s) => {
        s.vertexShader = s.vertexShader
          .replace('#include <common>', `#include <common>\n${SHADOW_VARYINGS}`)
          .replace(
            'vLit = vec3(max(sb, bb)) * tint;',
            'vLit = vec3(1.0); vShSB = sb; vShBB = bb; vShFloor = 0.0; vShSky = skyIn; vShW = (modelMatrix * vec4(position, 1.0)).xyz; vShN = NRM[f];',
          );
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', `#include <common>\n${SHADOW_VARYINGS}\n${SHADOW_FRAG_PARS}`)
          .replace('diffuseColor.rgb *= c * vShade * vLit;', 'diffuseColor.rgb *= c * vShade * shLit(vShSB, vShBB, vShFloor, vShSky, vShW, normalize(vShN));');
        if (!s.vertexShader.includes('vShN = NRM[f]') || !s.fragmentShader.includes('shLit(')) throw new Error('[shadow] voxel shader patch failed');
      },
      'sh',
    );
  }

  private patchAtlas(m: THREE.Material): void {
    this.wrap(
      m,
      (s) => {
        s.vertexShader = s.vertexShader
          .replace('#include <common>', `#include <common>\n${SHADOW_VARYINGS}`)
          .replace(
            'vColor.rgb *= max(max(sb, bb), ripe * uRipeMin) * tint;',
            'vShSB = sb; vShBB = bb; vShFloor = ripe * uRipeMin; vShSky = aLight.x; vShW = (modelMatrix * vec4(position, 1.0)).xyz; vShN = vec3(0.0, 1.0, 0.0);',
          );
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', `#include <common>\n${SHADOW_VARYINGS}\n${SHADOW_FRAG_PARS}\n${SHADOW_DERIV_NORMAL}`)
          .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= shLit(vShSB, vShBB, vShFloor, vShSky, vShW, shDerivNormal(vShW));');
        if (!s.vertexShader.includes('vShFloor = ripe') || !s.fragmentShader.includes('shLit(')) throw new Error('[shadow] atlas shader patch failed');
      },
      'sh',
    );
  }

  /** キャラの板（ShaderMaterial）: 止まっている世界の影を受ける（自分の影は受けない）。影を落とす板も作る */
  attachSprite(mesh: THREE.Mesh): void {
    this.spriteMesh = mesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    Object.assign(mat.uniforms, this.uniforms);
    mat.vertexShader = mat.vertexShader
      .replace('varying vec2 vUv;', 'varying vec2 vUv;\nvarying vec3 vShW;')
      .replace('vUv = uv;', 'vUv = uv;\n  vShW = (modelMatrix * vec4(position, 1.0)).xyz;');
    mat.fragmentShader = mat.fragmentShader
      .replace('varying vec2 vUv;', `varying vec2 vUv;\nvarying vec3 vShW;\n${SHADOW_FRAG_PARS}`)
      .replace(
        'gl_FragColor = vec4(uPalette[int(idx)] * uTint, 1.0);',
        'float shv = shSunVis(vShW, uShL, false);\n  gl_FragColor = vec4(uPalette[int(idx)] * uTint * pow(mix(1.0, uShP.y, (1.0 - shv) * uShP.x * uShSpriteDirect), 2.2), 1.0);',
      );
    if (!mat.fragmentShader.includes('shSunVis(vShW')) throw new Error('[shadow] sprite shader patch failed');
    mat.needsUpdate = true;
    // 影を落とす板: 同じ絵（uMap は同じ入れ物）を、光の向きに立てる。絵は「光の側から見た向き」の横向きの絵（uRect は自分で決める）
    const cardMat = new THREE.ShaderMaterial({
      uniforms: { uMap: mat.uniforms.uMap!, uRect: { value: this.cardRect } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform sampler2D uMap; uniform vec4 uRect; varying vec2 vUv; void main(){ float idx = floor(texture2D(uMap, vec2(uRect.x + vUv.x * uRect.z, uRect.y + (1.0 - vUv.y) * uRect.w)).r * 255.0 + 0.5); if (idx < 0.5) discard; gl_FragColor = vec4(0.0); }',
      side: THREE.DoubleSide,
    });
    this.card = new THREE.Mesh(mesh.geometry, cardMat);
    this.card.matrixAutoUpdate = false;
    this.card.frustumCulled = false;
    this.cardScene.add(this.card);
  }

  // ------------------------------------------------------------------ 毎コマ（描く前）

  /** 全部の地図を 1 回 からにしておく（まだ描いていない地図は GPU に無く、比べる sampler とかみ合わない） */
  private initTargets(): void {
    const r = this.d.renderer;
    for (const c of [...this.cascades, this.dyn]) {
      r.setRenderTarget(c.rt);
      r.clear(false, true, false);
    }
    for (const t of this.torchMaps) {
      for (let f = 0; f < 6; f++) {
        r.setRenderTarget(t.rt as unknown as THREE.WebGLRenderTarget, f);
        r.clear(false, true, false);
      }
    }
  }

  private inited = false;

  preRender(): void {
    this.frameNo++;
    if (!this.inited) {
      const prev = this.d.renderer.getRenderTarget();
      this.initTargets();
      this.d.renderer.setRenderTarget(prev);
      this.inited = true;
    }
    const t0 = performance.now();
    this.frameStats = { calls: 0, triangles: 0, cpuMs: 0 };
    this.updateLight();
    const u = this.uniforms;
    u.uShP.value.x = this.enabled ? this.strength : 0;
    // 昼（太陽が出ている）は ブロックの光を 影のこさ まで弱める（月の夜は そのまま）
    u.uShBlockDay.value = this.enabled && this.source === 'sun' ? THREE.MathUtils.lerp(1, this.params.darkness, this.strength) : 1;
    u.uShL.value.copy(this.L);
    const r = this.d.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    const p = this.d.player();
    if (this.enabled && this.strength > 0.001) {
      for (let i = 0; i < this.cascades.length; i++) this.maybeStatic(i, p);
      this.renderDynamic(p);
    }
    if (this.enabled) this.updateTorches(p);
    this.updateBlobs(p);
    // キャラの板は 空の光の だんかいを 持たないので、頭の高さの 空の光で「じかの 日の光」の 割合を 出す（洞くつで 太陽の影に しない）
    const sky = this.d.worldRenderer.light.skyLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    u.uShSpriteDirect.value = THREE.MathUtils.smoothstep(sky, 12.5, 14.5);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;
    this.frameStats.cpuMs = performance.now() - t0;
    this.st.frame = this.frameStats;
  }

  /** 時刻から 光の向き（地面 → 太陽・月）と 影の強さ */
  private updateLight(): void {
    const pose = sunMoonPose(this.d.dayTick(), this.d.timeSettings);
    const body = pose.sun.visible ? pose.sun : pose.moon;
    this.source = pose.sun.visible ? 'sun' : 'moon';
    const dir = skyDirection(body.angle, SKY_VIEW.tilt, { x: 0, y: 0, z: 0 });
    this.L.set(dir.x, dir.y, dir.z).normalize();
    // 地平線の近くは 影をうすくする（ほとんど全部が影になるのを防ぐ）
    const rise = THREE.MathUtils.smoothstep(this.L.y, 0.03, 0.25);
    this.strength = rise * (this.source === 'moon' ? this.params.moon : 1);
    // 光が低すぎるときは 地図をつくる向きを 少し上げる（真横からの地図は こわれやすい）
    if (this.L.y < 0.05) {
      this.L.y = 0.05;
      this.L.normalize();
    }
    Object.assign(this.st.sun, { x: this.L.x, y: this.L.y, z: this.L.z, strength: this.strength, source: this.source });
  }

  /** 光の向きの軸（right, up, L）で、中心を テクセルの目にそろえて カメラを置く */
  private placeCam(c: Cascade, center: { x: number; y: number; z: number }): void {
    const L = this.L;
    const right = new THREE.Vector3(L.y, -L.x, 0).normalize();
    const up = new THREE.Vector3().crossVectors(L, right).normalize();
    const texel = (2 * c.half) / c.size;
    const v = new THREE.Vector3(center.x, center.y, center.z);
    const cu = Math.round(v.dot(right) / texel) * texel;
    const cv = Math.round(v.dot(up) / texel) * texel;
    const cw = v.dot(L);
    const snapped = new THREE.Vector3().addScaledVector(right, cu).addScaledVector(up, cv).addScaledVector(L, cw);
    const cam = c.cam;
    cam.position.copy(snapped).addScaledVector(L, DEPTH_REACH);
    cam.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, L));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    c.matrix.multiplyMatrices(BIAS, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  }

  private maybeStatic(i: number, p: { x: number; y: number; z: number }): void {
    const c = this.cascades[i];
    c.framesSince++;
    const ver = this.d.worldRenderer.meshVersion;
    const moved = !c.center || Math.hypot(p.x - c.center.x, p.z - c.center.z) >= c.recenter || Math.abs(p.y - c.center.y) >= c.recenter * 2;
    const turned = c.dir.angleTo(this.L) * THREE.MathUtils.RAD2DEG >= c.angleStep;
    const changed = ver !== c.version && c.framesSince >= this.params.throttle;
    if (!(moved || turned || changed || this.forceStatic)) return;
    const t0 = performance.now();
    if (moved || !c.center) c.center = new THREE.Vector3(p.x, p.y, p.z);
    c.dir.copy(this.L);
    c.version = ver;
    c.framesSince = 0;
    this.placeCam(c, c.center);
    const stats = this.renderWorldDepth(c.rt, c.cam);
    stats.cpuMs = performance.now() - t0;
    this.st.last.static[i] = stats;
    this.st.staticUpdates[i]++;
    this.addFrame(stats);
    (i === 0 ? this.uniforms.uShMat0 : this.uniforms.uShMat1).value.copy(c.matrix);
  }

  /** 世界（ブロックのメッシュ）を 深さだけで描く。水は描かない */
  private renderWorldDepth(target: THREE.WebGLRenderTarget | THREE.WebGLCubeRenderTarget, cam: THREE.Camera, face?: number, clear = true): PassStats {
    const r = this.d.renderer;
    const wr = this.d.worldRenderer;
    const [voxel, opaque, water, lodOpaque, lodWater] = wr.materials();
    const swapped: [THREE.Mesh, THREE.Material | THREE.Material[], boolean][] = [];
    for (const o of wr.group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      const mat = m.material;
      swapped.push([m, mat, m.visible]);
      if (mat === water || mat === lodWater) m.visible = false;
      else if (mat === opaque) m.material = this.depthCutout;
      else if (mat === voxel || mat === lodOpaque) m.material = this.depthBasic;
    }
    r.setRenderTarget(target as THREE.WebGLRenderTarget, face);
    r.autoClear = false;
    if (clear) r.clear(false, true, false);
    r.render(wr.group, cam);
    const s = { calls: r.info.render.calls, triangles: r.info.render.triangles, cpuMs: 0 };
    for (const [m, mat, vis] of swapped) {
      m.material = mat;
      m.visible = vis;
    }
    return s;
  }

  /** 動く物（妖怪・キャラの板）を描く。target に depth をのこしたまま上に描く */
  private renderMovers(target: THREE.WebGLRenderTarget | THREE.WebGLCubeRenderTarget, cam: THREE.Camera, face: number | undefined, toward: THREE.Vector3 | null): PassStats {
    const r = this.d.renderer;
    let calls = 0;
    let triangles = 0;
    r.setRenderTarget(target as THREE.WebGLRenderTarget, face);
    r.autoClear = false;
    if (this.params.yokaiCasts) {
      const swapped: [THREE.Mesh, THREE.Material | THREE.Material[], boolean][] = [];
      this.d.yokaiGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const mat = m.material as THREE.Material;
        swapped.push([m, m.material, m.visible]);
        if (Array.isArray(m.material) || mat.transparent || mat.side === THREE.BackSide || (mat as THREE.MeshBasicMaterial).fog === false) m.visible = false;
        else m.material = this.depthBasic;
      });
      r.render(this.d.yokaiGroup, cam);
      calls += r.info.render.calls;
      triangles += r.info.render.triangles;
      for (const [m, mat, vis] of swapped) {
        m.material = mat;
        m.visible = vis;
      }
    }
    if (this.params.spriteCasts && this.card && this.spriteMesh) {
      const sm = this.spriteMesh;
      const uMap = (sm.material as THREE.ShaderMaterial).uniforms.uMap!.value;
      if (uMap) {
        sm.updateWorldMatrix(true, false);
        const pos = new THREE.Vector3();
        const scl = new THREE.Vector3();
        const q = new THREE.Quaternion();
        sm.matrixWorld.decompose(pos, q, scl);
        // 板を 光の来る向きへ 立てて向ける（たての軸だけ回す）
        const tx = toward ? toward.x - pos.x : this.L.x;
        const tz = toward ? toward.z - pos.z : this.L.z;
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(tx, tz));
        // 絵: いまの動きのコマのまま、段は 0（横から）、向きは「光の側から見た向き」
        const sr = (sm.material as THREE.ShaderMaterial).uniforms.uRect!.value as THREE.Vector4;
        const cols = Math.max(1, Math.round(1 / sr.z));
        const rows = Math.max(1, Math.round(1 / sr.w));
        const frame = Math.round(sr.x * cols);
        const dir = dirIndex(bearingDeg(tx, tz), this.d.facing?.() ?? 0);
        this.cardRect.set(frame / cols, Math.min(dir, rows - 1) / rows, 1 / cols, 1 / rows);
        this.card.matrix.compose(pos, q, scl);
        this.card.matrixWorld.copy(this.card.matrix);
        r.render(this.cardScene, cam);
        calls += r.info.render.calls;
        triangles += r.info.render.triangles;
      }
    }
    return { calls, triangles, cpuMs: 0 };
  }

  private renderDynamic(p: { x: number; y: number; z: number }): void {
    const t0 = performance.now();
    const c = this.dyn;
    this.placeCam(c, p);
    const r = this.d.renderer;
    r.setRenderTarget(c.rt);
    r.clear(false, true, false);
    const s = this.renderMovers(c.rt, c.cam, undefined, null);
    s.cpuMs = performance.now() - t0;
    this.st.last.dynamic = s;
    this.addFrame(s);
    this.uniforms.uShMatD.value.copy(c.matrix);
  }

  // ------------------------------------------------------------------ たいまつ

  private updateTorches(p: { x: number; y: number; z: number }): void {
    const n = this.params.torches;
    const u = this.uniforms;
    for (let i = 0; i < MAX_TORCH_SHADOWS; i++) u.uShTorch.value[i].w = 0;
    if (n <= 0) return;
    const ver = this.d.worldRenderer.meshVersion;
    if (this.frameNo - this.torchScanFrame >= 30 || ver !== this.torchScanVersion) {
      this.torchScanFrame = this.frameNo;
      this.torchScanVersion = ver;
      this.torchList = this.scanTorches(p, 16);
    }
    const t0 = performance.now();
    let calls = 0;
    let tris = 0;
    let did = false;
    let active = 0;
    for (let i = 0; i < Math.min(n, MAX_TORCH_SHADOWS); i++) {
      const tp = this.torchList[i];
      const tm = this.torchMaps[i];
      if (!tp) {
        tm.pos = null;
        continue;
      }
      active++;
      const same = tm.pos && tm.pos.equals(tp);
      // 近くで動く物（キャラ・妖怪）があれば 毎コマ、なければ 世界が変わったときだけ
      const near = this.moverNear(tp, p);
      const need = !same || (this.params.torchWorld && tm.version !== ver) || near || tm.dynamicNear;
      tm.dynamicNear = near;
      if (need) {
        tm.pos = tp.clone();
        tm.version = ver;
        const cam = this.torchCam;
        for (let f = 0; f < 6; f++) {
          cam.position.copy(tp);
          cam.up.copy(CUBE_UPS[f]);
          cam.lookAt(tp.clone().add(CUBE_DIRS[f]));
          cam.updateMatrixWorld(true);
          const r = this.d.renderer;
          let s1: PassStats = { calls: 0, triangles: 0, cpuMs: 0 };
          if (this.params.torchWorld) s1 = this.renderWorldDepth(tm.rt, cam, f, true);
          else {
            r.setRenderTarget(tm.rt as unknown as THREE.WebGLRenderTarget, f);
            r.clear(false, true, false);
          }
          const s2 = near ? this.renderMovers(tm.rt, cam, f, tp) : { calls: 0, triangles: 0, cpuMs: 0 };
          calls += s1.calls + s2.calls;
          tris += s1.triangles + s2.triangles;
        }
        did = true;
        this.st.torchUpdates++;
      }
      u.uShTorch.value[i].set(tp.x, tp.y, tp.z, TORCH_RANGE);
    }
    this.st.torchesActive = active;
    if (did) {
      const s = { calls, triangles: tris, cpuMs: performance.now() - t0 };
      this.st.last.torch = s;
      this.addFrame(s);
    }
  }

  /** たいまつの光の とどく所に 動く物（キャラ・妖怪）がいるか */
  private moverNear(tp: THREE.Vector3, p: { x: number; y: number; z: number }): boolean {
    const R = TORCH_RANGE + 1;
    if (Math.hypot(p.x - tp.x, p.y + 1 - tp.y, p.z - tp.z) < R) return true;
    for (const y of this.d.yokaiFeet?.() ?? []) if (Math.hypot(y.x - tp.x, y.y + 1 - tp.y, y.z - tp.z) < R) return true;
    return false;
  }

  /** プレイヤーの近く（半径 r）の たいまつ を 近い順に。光の中心は 棒の上 */
  private scanTorches(p: { x: number; y: number; z: number }, r: number): THREE.Vector3[] {
    const out: { v: THREE.Vector3; d: number }[] = [];
    const w = this.d.world;
    const x0 = Math.floor(p.x) - r;
    const z0 = Math.floor(p.z) - r;
    const y0 = Math.max(0, Math.floor(p.y) - r);
    const y1 = Math.min(w.size.y - 1, Math.floor(p.y) + r);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z0 + 2 * r; z++)
        for (let x = x0; x <= x0 + 2 * r; x++) {
          const b = w.getIndex(x, y, z);
          if (b > 0 && isTorchIndex(b)) {
            const v = new THREE.Vector3(x + 0.5, y + 0.82, z + 0.5);
            out.push({ v, d: v.distanceTo(new THREE.Vector3(p.x, p.y + 1, p.z)) });
          }
        }
    out.sort((a, b) => a.d - b.d);
    return out.map((o) => o.v);
  }

  // ------------------------------------------------------------------ 丸い影

  private updateBlobs(p: { x: number; y: number; z: number }): void {
    const b = this.uniforms.uShBlob.value;
    for (const v of b) v.w = 0;
    if (this.params.blob <= 0) return;
    b[0].set(p.x, p.y, p.z, 0.45);
    const ys = this.d.yokaiFeet?.() ?? [];
    ys.sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z));
    for (let i = 0; i < Math.min(ys.length, MAX_BLOBS - 1); i++) b[i + 1].set(ys[i].x, ys[i].y, ys[i].z, ys[i].r);
  }

  // ------------------------------------------------------------------ 見る（計測）

  private addFrame(s: PassStats): void {
    this.frameStats.calls += s.calls;
    this.frameStats.triangles += s.triangles;
  }

  stats(): ShadowStats {
    let bytes = 0;
    for (const c of [...this.cascades, this.dyn]) bytes += c.size * c.size * (4 + 1);
    for (let i = 0; i < Math.min(this.params.torches, MAX_TORCH_SHADOWS); i++) bytes += this.params.torchSize * this.params.torchSize * 6 * (4 + 1);
    this.st.gpuBytes = bytes;
    return JSON.parse(JSON.stringify(this.st)) as ShadowStats;
  }

  /** 止まっている地図を 次のコマで 描き直す */
  invalidate(): void {
    for (const c of this.cascades) c.center = null;
    for (const t of this.torchMaps) t.pos = null;
  }
}

export { MAX_BLOBS };
