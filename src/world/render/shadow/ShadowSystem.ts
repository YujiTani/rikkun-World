// 光の位置から計算する影（#144、docs/design/SHADOW.md）。段 1: 太陽と月。
// しくみ:
// - 太陽・月の向きから見た「深さの地図」（shadow map）。止まっている世界の地図 2 枚（近く ±32・遠く ±96）は
//   変わったときだけ描き直す（太陽が動いた・プレイヤーが歩いた・範囲の中のメッシュが変わった）。1 コマに 1 枚まで。
//   動く物（キャラの板・妖怪）は 小さい地図 1 枚（±20）に 毎コマ描く。
// - 受ける側（ブロックの材料・キャラの板）は 地図を引いて 光に shRatio をかける（shadowGlsl.ts / shadowPatch.ts）。
// - 影の強さ・向きは shadowLight.ts、地図のカメラの 1 目そろえは shadowCamera.ts（ユニットテストあり）。
import * as THREE from 'three';
import { bearingDeg, dirIndex } from '../../../char/view';
import { isTorchIndex } from '../../blocks/blockTypes';
import type { TimeSettings } from '../../../time/config';
import type { WorldRenderer } from '../WorldRenderer';
import { snapMapCenter, lightAxes } from './shadowCamera';
import { shadowLight, type ShadowLightInfo } from './shadowLight';
import { patchSpriteMaterial, shadowPatch } from './shadowPatch';
import { assignTorchSlots, hashStep, pickNearestTorches, shouldRedrawTorch, torchCenter, torchKey, type TorchCandidate } from './shadowTorch';

/** 影の中の明るさ（オーナーの決定 0.55） */
export const SHADOW_DARKNESS = 0.55;

export interface ShadowStatsHook {
  enabled: boolean;
  /** resetStats からの 地図の描き直しの数 */
  redraws: { near: number; far: number; dynamic: number };
  /** staticRedrawn / draws / triangles = このコマ、maxStaticPerFrame = resetStats からの最大 */
  frame: { staticRedrawn: ('near' | 'far')[]; draws: number; triangles: number; maxStaticPerFrame: number };
  light: { x: number; y: number; z: number; strength: number; body: 'sun' | 'moon' };
  /** 段 2: たいまつの影。count = 使っている地図の数（2 まで）、redraws = resetStats からの 描き直し、frame* = このコマ */
  torch: { count: number; redraws: number; frameRedrawn: number; frameDraws: number; frameTriangles: number };
}

export interface ShadowDeps {
  renderer: THREE.WebGLRenderer;
  worldRenderer: WorldRenderer;
  timeSettings: TimeSettings;
  dayTick: () => number;
  /** 動く物（妖怪）のグループ */
  yokaiGroup: THREE.Object3D;
  /** キャラの足もと（ワールド座標） */
  player: () => { x: number; y: number; z: number };
  /** キャラの向き（度。yaw と同じ数え方） */
  facing: () => number;
  /** たいまつをさがすための世界（ブロック番号） */
  world?: { getIndex(x: number, y: number, z: number): number };
}

/** たいまつの影（段 2）の 1 本ぶん */
interface TorchSlot {
  rt: THREE.WebGLCubeRenderTarget | null;
  cam: THREE.CubeCamera | null;
  pos: THREE.Vector3;
  key: number;
  active: boolean;
  hadMovers: boolean;
  needsDraw: boolean;
  /** 最後に描いたときの 動く物の 位置・絵のコマの まぜた数（同じなら 描き直さない） */
  sig: number;
}

interface Cascade {
  name: 'near' | 'far';
  rt: THREE.WebGLRenderTarget;
  depth: THREE.DepthTexture;
  cam: THREE.OrthographicCamera;
  size: number;
  half: number;
  matrix: THREE.Matrix4;
  /** 最後に描いたときの中心・光の向き */
  center: THREE.Vector3 | null;
  dir: THREE.Vector3;
  /** 描いたあとに 範囲の中でメッシュが変わった */
  dirty: boolean;
  framesSince: number;
  /** 中心から これだけ歩いたら 描き直す（ブロック） */
  recenter: number;
  /** 光の向きが これだけ動いたら 描き直す（度） */
  angleStep: number;
}

const DEPTH_REACH = 160; // 光の向きの後ろへ 160 ブロック（高い山・木も入る）
const MAP_OUTSET = 16; // 地図のはばの外 16 ブロックまでのメッシュの変化も 描き直しの理由にする（高い物の影がのびてくる）
const THROTTLE = 4; // メッシュが変わってから描き直すまでの最小のコマ数
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const RAD2DEG = 180 / Math.PI;
const TORCH_RADIUS = 10; // 光の とどく半径（ブロック）
const TORCH_NEAR_MOVER = 11; // この中に動く物がいるコマだけ 描き直す
const TORCH_FAR_MARGIN = 1; // 半径 11 + これより 遠い妖怪は 地図に描かない
const TORCH_FIND = 16; // プレイヤーから これ以内の たいまつを さがす
const TORCH_FIND_EVERY = 30;
const TORCH_ENC = 12; // 地図に書く距離の 1.0 = 12 ブロック
const TORCH_CUBE = 256;
const TORCH_DARKNESS = 0.3; // 影の中の たいまつの光（オーナーの決定）

function makeDepthTarget(size: number): { rt: THREE.WebGLRenderTarget; depth: THREE.DepthTexture } {
  const depth = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  depth.format = THREE.DepthFormat;
  depth.compareFunction = THREE.LessEqualCompare;
  depth.minFilter = depth.magFilter = THREE.LinearFilter; // 比べる sampler の 2×2 ぼかし（ハード）
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

export class ShadowSystem {
  readonly uniforms = shadowPatch.uniforms;
  private readonly cascades: Cascade[] = [];
  private readonly dyn: Cascade;
  private readonly depthBasic = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly depthCutout: THREE.MeshBasicMaterial;
  private readonly cardScene = new THREE.Scene();
  private readonly cardDistScene = new THREE.Scene();
  private card: THREE.Mesh | null = null;
  private spriteMesh: THREE.Mesh | null = null;
  /** 影を落とす板の 絵の場所（光の側から見た向きの絵） */
  private readonly cardRect = new THREE.Vector4(0, 0, 1, 1);
  private readonly cardCrop = new THREE.Vector4(0, 0, 1, 1);
  /** 影を落とす板の 絵・大きさ（cardCell が そのコマの ぶんを 書く。キャラの板とは 別の入れ物） */
  private readonly cardMap: { value: THREE.Texture | null } = { value: null };
  private readonly cardSize = new THREE.Vector2(1, 1);
  private readonly L = new THREE.Vector3(0, 1, 0);
  // 毎コマ new しないための作業用
  private readonly tmpBasis = new THREE.Matrix4();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly yokaiSwap: [THREE.Mesh, THREE.Material | THREE.Material[], boolean][] = [];
  private readonly worldSwap: [THREE.Mesh, THREE.Material | THREE.Material[], boolean][] = [];
  private info: ShadowLightInfo;
  private inited = false;
  private _enabled = true;
  private redraws = { near: 0, far: 0, dynamic: 0 };
  private maxStatic = 0;
  private frameInfo = { staticRedrawn: [] as ('near' | 'far')[], draws: 0, triangles: 0 };
  // ---- たいまつ（段 2）
  private readonly torches: TorchSlot[] = [0, 1].map(() => ({ rt: null, cam: null, pos: new THREE.Vector3(), key: -1, active: false, hadMovers: false, needsDraw: false, sig: 0 }));
  private torchDirty = true;
  private torchFrame = 0;
  private torchRedraws = 0;
  private torchFrameInfo = { redrawn: 0, draws: 0, triangles: 0 };
  private readonly torchDist: THREE.ShaderMaterial;
  private cardDist: THREE.Mesh | null = null;
  private readonly tmpMovers: THREE.Vector3[] = [];
  /** 1 本の たいまつから 動く物（キャラ・妖怪）までの 距離（毎コマ使い回す） */
  private readonly moverDist: number[] = [];
  private readonly tmpColor = new THREE.Color();
  /** 影の強さを 0 にしたい（shadeAt の 1 回だけ影なし） */
  private forceOff = false;

  /** 材料に影を入れる印を立てる。ブロックの材料を作る前（最初の描画の前）に呼ぶ */
  static activate(): void {
    shadowPatch.active = true;
  }

  constructor(private readonly d: ShadowDeps) {
    const opaque = d.worldRenderer.materials()[1];
    this.depthCutout = new THREE.MeshBasicMaterial({ map: opaque.map, alphaTest: 0.5, side: THREE.DoubleSide, colorWrite: false });
    const mk = (name: 'near' | 'far', size: number, half: number, recenter: number, angleStep: number): Cascade => {
      const { rt, depth } = makeDepthTarget(size);
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0, DEPTH_REACH * 2);
      return { name, rt, depth, cam, size, half, matrix: new THREE.Matrix4(), center: null, dir: new THREE.Vector3(), dirty: true, framesSince: 999, recenter, angleStep };
    };
    this.cascades.push(mk('near', 2048, 32, 4, 0.25));
    this.cascades.push(mk('far', 1024, 96, 16, 0.5));
    this.dyn = mk('near', 1024, 20, 0, 0);
    this.torchDist = new THREE.ShaderMaterial({
      uniforms: { uLight: { value: new THREE.Vector3() }, uInv: { value: 1 / TORCH_ENC } },
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }',
      fragmentShader: 'uniform vec3 uLight; uniform float uInv; varying vec3 vW; void main(){ gl_FragColor = vec4(vec3(length(vW - uLight) * uInv), 1.0); }',
    });
    const u = this.uniforms;
    u.uShMap0.value = this.cascades[0]!.depth;
    u.uShMap1.value = this.cascades[1]!.depth;
    u.uShMapD.value = this.dyn.depth;
    u.uShTexel.value.set((2 * 32) / 2048, (2 * 96) / 1024, (2 * 20) / 1024);
    u.uShRange.value.set(DEPTH_REACH * 2, DEPTH_REACH * 2, DEPTH_REACH * 2);
    u.uShP.value.set(0, SHADOW_DARKNESS, 9, 0);
    u.uShT.value.set(0, TORCH_RADIUS, TORCH_DARKNESS, TORCH_ENC);
    this.info = shadowLight(d.dayTick(), d.timeSettings);
    d.worldRenderer.onMeshChange = (cx, cz) => {
      this.torchDirty = true;
      this.meshChanged(cx, cz);
    };
    // もう作ってあるブロックの材料は 影つきのプログラムで 作りなおす
    for (const m of d.worldRenderer.materials()) m.needsUpdate = true;
  }

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
  }

  // ------------------------------------------------------------------ キャラの板

  /** キャラの板（ShaderMaterial）: 止まっている世界の影を受ける。影を落とす専用の板も作る */
  attachSprite(mesh: THREE.Mesh): void {
    this.spriteMesh = mesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    patchSpriteMaterial(mat);
    // 影を落とす板: 同じ絵を、光の方へたてに向ける。絵は「光の側から見た向き」のコマ
    const mkCard = (dist: boolean) => new THREE.ShaderMaterial({
      // uMap・uSize・uRect・uCrop は 光の側から見た向きのコマ（cardCell が いまの動き・コマから 決める。キャラの板の uniform とは 別）
      uniforms: { uMap: this.cardMap, uSize: { value: this.cardSize }, uRect: { value: this.cardRect }, uCrop: { value: this.cardCrop }, ...(dist ? { uLight: this.torchDist.uniforms.uLight!, uInv: this.torchDist.uniforms.uInv! } : {}) },
      vertexShader: dist
        ? 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }'
        : 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // 絵の透明でぬく。ほそい足・すきまが 光をもらさないよう、まわり 12 目ぶんふくらませた形にする（見やすい影）
      // 絵の引き方は キャラの板（src/char/sprite.ts）と同じ整数の目（切りつめた絵。四角の外は とうめい）
      fragmentShader: `${dist ? 'uniform vec3 uLight; uniform float uInv; varying vec3 vW;' : ''}
uniform sampler2D uMap; uniform vec4 uRect; uniform vec4 uCrop; uniform vec2 uSize; varying vec2 vUv;
bool solid(vec2 c) {
  c = clamp(c, 0.001, 0.999);
  vec2 cp = floor(clamp(vec2(c.x, 1.0 - c.y) * 256.0, 0.0, 255.0));
  vec2 d = cp - floor(uCrop.xy * 256.0 + 0.5);
  if (d.x < 0.0 || d.y < 0.0 || d.x >= floor(uCrop.z * 256.0 + 0.5) || d.y >= floor(uCrop.w * 256.0 + 0.5)) return false;
  vec2 t = floor(uRect.xy * uSize + 0.5) + d;
  return floor(texture2D(uMap, (t + 0.5) / uSize).r * 255.0 + 0.5) > 0.5;
}
void main() {
  bool hit = solid(vUv);
  for (int i = 0; i < 8 && !hit; i++) {
    float a = float(i) * 0.7853982;
    vec2 d = vec2(cos(a), sin(a));
    hit = solid(vUv + d * (6.0 / 256.0)) || solid(vUv + d * (12.0 / 256.0));
  }
  if (!hit) discard;
  gl_FragColor = ${dist ? 'vec4(vec3(length(vW - uLight) * uInv), 1.0)' : 'vec4(0.0)'};
}`,
      side: THREE.DoubleSide,
    });
    this.card = new THREE.Mesh(mesh.geometry, mkCard(false));
    this.card.matrixAutoUpdate = false;
    this.card.frustumCulled = false;
    this.cardScene.add(this.card);
    // たいまつの地図用: 同じ板で 光からの距離を書く
    this.cardDist = new THREE.Mesh(mesh.geometry, mkCard(true));
    this.cardDist.matrixAutoUpdate = false;
    this.cardDist.frustumCulled = false;
    this.cardDistScene.add(this.cardDist);
  }

  // ------------------------------------------------------------------ 毎コマ（描く前）

  /** 全部の地図を 1 回 からにしておく（まだ描いていない地図は GPU に無く、比べる sampler とかみ合わない） */
  private initTargets(): void {
    const r = this.d.renderer;
    const prev = r.getRenderTarget();
    for (const c of [...this.cascades, this.dyn]) {
      r.setRenderTarget(c.rt);
      r.clear(false, true, false);
    }
    r.setRenderTarget(prev);
    this.inited = true;
  }

  /** 描く直前に呼ぶ。地図を（必要なら）描き直し、uniform を書く */
  preRender(): void {
    this.update(false);
  }

  /** 調べる用: 1 コマ 1 枚の制限もコマ数の待ちもなしで、地図をいま最新にする（統計の「このコマ」は変えない） */
  sync(): void {
    this.update(true);
  }

  private update(force: boolean): void {
    if (!this.inited) this.initTargets();
    const u = this.uniforms;
    const on = this._enabled && !this.forceOff;
    if (!force) this.frameInfo = { staticRedrawn: [], draws: 0, triangles: 0 };
    this.info = shadowLight(this.d.dayTick(), this.d.timeSettings);
    const info = this.info;
    this.L.set(info.mapDir.x, info.mapDir.y, info.mapDir.z);
    const strength = on ? info.strength : 0;
    u.uShP.value.x = strength;
    // 昼（太陽が出ている）は ブロックの光を 影のこさ まで弱める（月の夜は そのまま）
    u.uShBlockDay.value = on && info.body === 'sun' ? THREE.MathUtils.lerp(1, SHADOW_DARKNESS, info.strength) : 1;
    u.uShL.value.copy(this.L);
    const p = this.d.player();
    this.updateTorches(p, force, on);
    if (strength <= 0.001) return;
    const r = this.d.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    this.maybeStatic(p, force);
    this.renderDynamic(p, force);
    // キャラの板は 空の光の段階を 持たないので、頭の高さの 空の光で「じかの 日の光」の 割合を 出す（洞くつで 太陽の影にしない）
    const sky = this.d.worldRenderer.light.skyLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    u.uShSpriteDirect.value = THREE.MathUtils.smoothstep(sky, 12.5, 14.5);
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;
  }

  /** 光の向きの軸で、中心を 1 目の整数倍にそろえて カメラを置く */
  private placeCam(c: Cascade, center: { x: number; y: number; z: number }): void {
    const s = snapMapCenter(center, this.L, c.half, c.size);
    const { right, up } = lightAxes(this.L);
    const cam = c.cam;
    cam.position.set(s.x + this.L.x * DEPTH_REACH, s.y + this.L.y * DEPTH_REACH, s.z + this.L.z * DEPTH_REACH);
    cam.quaternion.setFromRotationMatrix(this.tmpBasis.makeBasis(this.tmpRight.set(right.x, right.y, right.z), this.tmpUp.set(up.x, up.y, up.z), this.L));
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    c.matrix.multiplyMatrices(BIAS, cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  }

  /** メッシュが変わった列: 範囲に入る地図だけ 描き直しの印をつける */
  private meshChanged(cx: number, cz: number): void {
    const x0 = cx * 16;
    const z0 = cz * 16;
    for (const c of this.cascades) {
      if (!c.center) continue;
      const reach = c.half + MAP_OUTSET;
      if (x0 + 16 >= c.center.x - reach && x0 <= c.center.x + reach && z0 + 16 >= c.center.z - reach && z0 <= c.center.z + reach) c.dirty = true;
    }
  }

  /** 止まっている地図: 描き直す理由のある地図を 1 コマに 1 枚だけ描く（近くが先） */
  private maybeStatic(p: { x: number; y: number; z: number }, force: boolean): void {
    let drew = 0;
    for (const c of this.cascades) {
      c.framesSince++;
      if (!force && drew >= 1) continue;
      const moved = !c.center || Math.hypot(p.x - c.center.x, p.z - c.center.z) >= c.recenter || Math.abs(p.y - c.center.y) >= c.recenter * 2;
      const turned = c.dir.angleTo(this.L) * RAD2DEG >= c.angleStep;
      const changed = c.dirty && (force || c.framesSince >= THROTTLE);
      if (!(moved || turned || changed)) continue;
      if (moved || !c.center) c.center = new THREE.Vector3(p.x, p.y, p.z);
      c.dir.copy(this.L);
      c.dirty = false;
      c.framesSince = 0;
      this.placeCam(c, c.center);
      const s = this.renderWorldDepth(c.rt, c.cam);
      this.redraws[c.name]++;
      (c.name === 'near' ? this.uniforms.uShMat0 : this.uniforms.uShMat1).value.copy(c.matrix);
      if (!force) {
        this.frameInfo.staticRedrawn.push(c.name);
        this.frameInfo.draws += s.calls;
        this.frameInfo.triangles += s.triangles;
        this.maxStatic = Math.max(this.maxStatic, this.frameInfo.staticRedrawn.length);
      }
      drew++;
    }
  }

  /** 世界（ブロックのメッシュ）を 深さだけで描く。水は描かない */
  private renderWorldDepth(target: THREE.WebGLRenderTarget, cam: THREE.Camera): { calls: number; triangles: number } {
    const r = this.d.renderer;
    const wr = this.d.worldRenderer;
    const [, opaque, water, lodOpaque, lodWater] = wr.materials();
    const swapped = this.worldSwap;
    swapped.length = 0;
    for (const o of wr.group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      const mat = m.material;
      swapped.push([m, mat, m.visible]);
      if (mat === water || mat === lodWater) m.visible = false;
      else if (mat === opaque) m.material = this.depthCutout;
      else if (mat === lodOpaque || (!Array.isArray(mat) && mat.customProgramCacheKey().startsWith('rikkun-voxel-tex'))) m.material = this.depthBasic;
    }
    try {
      r.setRenderTarget(target);
      r.autoClear = false;
      r.clear(false, true, false);
      r.render(wr.group, cam);
      return { calls: r.info.render.calls, triangles: r.info.render.triangles };
    } finally {
      for (const [m, mat, vis] of swapped) {
        m.material = mat;
        m.visible = vis;
      }
      swapped.length = 0;
    }
  }

  /** 動く物（妖怪・キャラの板）を 動く物の地図に描く（毎コマ） */
  private renderDynamic(p: { x: number; y: number; z: number }, force: boolean): void {
    const c = this.dyn;
    this.placeCam(c, p);
    this.uniforms.uShMatD.value.copy(c.matrix);
    const r = this.d.renderer;
    r.setRenderTarget(c.rt);
    r.autoClear = false;
    r.clear(false, true, false);
    let calls = 0;
    let triangles = 0;
    const swapped = this.yokaiSwap;
    swapped.length = 0;
    this.d.yokaiGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.Material;
      swapped.push([m, m.material, m.visible]);
      // 透明・うら面・光る部品は 影にしない
      if (Array.isArray(m.material) || mat.transparent || mat.side === THREE.BackSide || (mat as THREE.MeshBasicMaterial).fog === false) m.visible = false;
      else m.material = this.depthBasic;
    });
    try {
      r.render(this.d.yokaiGroup, c.cam);
      calls += r.info.render.calls;
      triangles += r.info.render.triangles;
    } finally {
      for (const [m, mat, vis] of swapped) {
        m.material = mat;
        m.visible = vis;
      }
      swapped.length = 0;
    }
    const card = this.cardCall(c.cam);
    calls += card.calls;
    triangles += card.triangles;
    this.redraws.dynamic++;
    if (!force) {
      this.frameInfo.draws += calls;
      this.frameInfo.triangles += triangles;
    }
  }

  /** キャラの影を落とす板を 光の方へ向けて 描く */
  private cardCall(cam: THREE.Camera): { calls: number; triangles: number } {
    const sm = this.spriteMesh;
    if (!this.card || !sm) return { calls: 0, triangles: 0 };
    const r = this.d.renderer;
    sm.updateWorldMatrix(true, false);
    const pos = this.tmpPos;
    const scl = this.tmpScale;
    const q = this.tmpQuat;
    sm.matrixWorld.decompose(pos, q, scl);
    // 板を 光の来る向きへ 立てて向ける（たての軸だけ回す）
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(this.L.x, this.L.z));
    // 絵: いまの動きのコマのまま、段は 0（横から）、向きは「光の側から見た向き」
    const cardCell = sm.userData.cardCell as ((t: number, d: number, rect: THREE.Vector4, crop: THREE.Vector4, map: { value: THREE.Texture | null }, size: THREE.Vector2) => boolean) | undefined;
    if (!cardCell) return { calls: 0, triangles: 0 };
    const dir = dirIndex(bearingDeg(this.L.x, this.L.z), this.d.facing());
    if (!cardCell(0, dir, this.cardRect, this.cardCrop, this.cardMap, this.cardSize)) return { calls: 0, triangles: 0 };
    this.card!.matrix.compose(pos, q, scl);
    this.card!.matrixWorld.copy(this.card!.matrix);
    r.render(this.cardScene, cam);
    return { calls: r.info.render.calls, triangles: r.info.render.triangles };
  }

  // ------------------------------------------------------------------ たいまつの影（段 2）

  /** プレイヤーの近くの たいまつ 2 本をさがし、動く物が近いコマ（と たいまつが変わったとき）だけ キューブ地図を描き直す */
  private updateTorches(p: { x: number; y: number; z: number }, force: boolean, on: boolean): void {
    const u = this.uniforms;
    this.torchFrameInfo = force ? this.torchFrameInfo : { redrawn: 0, draws: 0, triangles: 0 };
    const world = this.d.world;
    if (!on || !world) {
      u.uShT.value.x = 0;
      u.uShTA.value.w = 0;
      u.uShTB.value.w = 0;
      for (const t of this.torches) {
        t.active = false;
        t.key = -1;
      }
      this.torchDirty = true;
      return;
    }
    this.torchFrame++;
    if (this.torchDirty || force || this.torchFrame % TORCH_FIND_EVERY === 0) {
      this.torchDirty = false;
      this.findTorches(p, world);
    }
    let any = false;
    let matricesFresh = false;
    const mv = this.collectMovers(p);
    for (let i = 0; i < 2; i++) {
      const t = this.torches[i]!;
      const uv = i === 0 ? u.uShTA.value : u.uShTB.value;
      if (!t.active) {
        uv.w = 0;
        continue;
      }
      any = true;
      const md = this.moverDist;
      md.length = mv.length;
      for (let k = 0; k < mv.length; k++) md[k] = mv[k]!.distanceTo(t.pos);
      const dec = shouldRedrawTorch({ moverDistances: md, near: TORCH_NEAR_MOVER, hadMovers: t.hadMovers, needsDraw: t.needsDraw });
      let sig = 0;
      if (dec.hasMovers) {
        if (!matricesFresh) {
          this.d.yokaiGroup.updateMatrixWorld(true);
          matricesFresh = true;
        }
        sig = this.moverSignature(t, p, md);
      }
      // 動く物の 位置・絵のコマが 前に描いたときと同じなら 描き直さない
      if (dec.redraw && (t.needsDraw || !dec.hasMovers || sig !== t.sig || !t.hadMovers)) {
        this.drawTorch(t, p, force);
        t.sig = sig;
      }
      t.hadMovers = dec.hasMovers;
      t.needsDraw = false;
      uv.set(t.pos.x, t.pos.y, t.pos.z, 1);
      (i === 0 ? u.uShCubeA : u.uShCubeB).value = t.rt!.texture;
    }
    u.uShT.value.x = any ? 1 : 0;
  }

  /** 半径 11 以内の 動く物の 位置・向き・絵のコマを まぜた数（描き直すかの 見分け） */
  private moverSignature(t: TorchSlot, p: { x: number; y: number; z: number }, dist: readonly number[]): number {
    let h = 0;
    h = hashStep(h, p.x);
    h = hashStep(h, p.y);
    h = hashStep(h, p.z);
    h = hashStep(h, this.d.facing());
    const sm = this.spriteMesh;
    if (sm) {
      const u = (sm.material as THREE.ShaderMaterial).uniforms;
      const rect = u.uRect?.value as THREE.Vector4 | undefined;
      const crop = u.uCrop?.value as THREE.Vector4 | undefined;
      if (rect) h = hashStep(hashStep(hashStep(hashStep(h, rect.x), rect.y), rect.z), rect.w);
      if (crop) h = hashStep(hashStep(hashStep(hashStep(h, crop.x), crop.y), crop.z), crop.w);
    }
    const kids = this.d.yokaiGroup.children;
    for (let i = 0; i < kids.length; i++) {
      if ((dist[i + 1] ?? Infinity) >= TORCH_NEAR_MOVER + TORCH_FAR_MARGIN) continue;
      h = this.hashMatrices(kids[i]!, h);
    }
    void t;
    return h;
  }

  private hashMatrices(o: THREE.Object3D, h: number): number {
    const e = o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) h = hashStep(h, e[i]!);
    for (let i = 0; i < o.children.length; i++) h = this.hashMatrices(o.children[i]!, h);
    return h;
  }

  /** 動く物の位置: キャラと妖怪（いちばん上の子の位置） */
  private collectMovers(p: { x: number; y: number; z: number }): THREE.Vector3[] {
    const out = this.tmpMovers;
    const kids = this.d.yokaiGroup.children;
    while (out.length < kids.length + 1) out.push(new THREE.Vector3());
    out.length = kids.length + 1;
    out[0]!.set(p.x, p.y + 0.8, p.z);
    for (let i = 0; i < kids.length; i++) kids[i]!.getWorldPosition(out[i + 1]!);
    return out;
  }

  private findTorches(p: { x: number; y: number; z: number }, world: { getIndex(x: number, y: number, z: number): number }): void {
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    const pz = Math.floor(p.z);
    const cands: TorchCandidate[] = [];
    for (let x = px - TORCH_FIND; x <= px + TORCH_FIND; x++) {
      for (let z = pz - TORCH_FIND; z <= pz + TORCH_FIND; z++) {
        for (let y = py - 10; y <= py + 12; y++) {
          const bi = world.getIndex(x, y, z);
          if (bi > 0 && isTorchIndex(bi)) cands.push({ x, y, z });
        }
      }
    }
    const found = pickNearestTorches(cands, p, TORCH_FIND);
    const slots = this.torches;
    const res = assignTorchSlots(slots, found.map((q) => torchKey(q)));
    for (let i = 0; i < slots.length; i++) {
      const t = slots[i]!;
      const r = res[i]!;
      t.key = r.key;
      t.active = r.active;
      if (!r.fresh) continue;
      const f = found.find((q) => torchKey(q) === r.key)!;
      const c = torchCenter(f);
      t.pos.set(c.x, c.y, c.z);
      t.needsDraw = true;
      t.hadMovers = false;
      if (!t.rt) {
        t.rt = new THREE.WebGLCubeRenderTarget(TORCH_CUBE, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        t.cam = new THREE.CubeCamera(0.05, TORCH_ENC, t.rt);
      }
    }
  }

  /** 妖怪 1 体ぶん: 光からの距離を書く材料にかえる（透明・うら面・光る部品は 描かない）。もとは yokaiSwap に のこす */
  private swapForTorch(o: THREE.Object3D): void {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.Material;
      this.yokaiSwap.push([m, m.material, m.visible]);
      if (Array.isArray(m.material) || mat.transparent || mat.side === THREE.BackSide || (mat as THREE.MeshBasicMaterial).fog === false) m.visible = false;
      else m.material = this.torchDist;
    }
    for (let i = 0; i < o.children.length; i++) this.swapForTorch(o.children[i]!);
  }

  /** 1 本の たいまつの キューブ地図を 描く: 光からの距離を 赤に（からは 1.0 = とても遠い） */
  private drawTorch(t: TorchSlot, p: { x: number; y: number; z: number }, force: boolean): void {
    const r = this.d.renderer;
    const cc = t.cam!;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevClear = r.getClearColor(this.tmpColor).getHex();
    const prevAlpha = r.getClearAlpha();
    cc.position.copy(t.pos);
    if (cc.coordinateSystem !== r.coordinateSystem) {
      cc.coordinateSystem = r.coordinateSystem;
      cc.updateCoordinateSystem();
    }
    cc.updateMatrixWorld(true);
    this.torchDist.uniforms.uLight!.value.copy(t.pos);
    // 板の絵: 光の側から見た向き
    let cardOk = false;
    const sm = this.spriteMesh;
    const near = Math.hypot(p.x - t.pos.x, p.y - t.pos.y, p.z - t.pos.z) < TORCH_NEAR_MOVER + 1;
    if (sm && this.cardDist && near) {
      sm.updateWorldMatrix(true, false);
      sm.matrixWorld.decompose(this.tmpPos, this.tmpQuat, this.tmpScale);
      const dx = t.pos.x - this.tmpPos.x;
      const dz = t.pos.z - this.tmpPos.z;
      this.tmpQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(dx, dz));
      const cardCell = sm.userData.cardCell as ((t: number, d: number, rect: THREE.Vector4, crop: THREE.Vector4, map: { value: THREE.Texture | null }, size: THREE.Vector2) => boolean) | undefined;
      cardOk = !!cardCell && cardCell(0, dirIndex(bearingDeg(dx, dz), this.d.facing()), this.cardRect, this.cardCrop, this.cardMap, this.cardSize);
      if (cardOk) {
        this.cardDist.matrix.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.cardDist.matrixWorld.copy(this.cardDist.matrix);
      }
    }
    const swapped = this.yokaiSwap;
    swapped.length = 0;
    // 光から遠い妖怪は 描かない（moverDist[i + 1] = 子 i までの距離）
    const kids = this.d.yokaiGroup.children;
    for (let i = 0; i < kids.length; i++) {
      const far = (this.moverDist[i + 1] ?? 0) >= TORCH_NEAR_MOVER + TORCH_FAR_MARGIN;
      if (!far) this.swapForTorch(kids[i]!);
    }
    for (let i = 0; i < kids.length; i++) {
      if ((this.moverDist[i + 1] ?? 0) >= TORCH_NEAR_MOVER + TORCH_FAR_MARGIN) {
        swapped.push([kids[i] as THREE.Mesh, null as unknown as THREE.Material, kids[i]!.visible]);
        kids[i]!.visible = false;
      }
    }
    let calls = 0;
    let triangles = 0;
    try {
      r.setClearColor(0xffffff, 1);
      r.autoClear = false;
      for (let face = 0; face < 6; face++) {
        const cam = cc.children[face] as THREE.PerspectiveCamera;
        r.setRenderTarget(t.rt!, face);
        r.clear(true, true, false);
        r.render(this.d.yokaiGroup, cam);
        calls += r.info.render.calls;
        triangles += r.info.render.triangles;
        if (cardOk) {
          r.render(this.cardDistScene, cam);
          calls += r.info.render.calls;
          triangles += r.info.render.triangles;
        }
      }
    } finally {
      for (const [m, mat, vis] of swapped) {
        if (mat) m.material = mat;
        m.visible = vis;
      }
      swapped.length = 0;
      r.setClearColor(prevClear, prevAlpha);
      r.setRenderTarget(prevTarget);
      r.autoClear = prevAuto;
    }
    this.torchRedraws++;
    if (!force) {
      this.torchFrameInfo.redrawn++;
      this.torchFrameInfo.draws += calls;
      this.torchFrameInfo.triangles += triangles;
      this.frameInfo.draws += calls;
      this.frameInfo.triangles += triangles;
    }
  }

  // ------------------------------------------------------------------ 窓口・調べる用

  /** fn の間だけ 影を on / off にして（地図は最新にして）、おわったらもどす */
  withShadow<T>(on: boolean, fn: () => T): T {
    const prev = this.forceOff;
    this.forceOff = !on;
    try {
      this.update(true);
      return fn();
    } finally {
      this.forceOff = prev;
      this.update(true);
    }
  }

  get light(): ShadowLightInfo {
    return this.info;
  }

  stats(): ShadowStatsHook {
    const i = this.info;
    return {
      enabled: this._enabled,
      redraws: { ...this.redraws },
      frame: { ...this.frameInfo, staticRedrawn: [...this.frameInfo.staticRedrawn], maxStaticPerFrame: this.maxStatic },
      light: { x: i.dir.x, y: i.dir.y, z: i.dir.z, strength: i.strength, body: i.body },
      torch: { count: this.torches.filter((t) => t.active).length, redraws: this.torchRedraws, frameRedrawn: this.torchFrameInfo.redrawn, frameDraws: this.torchFrameInfo.draws, frameTriangles: this.torchFrameInfo.triangles },
    };
  }

  resetStats(): void {
    this.redraws = { near: 0, far: 0, dynamic: 0 };
    this.maxStatic = 0;
    this.torchRedraws = 0;
  }

  /** F3 に出す 1 行 */
  line(): string {
    if (!this._enabled) return 'shadow off';
    const f = this.frameInfo;
    return `shadow near ${this.redraws.near} far ${this.redraws.far} dyn ${this.redraws.dynamic}  draw ${f.draws} tri ${f.triangles}  torch ${this.torches.filter((t) => t.active).length}/${this.torchRedraws}`;
  }

  /** 地図・材料・板を 捨てる（GPU の物を返す）。ゲームの終わりに 1 回 */
  dispose(): void {
    if (this.d.worldRenderer.onMeshChange) this.d.worldRenderer.onMeshChange = null;
    for (const c of [...this.cascades, this.dyn]) {
      c.rt.dispose();
      c.depth.dispose();
    }
    for (const t of this.torches) t.rt?.dispose();
    this.torchDist.dispose();
    if (this.cardDist) (this.cardDist.material as THREE.Material).dispose();
    this.depthBasic.dispose();
    this.depthCutout.dispose();
    if (this.card) {
      (this.card.material as THREE.Material).dispose();
      this.cardScene.remove(this.card);
      this.card = null;
    }
    this.uniforms.uShP.value.x = 0;
  }

  /** 地図の GPU メモリの目安（バイト） */
  gpuBytes(): number {
    let b = 0;
    for (const c of [...this.cascades, this.dyn]) b += c.size * c.size * (4 + 1);
    for (const t of this.torches) if (t.rt) b += TORCH_CUBE * TORCH_CUBE * 6 * (4 + 4);
    return b;
  }
}
