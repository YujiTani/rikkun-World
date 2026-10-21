import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import type { LegendEvent } from '../legend/LegendSystem';
import {
  BOLT,
  GLOW,
  PT,
  RING,
  SPARKS,
  THUNDER_ASSETS,
  ThunderTimeline,
  boltBillboard,
  boltCell,
  sparkAt,
  sparkShape,
  type ThunderView,
} from '../legend/thunderModel';

/**
 * ART-PIPE-1（docs/design/ART-PIPE-1.md 1.1）: 雷 B「ひかりの たま」。
 * - 雷: たて軸だけで カメラへ 向く 板 3 まい（奥・中・手前）を 1 回で。足し算。面に 近い 所ほど うすい（A 案: 世界の 深さの 絵を 読む）。
 * - 地面の 輪: 寝かせた 板 1 まい。つぶ: 32 こ まとめて 1 回。
 * - まわりを 明るく: 落雷の 間（F1〜F88）だけ 世界を 1 回「絵（色 ＋ 深さ）」に 描き、画面に うつす とき 光を 足す。
 *   世界は 2 回 描かない。ふだんは 今まで どおり 画面へ じかに 描く。うつす 板は 深さも 書きもどす ので、輪・つぶ・雷は ふつうの 深さテストで ブロックに かくれる。
 * - ため中の 手の 光・ため いっぱいの わは 今の まま（thunder_ground.png。雷 B の 数には ふくめない）。
 */

const BASE = './models/fx/';
const PALE = 0xfff6d0;
const WHITE = 0xffffff;

function loadTexture(url: string, repeatU = 1, repeatV = 1): THREE.Texture {
  const tex = new THREE.TextureLoader().load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(repeatU, repeatV);
  return tex;
}

function additive(map: THREE.Texture, opts: { depthTest?: boolean } = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: opts.depthTest ?? true,
    side: THREE.DoubleSide,
    fog: false,
    color: WHITE,
  });
}

export interface ThunderFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
  seed?: number;
}

/** ため中の 見た目の 入力（毎ステップ） */
export interface ChargeLook {
  charging: boolean;
  ready: boolean;
  /** 刀を かかげた 点（足もと + 上） */
  hand: Vec3;
  /** ため いっぱいの わ（S）。見えない ときは null */
  aimS: Vec3 | null;
}

/** テストの 窓口 `window.__rikkun.thunder` の 中身（型は e2e/helpers/thunder.ts と そろえる） */
export interface ThunderHook {
  info(): ThunderInfo;
  refresh(cam?: Vec3): void;
  project(p: Vec3): { x: number; y: number; visible: boolean };
  programs(): number;
  textures(): ThunderTexInfo[];
}

export interface ThunderLayerInfo {
  layer: 0 | 1 | 2;
  visible: boolean;
  center: Vec3;
  normal: Vec3;
  up: Vec3;
  width: number;
  height: number;
}

export interface ThunderInfo {
  F: number;
  S: Vec3 | null;
  bolt: { visible: boolean; frame: number; variant: number; flipped: boolean; layers: ThunderLayerInfo[] };
  ring: { visible: boolean; scale: number; radius: number; alpha: number; y: number; normal: Vec3; image: 'appear' | 'vanish' | null };
  sparks: { visible: boolean; alive: number };
  glow: { amount: number; color: string; center: Vec3 | null; full: number; zero: number; slots: number };
}

export interface ThunderTexInfo {
  name: 'sheet' | 'ground' | 'spark';
  file: string;
  width: number;
  height: number;
  magFilter: 'nearest' | 'linear';
  minFilter: 'nearest' | 'linear';
  mipmaps: boolean;
  colorSpace: 'srgb' | 'linear';
  blending: 'additive' | 'normal';
  depthWrite: boolean;
  depthTest: boolean;
}

// ── 深さを 読む 共通の シェーダー（世界の 絵と いっしょに 描いた 深さ） ──
const DEPTH_GLSL = `
#include <packing>
uniform sampler2D uDepth;
uniform vec2 uRes;
uniform vec2 uNearFar;
varying float vDist;
float sceneDist() {
  float d = texture2D(uDepth, gl_FragCoord.xy / uRes).x;
  return -perspectiveDepthToViewZ(d, uNearFar.x, uNearFar.y);
}`;

const BOLT_VERT = `
attribute float aLayer;
varying vec2 vUv;
varying float vLayer;
varying float vDist;
void main() {
  vUv = uv;
  vLayer = aLayer;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

/** 雷の 3 まい: 重ねの 絵を えらぶ・面に 近い ほど うすい（1/8 ブロック ごと 切り下げの 4 段・1/2 ブロックで 元の 明るさ） */
const BOLT_FRAG = `
uniform sampler2D uSheet;
uniform float uCol;
uniform float uFlip;
varying vec2 vUv;
varying float vLayer;
${DEPTH_GLSL}
void main() {
  vec2 lu = vUv;
  if (uFlip > 0.5) lu.x = 1.0 - lu.x;
  vec2 st = vec2((uCol * ${BOLT.cellW}.0 + lu.x * ${BOLT.cellW}.0) / ${BOLT.sheetW}.0, 1.0 - (vLayer * ${BOLT.cellH}.0 + (1.0 - lu.y) * ${BOLT.cellH}.0) / ${BOLT.sheetH}.0);
  vec4 c = texture2D(uSheet, st);
  float diff = sceneDist() - vDist;
  float soft = diff <= 0.0 ? 0.0 : clamp(floor(diff * 8.0 + 0.0001) / 4.0, 0.0, 1.0);
  gl_FragColor = vec4(c.rgb, c.a * soft);
  #include <colorspace_fragment>
}`;

const FLAT_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RING_FRAG = `
uniform sampler2D uTex;
uniform vec4 uRect; // u0, v0, du, dv
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, uRect.xy + vUv * uRect.zw);
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
  #include <colorspace_fragment>
}`;

const SPARK_VERT = `
attribute float aCell;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vUv = vec2((aCell + uv.x) / 4.0, uv.y);
  vTint = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const SPARK_FRAG = `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec3 vTint;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb * vTint, c.a);
  #include <colorspace_fragment>
}`;

/**
 * 世界の 絵を 画面に うつす ＋ まわりを 明るく ＋ 深さを 書きもどす。
 * 明るさ: 色 +（色 + 少しの 底上げ）× 量 × W × とどき。空（深さ 1）は 明るく しない。
 */
const BLIT_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLIT_FRAG = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uCenter;
uniform float uAmount;
varying vec2 vUv;
void main() {
  // 絵は 画面と 同じ sRGB の まま 入って いる ので、足し算の 前に リニアへ もどす
  vec3 col = sRGBTransferEOTF(texture2D(tColor, vUv)).rgb;
  float d = texture2D(tDepth, vUv).x;
  if (uAmount > 0.0 && d < 0.99999) {
    vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec3 wp = (uCamWorld * vec4(v.xyz / v.w, 1.0)).xyz;
    float reach = clamp((${GLOW.zero.toFixed(1)} - distance(wp, uCenter)) / ${(GLOW.zero - GLOW.full).toFixed(1)}, 0.0, 1.0);
    vec3 w = vec3(${((GLOW.color >> 16) & 255) / 255}, ${((GLOW.color >> 8) & 255) / 255}, ${(GLOW.color & 255) / 255});
    col += (col + 0.12) * w * (uAmount * reach);
  }
  gl_FragColor = vec4(col, 1.0);
  gl_FragDepth = d;
  #include <colorspace_fragment>
}`;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _size = new THREE.Vector2();

const UP: Vec3 = { x: 0, y: 1, z: 0 };

export class ThunderFx {
  private readonly cam: THREE.Camera;
  /** ため中の 手の 光・ための わ（ふつうの 世界の 中） */
  private readonly group = new THREE.Group();
  /** 雷 B（世界の 絵を 画面に うつした あとで 描く） */
  private readonly fxScene = new THREE.Scene();
  private readonly timeline: ThunderTimeline;

  private readonly sheet: THREE.Texture;
  private readonly boltMat: THREE.ShaderMaterial;
  private readonly bolt: THREE.Mesh;
  private readonly ringTex: THREE.Texture;
  private readonly ringMat: THREE.ShaderMaterial;
  private readonly ringMesh: THREE.Mesh;
  private readonly sparkTex: THREE.Texture;
  private readonly bits: THREE.InstancedMesh;
  private readonly bitMat: THREE.ShaderMaterial;
  private readonly bitCell: THREE.InstancedBufferAttribute;
  private readonly depthU = {
    uDepth: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNearFar: { value: new THREE.Vector2(0.1, 500) },
  };

  // ため中（今の まま）
  private readonly aimMesh: THREE.Mesh;
  private readonly handMesh = new THREE.Group();
  private readonly handMat: THREE.MeshBasicMaterial;
  private readonly glowTex: THREE.Texture;
  private readonly aimTex: THREE.Texture;

  // 世界の 絵（落雷の 間だけ 使う）
  private rt: THREE.WebGLRenderTarget | null = null;
  private readonly blitMat: THREE.ShaderMaterial;
  private readonly blitScene = new THREE.Scene();
  private readonly blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly center = new THREE.Vector3();

  /** この ステップに 見せた ようす（窓口と 描く 道が 読む） */
  private shown: ThunderView;
  /** 板の 向き（前の ステップの まま 持つ） */
  private readonly yawState = { yaw: 0 };
  private billboard: ReturnType<typeof boltBillboard> | null = null;

  constructor(deps: ThunderFxDeps) {
    this.cam = deps.camera;
    const base = deps.basePath ?? BASE;
    this.timeline = new ThunderTimeline((deps.seed ?? 7) ^ 0x7a11);
    this.shown = this.timeline.view();

    // 雷（3 まいを 1 つの 形に まとめる: 6 三角形）
    this.sheet = loadTexture(`${base}${THUNDER_ASSETS.sheet.file}`);
    this.boltMat = new THREE.ShaderMaterial({
      uniforms: { ...this.depthU, uSheet: { value: this.sheet }, uCol: { value: 0 }, uFlip: { value: 0 } },
      vertexShader: BOLT_VERT,
      fragmentShader: BOLT_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: THUNDER_ASSETS.depthWrite,
      depthTest: THUNDER_ASSETS.depthTest,
      side: THREE.DoubleSide,
    });
    const pos: number[] = [];
    const uvs: number[] = [];
    const layer: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < BOLT.layers; i++) {
      const z = BOLT.layerOffsets[i]!;
      const o = i * 4;
      const hw = BOLT.width / 2;
      pos.push(-hw, 0, z, hw, 0, z, hw, BOLT.height, z, -hw, BOLT.height, z);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
      layer.push(i, i, i, i);
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('aLayer', new THREE.Float32BufferAttribute(layer, 1));
    geo.setIndex(idx);
    this.bolt = new THREE.Mesh(geo, this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.visible = false;
    this.fxScene.add(this.bolt);

    // 地面の 輪（256×128。出る = x 0〜95・きえる = x 96〜191。y 0〜95）
    const gw = THUNDER_ASSETS.ground.width;
    const gh = THUNDER_ASSETS.ground.height;
    this.ringTex = loadTexture(`${base}${THUNDER_ASSETS.ground.file}`);
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.ringTex }, uRect: { value: new THREE.Vector4(0, (gh - 96) / gh, 96 / gw, 96 / gh) }, uAlpha: { value: 1 } },
      vertexShader: FLAT_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: THUNDER_ASSETS.depthWrite,
      depthTest: THUNDER_ASSETS.depthTest,
      side: THREE.DoubleSide,
    });
    const flat = new THREE.PlaneGeometry(1, 1);
    flat.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.Mesh(flat, this.ringMat);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.visible = false;
    this.fxScene.add(this.ringMesh);

    // つぶ（16×4。4×4 の 4 マス: ＋・Y1・Y3・空）
    this.sparkTex = loadTexture(`${base}${THUNDER_ASSETS.spark.file}`);
    const sg = new THREE.PlaneGeometry(1, 1);
    this.bitCell = new THREE.InstancedBufferAttribute(new Float32Array(SPARKS.count), 1);
    sg.setAttribute('aCell', this.bitCell);
    this.bitMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.sparkTex } },
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: THUNDER_ASSETS.depthWrite,
      depthTest: THUNDER_ASSETS.depthTest,
    });
    this.bits = new THREE.InstancedMesh(sg, this.bitMat, SPARKS.count);
    this.bits.frustumCulled = false;
    this.bits.visible = false;
    this.bits.setColorAt(0, _c.setHex(WHITE)); // instanceColor を 作る
    this.fxScene.add(this.bits);

    // ため中の 手の 光・ため いっぱいの わ（今の まま。thunder_ground.png の 128×128 版）
    this.glowTex = loadTexture(`${base}thunder_ground.png`, 0.5, 0.5);
    this.glowTex.offset.set(0, 0.5);
    this.aimTex = loadTexture(`${base}thunder_ground.png`, 0.5, 0.5);
    this.aimTex.offset.set(0.5, 0.5);
    const flat2 = new THREE.PlaneGeometry(1, 1);
    flat2.rotateX(-Math.PI / 2);
    this.aimMesh = new THREE.Mesh(flat2, additive(this.aimTex));
    this.handMat = additive(this.glowTex, { depthTest: false });
    const handGeo = new THREE.PlaneGeometry(1, 1);
    for (const ry of [0, Math.PI / 2]) {
      const hm = new THREE.Mesh(handGeo, this.handMat);
      hm.rotation.y = ry;
      hm.frustumCulled = false;
      hm.renderOrder = 3;
      this.handMesh.add(hm);
    }
    for (const m of [this.aimMesh, this.handMesh]) {
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
    }
    deps.scene.add(this.group);

    // 画面に うつす 板（深さも 書きもどす）
    this.blitMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCenter: { value: this.center },
        uAmount: { value: 0 },
      },
      vertexShader: BLIT_VERT,
      fragmentShader: BLIT_FRAG,
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat);
    quad.frustumCulled = false;
    this.blitScene.add(quad);
  }

  /** `legend` の 出来事（毎ステップ 1 回）。新しい 落雷は 始めから（前の 分は 消す） */
  onEvent(e: LegendEvent): void {
    if (e.type === 'lightningStart' && e.S) {
      // はなした ステップ = F1
      this.timeline.start({ S: e.S, variant: e.variant, skyVisible: e.skyVisible });
    }
  }

  /** 1 ステップ（Game.onUpdate）。落雷の F で 見た目を 決めて、F を すすめる */
  step(look: ChargeLook, reduced: boolean): void {
    const v = this.timeline.view(reduced);
    this.shown = v;
    this.timeline.step();

    // ため中の 光は 落雷が 始まったら（F1〜8）消す。描画回数に のこさない
    const falling = v.active && v.F <= 8;
    this.handMesh.visible = look.charging && !falling;
    if (this.handMesh.visible) {
      const s = look.ready ? 1.5 : 0.8;
      this.handMesh.position.set(look.hand.x, look.hand.y, look.hand.z);
      this.handMesh.scale.set(s, s, s);
      this.handMat.color.setHex(look.ready ? WHITE : PALE);
    }
    this.aimMesh.visible = look.ready && look.aimS !== null && !falling;
    if (this.aimMesh.visible && look.aimS) {
      this.aimMesh.position.set(look.aimS.x, look.aimS.y + 0.04, look.aimS.z);
      this.aimMesh.scale.set(RING.outerRadius * 2, 1, RING.outerRadius * 2);
      (this.aimMesh.material as THREE.MeshBasicMaterial).color.setScalar(0.55);
    }

    if (!v.active || !v.S) {
      this.bolt.visible = this.ringMesh.visible = this.bits.visible = false;
      this.billboard = null;
      this.yawState.yaw = 0;
      return;
    }
    const S = v.S;
    // 雷（3 まい）
    this.bolt.visible = v.bolt.visible;
    if (v.bolt.visible) {
      const cell = boltCell(v.bolt.variant, v.bolt.frame, 0);
      const u = this.boltMat.uniforms;
      u.uCol!.value = cell.x / BOLT.cellW;
      u.uFlip!.value = cell.flip ? 1 : 0;
      this.orient(S, this.cam.position);
    }
    // 輪
    const r = v.ring;
    this.ringMesh.visible = r !== null;
    if (r) {
      this.ringMesh.position.set(S.x, S.y + RING.lift, S.z);
      const side = RING.plateSize * r.scale;
      this.ringMesh.scale.set(side, 1, side);
      const gw = THUNDER_ASSETS.ground.width;
      const gh = THUNDER_ASSETS.ground.height;
      this.ringMat.uniforms.uRect!.value.set(r.image === 'appear' ? 0 : 96 / gw, (gh - 96) / gh, 96 / gw, 96 / gh);
      this.ringMat.uniforms.uAlpha!.value = r.alpha;
    }
    // つぶ
    const t = v.F - 8;
    let any = false;
    if (v.sparks.alive > 0) {
      _q.copy(this.cam.quaternion);
      const list = this.timeline.sparkList;
      for (let i = 0; i < list.length; i++) {
        const s = list[i]!;
        const p = sparkAt(s, t);
        if (p.alpha <= 0) {
          _s.set(0, 0, 0);
        } else {
          any = true;
          _s.set(4 * PT, 4 * PT, 4 * PT);
        }
        _p.set(S.x + p.dx, S.y + 0.1 + p.dy, S.z + p.dz);
        _m.compose(_p, _q, _s);
        this.bits.setMatrixAt(i, _m);
        _c.setHex(s.tone === 0 ? WHITE : PALE).multiplyScalar(p.alpha);
        this.bits.setColorAt(i, _c);
        const shape = sparkShape(s, t);
        this.bitCell.setX(i, shape === 'plus' ? 0 : shape === 'y1' ? 1 : 2);
      }
      this.bits.instanceMatrix.needsUpdate = true;
      if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
      this.bitCell.needsUpdate = true;
    }
    this.bits.visible = any;
    this.center.set(S.x, S.y + GLOW.up, S.z);
  }

  private orient(S: Vec3, cam: Vec3): void {
    const bb = boltBillboard(S, cam, this.yawState);
    this.yawState.yaw = bb.yaw;
    this.billboard = bb;
    this.bolt.position.set(S.x, S.y - BOLT.drop, S.z);
    this.bolt.rotation.y = bb.yaw;
  }

  /**
   * 世界の 絵の 入れ物。出力の 設定を 画面と 同じ（sRGB・トーンマップ なし）に そろえる ので、
   * 世界の 材質の プログラムを 画面へ 描く 版と 共有できる（作りなおしの 約 500 ms が なくなる）。
   * three は 「XR の 入れ物」だけ 画面と 同じ 出力に する ので、その 印を 使う。色は 色空間を 変えない 8 ビット
   * （プログラムが 0〜1 の sRGB で 書く）。入れ物の 実体は 色空間 リニア で 作ってから 印を 付ける（SRGB8 に すると 二重に 変換される）。
   */
  private makeRt(renderer: THREE.WebGLRenderer, w: number, h: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h), samples: 0 });
    rt.texture.minFilter = rt.texture.magFilter = THREE.NearestFilter;
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    renderer.initRenderTarget(rt);
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    (rt as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    return rt;
  }

  private disposeRt(): void {
    this.rt?.dispose();
    this.rt?.depthTexture?.dispose();
    this.rt = null;
  }

  /**
   * 雷 B 自身の プログラム 4 つ（雷・輪・つぶ・うつす 板）を 読みこみ中に 作っておく。
   * 最初の 落雷の ひっかかりを 消す（遊んで いる 間には 止めない）。
   */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const hidden: THREE.Object3D[] = [];
    for (const o of [this.bolt, this.ringMesh, this.bits]) {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    }
    renderer.compile(this.fxScene, camera);
    renderer.compile(this.blitScene, this.blitCam);
    for (const o of hidden) o.visible = false;
    // 世界の 絵の 入れ物も 先に 確保（最初の 落雷で 作ると ひっかかる）。大きさが 変われば render で 作りなおす
    renderer.getDrawingBufferSize(_size);
    if (!this.rt) this.rt = this.makeRt(renderer, _size.x, _size.y);
  }

  /** 今 落雷の 見た目が あって、世界を 絵に 描く 道を 通る か */
  active(): boolean {
    return this.shown.active;
  }

  /**
   * 世界（雷 B を ふくまない）を 絵に 描き → 画面に うつす（まわりを 明るく・深さを 書きもどす）→ 雷 B を 重ねる。
   * 描画回数の ふえは うつす 1 + 雷 3。
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.getDrawingBufferSize(_size);
    if (!this.rt || this.rt.width !== _size.x || this.rt.height !== _size.y) {
      this.disposeRt();
      this.rt = this.makeRt(renderer, _size.x, _size.y);
    }
    const rt = this.rt;
    const info = renderer.info;
    const wasAuto = info.autoReset;
    info.autoReset = false;
    info.reset();
    const wasAutoClear = renderer.autoClear;

    // 1. 世界 → 絵 ＋ 深さ
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // 2. 画面に うつす（光を 足す・深さを 書きもどす）
    camera.updateMatrixWorld();
    const bu = this.blitMat.uniforms;
    bu.tColor!.value = rt.texture;
    bu.tDepth!.value = rt.depthTexture;
    (bu.uInvProj!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (bu.uCamWorld!.value as THREE.Matrix4).copy(camera.matrixWorld);
    bu.uAmount!.value = this.shown.amount;
    renderer.render(this.blitScene, this.blitCam);

    // 3. 雷 B（深さを 読む）
    this.depthU.uDepth.value = rt.depthTexture;
    this.depthU.uRes.value.set(_size.x, _size.y);
    this.depthU.uNearFar.value.set(camera.near, camera.far);
    renderer.autoClear = false;
    renderer.render(this.fxScene, camera);
    renderer.autoClear = wasAutoClear;
    info.autoReset = wasAuto;
  }

  /** テストの 窓口 */
  hook(game: { renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera }): ThunderHook {
    return {
      info: () => this.info(),
      refresh: (cam) => {
        const S = this.shown.S;
        if (S && this.shown.bolt.visible) this.orient(S, cam ?? this.cam.position);
      },
      project: (p) => {
        game.camera.updateMatrixWorld();
        _v.set(p.x, p.y, p.z).project(game.camera);
        const rect = game.renderer.domElement.getBoundingClientRect();
        const visible = _v.z >= -1 && _v.z <= 1 && Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1;
        return { x: rect.left + ((_v.x + 1) / 2) * rect.width, y: rect.top + ((1 - _v.y) / 2) * rect.height, visible };
      },
      programs: () => game.renderer.info.programs?.length ?? 0,
      textures: () => this.textures(),
    };
  }

  private info(): ThunderInfo {
    const v = this.shown;
    const on = v.active && v.S !== null;
    const S = on ? { ...v.S! } : null;
    const bb = this.billboard;
    const front = bb ? { x: Math.sin(bb.yaw), y: 0, z: Math.cos(bb.yaw) } : { x: 0, y: 0, z: 1 };
    const layers: ThunderLayerInfo[] = [0, 1, 2].map((i) => ({
      layer: i as 0 | 1 | 2,
      visible: on && v.bolt.visible,
      center: bb ? { ...bb.layers[i]!.center } : { x: 0, y: 0, z: 0 },
      normal: { ...front },
      up: { ...UP },
      width: BOLT.width,
      height: BOLT.height,
    }));
    const r = on ? v.ring : null;
    return {
      F: on ? v.F : 0,
      S,
      bolt: { visible: on && v.bolt.visible, frame: on ? v.bolt.frame : -1, variant: v.bolt.variant, flipped: on && v.bolt.flipped, layers },
      ring: {
        visible: r !== null,
        scale: r ? r.scale : 0,
        radius: r ? r.radius : 0,
        alpha: r ? r.alpha : 0,
        y: S ? S.y + RING.lift : 0,
        normal: { ...UP },
        image: r ? r.image : null,
      },
      sparks: { visible: on && v.sparks.alive > 0, alive: on ? v.sparks.alive : 0 },
      glow: {
        amount: on ? v.amount : 0,
        color: `#${GLOW.color.toString(16).toUpperCase().padStart(6, '0')}`,
        center: S ? { x: S.x, y: S.y + GLOW.up, z: S.z } : null,
        full: GLOW.full,
        zero: GLOW.zero,
        // 量の 入れ口は 「うつす 板の uAmount」の 1 つ。いつも ある（落雷の たびに 作らない）
        slots: 1,
      },
    };
  }

  private textures(): ThunderTexInfo[] {
    const one = (name: 'sheet' | 'ground' | 'spark', tex: THREE.Texture, mat: THREE.ShaderMaterial): ThunderTexInfo => {
      const a = THUNDER_ASSETS[name];
      const img = tex.image as { width?: number; height?: number } | null;
      return {
        name,
        file: a.file,
        width: img?.width || a.width,
        height: img?.height || a.height,
        magFilter: tex.magFilter === THREE.NearestFilter ? 'nearest' : 'linear',
        minFilter: tex.minFilter === THREE.NearestFilter ? 'nearest' : 'linear',
        mipmaps: tex.generateMipmaps,
        colorSpace: tex.colorSpace === THREE.SRGBColorSpace ? 'srgb' : 'linear',
        blending: mat.blending === THREE.AdditiveBlending ? 'additive' : 'normal',
        depthWrite: mat.depthWrite,
        depthTest: mat.depthTest,
      };
    };
    return [one('sheet', this.sheet, this.boltMat), one('ground', this.ringTex, this.ringMat), one('spark', this.sparkTex, this.bitMat)];
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const t of [this.sheet, this.ringTex, this.sparkTex, this.glowTex, this.aimTex]) t.dispose();
    this.disposeRt();
    for (const root of [this.group, this.fxScene, this.blitScene]) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
      });
    }
    this.bits.dispose();
  }
}
