/**
 * #293 試作: 攻撃 5「自分に 落雷」の 見た目。動きは gashaBigThunder.ts。
 *  ・雷 = 雷神剣の 絵（thunder_b_sheet.png。ドット絵の 板 3 まいを カメラに 向ける）を 同時に たくさん 出せる ように 1 つの InstancedMesh で（既存の ThunderFx は 1 本ぶんの 作り）。
 *  ・落ちた 所の わ = 雷神剣の 地面の わ（thunder_b_ground.png）。落ちる 前の 予告 = 縮んでくる ドット絵の わ。
 *  ・空 = 雷雲の 層（カメラの 上を ついてくる ドット絵の 雲）＋ 画面を 暗くする うすい 幕 ＋ 遠くの 光。画面が ない（ユニットテスト）ときは 作らない。
 *  ・体の 電気 = 体の 箱の 面に 浮かせた 青白い 板（ドット絵の ひび割れ 4 種）。毎 flickerSec で 場所と 形を 引きなおす（シード付き）。
 *  ・毎コマ new しない。数は gashaBigTuning.ts の thunder。
 */
import {
  AdditiveBlending, CanvasTexture, DataTexture, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, NearestFilter, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace, ShaderMaterial, Sprite, SpriteMaterial, Texture, TextureLoader, Vector3, Color, Mesh, type BufferGeometry, type Camera, type Material, type Scene,
} from 'three';
import { BOLT, RING, THUNDER_ASSETS, boltBillboard, boltCell, boltFrameOf, landingRing } from '../legend/thunderModel';
import { TUNE as T } from './gashaBigTuning';
import { mulberry } from './gashaBigEruption';

const hasDom = (): boolean => typeof document !== 'undefined';
const blank = (): DataTexture => { const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); t.needsUpdate = true; return t; };
const BASE = './models/fx/';

function loadPixel(file: string): Texture {
  if (!hasDom()) return blank();
  const t = new TextureLoader().load(`${BASE}${file}`);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.generateMipmaps = false; t.colorSpace = SRGBColorSpace;
  return t;
}

/** 青白い 光の 玉（指の 光） */
function glowTex(): Texture {
  if (!hasDom()) return blank();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(170,215,255,0.8)'); rg.addColorStop(1, 'rgba(80,140,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

/** 予告の わ（ドット絵の まる。64 x 64） */
function warnTex(): Texture {
  if (!hasDom()) return blank();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x - 31.5, y - 31.5);
    if (d >= 28 && d < 31) { g.fillStyle = 'rgb(190,225,255)'; g.fillRect(x, y, 1, 1); }
    else if (d >= 25 && d < 28 && ((x >> 2) + (y >> 2)) % 2 === 0) { g.fillStyle = 'rgba(110,170,255,0.8)'; g.fillRect(x, y, 1, 1); }
    else if (d < 25 && d >= 21 && ((x >> 1) + (y >> 1)) % 3 === 0) { g.fillStyle = 'rgba(90,150,255,0.45)'; g.fillRect(x, y, 1, 1); }
    else if (Math.abs(x - 31.5) < 1.6 && Math.abs(y - 31.5) < 5 || Math.abs(y - 31.5) < 1.6 && Math.abs(x - 31.5) < 5) { g.fillStyle = 'rgb(235,246,255)'; g.fillRect(x, y, 1, 1); }
  }
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.generateMipmaps = false;
  return t;
}

/** 体の 電気の 絵 4 種（16 x 16 を 横に 4 つ。ざらっと 大きな ドット）: ひび割れの ように はしる 青白い 線 */
function arcAtlas(): Texture {
  if (!hasDom()) return blank();
  const N = 16;
  const c = document.createElement('canvas'); c.width = N * 4; c.height = N;
  const g = c.getContext('2d')!;
  const r = mulberry(5201);
  for (let k = 0; k < 4; k++) {
    const ox = k * N, vertical = k % 2 === 1;
    g.fillStyle = 'rgba(70,130,255,0.22)'; g.fillRect(ox, 0, N, N);
    const px = (a: number, b: number, col: string): void => { g.fillStyle = col; if (vertical) g.fillRect(ox + b, a, 1, 1); else g.fillRect(ox + a, b, 1, 1); };
    const bolt = (y0: number, a0: number, a1: number, spread: number, slope: number): void => {
      let y = y0;
      for (let a = a0; a !== a1; a += a1 > a0 ? 1 : -1) {
        y += (r() - 0.5) * spread + slope;
        const yy = Math.max(1, Math.min(N - 2, Math.round(y)));
        px(a, yy - 1, 'rgba(90,170,255,0.9)'); px(a, yy + 1, 'rgba(90,170,255,0.9)'); px(a, yy, 'rgb(240,250,255)');
      }
    };
    bolt(3 + Math.floor(r() * 10), 0, N, 3.2, 0);
    bolt(3 + Math.floor(r() * 10), N - 1, 0, 2.8, 0);
    const bx = 2 + Math.floor(r() * 8);
    bolt(6 + Math.floor(r() * 4), bx, Math.min(N - 1, bx + 6), 2.0, r() < 0.5 ? 1 : -1);
  }
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.generateMipmaps = false;
  return t;
}

/** 雷雲の 層の 絵（ドット絵の もこもこ。白 → 色は 材料で かける） */
function cloudTex(): Texture {
  if (!hasDom()) return blank();
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = mulberry(88);
  const N = 8, grid: number[] = [];
  for (let i = 0; i < N * N; i++) grid.push(r());
  const at = (x: number, y: number): number => grid[((y % N) + N) % N * N + (((x % N) + N) % N)]!;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const fx = x / 8, fy = y / 8, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    const n = (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v;
    const a = Math.max(0, Math.min(1, (n - 0.3) / 0.35));
    const q = Math.round(a * 4) / 4; // 4 だんかい（ドット絵）
    if (q > 0) { g.fillStyle = `rgba(255,255,255,${q})`; g.fillRect(x, y, 1, 1); }
  }
  const t = new CanvasTexture(c);
  t.magFilter = NearestFilter; t.minFilter = NearestFilter; t.wrapS = t.wrapT = RepeatWrapping; t.generateMipmaps = false;
  t.repeat.set(26, 26);
  return t;
}

const DECK_VERT = `
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv * 26.0;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const DECK_FRAG = `
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uCam;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vec4 c = texture2D(uTex, vUv);
  float d = distance(vW.xz, uCam.xz);
  float fade = 1.0 - smoothstep(110.0, 260.0, d);
  gl_FragColor = vec4(uColor, c.a * uOpacity * fade);
  #include <colorspace_fragment>
}`;
const BOLT_VERT = `
attribute vec3 aCell;
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
varying vec3 vCell;
void main() {
  vUv = uv; vA = aAlpha; vCell = aCell;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const BOLT_FRAG = `
uniform sampler2D uSheet;
varying vec2 vUv;
varying float vA;
varying vec3 vCell;
void main() {
  vec2 lu = vUv;
  if (vCell.z > 0.5) lu.x = 1.0 - lu.x;
  vec2 st = vec2((vCell.x + lu.x * ${BOLT.cellW}.0) / ${BOLT.sheetW}.0, 1.0 - (vCell.y + (1.0 - lu.y) * ${BOLT.cellH}.0) / ${BOLT.sheetH}.0);
  vec4 c = texture2D(uSheet, st);
  gl_FragColor = vec4(c.rgb, c.a * vA);
  #include <colorspace_fragment>
}`;
const RING_VERT = `
attribute vec4 aRect;
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = aRect.xy + uv * aRect.zw; vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const RING_FRAG = `
uniform sampler2D uTex;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb, c.a * vA);
  #include <colorspace_fragment>
}`;
const ARC_VERT = `
attribute float aCell;
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = vec2((aCell + uv.x) / 4.0, uv.y); vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const ARC_FRAG = `
uniform sampler2D uTex;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 c = texture2D(uTex, vUv);
  gl_FragColor = vec4(c.rgb, c.a * vA);
  #include <colorspace_fragment>
}`;

export interface BoltView { x: number; y: number; z: number; /** 雷の 絵が はじまって からの 秒 */ age: number; variant: number; scale: number }
export interface RingView { x: number; y: number; z: number; /** 着いてから の 秒 */ age: number; radius: number }
export interface WarnView { x: number; y: number; z: number; warn: number; radius: number }
export interface ArcBox { c: ArrayLike<number>; ax: ArrayLike<number>; half: ArrayLike<number> }

export class ThunderFx {
  private readonly root = new Group();
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private readonly texs: Texture[] = [];
  private readonly boltMesh: InstancedMesh;
  private readonly boltCellA: InstancedBufferAttribute;
  private readonly boltAlpha: InstancedBufferAttribute;
  private readonly ringMesh: InstancedMesh;
  private readonly ringRect: InstancedBufferAttribute;
  private readonly ringAlpha: InstancedBufferAttribute;
  private readonly warnMesh: InstancedMesh;
  private readonly arcMesh: InstancedMesh;
  private readonly arcCell: InstancedBufferAttribute;
  private readonly arcAlpha: InstancedBufferAttribute;
  private readonly glow: Sprite;
  private readonly deckMat: ShaderMaterial | null;
  private readonly deckTex: Texture;
  private shade: HTMLDivElement | null = null;
  private flashEl: HTMLDivElement | null = null;
  private lastShade = -1;
  private lastFlash = -1;
  private cloud = 0;
  private flash = 0;
  private reduced = false;
  private boxes: readonly ArcBox[] = [];
  private level = 0;
  private reroll = 0;
  private clock = 0;
  private readonly rnd = mulberry(7001);
  private readonly m = new Matrix4();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly n = new Vector3();
  private readonly pos = new Vector3();
  private readonly col = new Color();
  private readonly counts_ = { bolts: 0, rings: 0, warns: 0, arcs: 0, cloud: 0, flash: 0, glow: false };

  constructor(private readonly scene: Scene, private readonly camera: Camera) {
    const K = T.thunder;
    this.root.name = 'gashaThunderFx';
    // 雷
    const sheet = loadPixel(THUNDER_ASSETS.sheet.file), ground = loadPixel(THUNDER_ASSETS.ground.file);
    this.texs.push(sheet, ground);
    const bolt = new PlaneGeometry(BOLT.width, BOLT.height); bolt.translate(0, BOLT.height / 2, 0);
    this.geos.push(bolt);
    const maxB = K.maxBolts * BOLT.layers;
    this.boltCellA = new InstancedBufferAttribute(new Float32Array(maxB * 3), 3);
    this.boltAlpha = new InstancedBufferAttribute(new Float32Array(maxB), 1);
    bolt.setAttribute('aCell', this.boltCellA); bolt.setAttribute('aAlpha', this.boltAlpha);
    const boltMat = new ShaderMaterial({ uniforms: { uSheet: { value: sheet } }, vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG, transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: true, side: DoubleSide });
    this.mats.push(boltMat);
    this.boltMesh = new InstancedMesh(bolt, boltMat, maxB);
    this.boltMesh.frustumCulled = false; this.boltMesh.count = 0; this.boltMesh.renderOrder = 8;
    // 落ちた 所の わ
    const flat = new PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.geos.push(flat);
    const maxR = K.around.maxActive + 2;
    this.ringRect = new InstancedBufferAttribute(new Float32Array(maxR * 4), 4);
    this.ringAlpha = new InstancedBufferAttribute(new Float32Array(maxR), 1);
    const ringGeo = flat.clone(); this.geos.push(ringGeo);
    ringGeo.setAttribute('aRect', this.ringRect); ringGeo.setAttribute('aAlpha', this.ringAlpha);
    const ringMat = new ShaderMaterial({ uniforms: { uTex: { value: ground } }, vertexShader: RING_VERT, fragmentShader: RING_FRAG, transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: true, side: DoubleSide });
    this.mats.push(ringMat);
    this.ringMesh = new InstancedMesh(ringGeo, ringMat, maxR);
    this.ringMesh.frustumCulled = false; this.ringMesh.count = 0; this.ringMesh.renderOrder = 4;
    // 予告の わ
    const wt = warnTex(); this.texs.push(wt);
    const warnMat = new MeshBasicMaterial({ map: wt, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.push(warnMat);
    this.warnMesh = new InstancedMesh(flat, warnMat, maxR);
    this.warnMesh.frustumCulled = false; this.warnMesh.count = 0; this.warnMesh.renderOrder = 3;
    this.warnMesh.setColorAt(0, this.col.setRGB(1, 1, 1));
    // 体の 電気
    const at = arcAtlas(); this.texs.push(at);
    const quad = new PlaneGeometry(1, 1); this.geos.push(quad);
    this.arcCell = new InstancedBufferAttribute(new Float32Array(K.body.arcs), 1);
    this.arcAlpha = new InstancedBufferAttribute(new Float32Array(K.body.arcs), 1);
    quad.setAttribute('aCell', this.arcCell); quad.setAttribute('aAlpha', this.arcAlpha);
    const arcMat = new ShaderMaterial({ uniforms: { uTex: { value: at } }, vertexShader: ARC_VERT, fragmentShader: ARC_FRAG, transparent: true, blending: AdditiveBlending, depthWrite: false, depthTest: false, side: DoubleSide });
    this.mats.push(arcMat);
    this.arcMesh = new InstancedMesh(quad, arcMat, K.body.arcs);
    this.arcMesh.frustumCulled = false; this.arcMesh.count = 0; this.arcMesh.renderOrder = 9;
    // 指の 光
    const gt = glowTex(); this.texs.push(gt);
    const gm = new SpriteMaterial({ map: gt, blending: AdditiveBlending, transparent: true, depthWrite: false, fog: false });
    this.mats.push(gm);
    this.glow = new Sprite(gm); this.glow.visible = false; this.glow.renderOrder = 10;
    // 雷雲の 層（カメラの 上を ついてくる 大きな 板）
    this.deckTex = cloudTex(); this.texs.push(this.deckTex);
    if (hasDom()) {
      this.deckMat = new ShaderMaterial({
        uniforms: { uTex: { value: this.deckTex }, uColor: { value: new Color(0x303a52) }, uOpacity: { value: 0 }, uCam: { value: new Vector3() } },
        vertexShader: DECK_VERT, fragmentShader: DECK_FRAG, transparent: true, depthWrite: false, side: DoubleSide,
      });
      this.mats.push(this.deckMat);
      const deckGeo = new PlaneGeometry(1400, 1400); deckGeo.rotateX(-Math.PI / 2); this.geos.push(deckGeo);
      this.deckMesh = new Mesh(deckGeo, this.deckMat);
      this.deckMesh.frustumCulled = false; this.deckMesh.visible = false; this.deckMesh.renderOrder = -1;
      this.root.add(this.deckMesh);
      this.shade = document.createElement('div');
      this.shade.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2;opacity:0;background:linear-gradient(to bottom,rgba(8,12,30,0.78) 0%,rgba(16,22,48,0.5) 55%,rgba(18,24,44,0.34) 100%)';
      this.flashEl = document.createElement('div');
      this.flashEl.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:2;opacity:0;background:rgb(214,228,255)';
      document.body.append(this.shade, this.flashEl);
    } else this.deckMat = null;
    this.root.add(this.boltMesh, this.ringMesh, this.warnMesh, this.arcMesh, this.glow);
    scene.add(this.root);
  }
  private deckMesh: Mesh | null = null;

  private rand(): number { return this.rnd(); }

  /** 空: cloud = 雲の 暗さ 0〜1、flash = 遠くの 光 0〜1、reduced = うごきを へらす（光を 弱く） */
  setSky(cloud: number, flash: number, reduced: boolean): void {
    this.cloud = cloud; this.flash = flash; this.reduced = reduced;
  }

  /** 指の 光（pos が null で 消す）。glow 0〜1 */
  setFinger(pos: { x: number; y: number; z: number } | null, glow: number): void {
    if (!pos || glow <= 0.01) { this.glow.visible = false; this.counts_.glow = false; return; }
    this.glow.visible = true; this.counts_.glow = true;
    this.glow.position.set(pos.x, pos.y, pos.z);
    const sz = 2.5 + 7 * glow * (0.9 + 0.1 * Math.sin(this.clock * 30));
    this.glow.scale.set(sz, sz, 1);
    (this.glow.material as SpriteMaterial).opacity = Math.min(1, 0.25 + glow);
  }

  /** 落ちている 雷の 絵。同時に maxBolts まで */
  setBolts(views: readonly BoltView[]): void {
    const max = T.thunder.maxBolts;
    let k = 0;
    const cam = this.camera.position;
    for (const v of views) {
      if (k >= max) break;
      const F = Math.floor(v.age * 60 + 1e-6) + 1, frame = boltFrameOf(F);
      if (frame < 0) continue;
      const bb = boltBillboard({ x: v.x, y: v.y, z: v.z }, { x: cam.x, y: cam.y, z: cam.z }, null);
      for (const l of bb.layers) {
        const i = k * BOLT.layers + l.layer, cell = boltCell(v.variant, frame, l.layer);
        this.m.makeRotationY(bb.yaw).scale(this.a.set(v.scale, v.scale, v.scale)).setPosition(l.center.x, l.center.y, l.center.z);
        this.boltMesh.setMatrixAt(i, this.m);
        this.boltCellA.setXYZ(i, cell.x, cell.y, cell.flip ? 1 : 0);
        this.boltAlpha.setX(i, 1);
      }
      k++;
    }
    this.boltMesh.count = k * BOLT.layers;
    this.boltMesh.instanceMatrix.needsUpdate = true; this.boltCellA.needsUpdate = true; this.boltAlpha.needsUpdate = true;
    this.counts_.bolts = k;
  }

  /** 落ちた 所の わ（雷神剣の 地面の わ） */
  setRings(views: readonly RingView[]): void {
    const gw = THUNDER_ASSETS.ground.width, gh = THUNDER_ASSETS.ground.height;
    let k = 0;
    for (const v of views) {
      if (k >= this.ringMesh.instanceMatrix.count) break;
      const r = landingRing(Math.floor(v.age * 60 + 1e-6) + RING.fromF);
      if (!r) continue;
      const size = RING.plateSize * r.scale * (v.radius / RING.outerRadius);
      this.m.makeScale(size, 1, size).setPosition(v.x, v.y + RING.lift + 0.05, v.z);
      this.ringMesh.setMatrixAt(k, this.m);
      this.ringRect.setXYZW(k, r.image === 'appear' ? 0 : 96 / gw, (gh - 96) / gh, 96 / gw, 96 / gh);
      this.ringAlpha.setX(k, r.alpha);
      k++;
    }
    this.ringMesh.count = k;
    this.ringMesh.instanceMatrix.needsUpdate = true; this.ringRect.needsUpdate = true; this.ringAlpha.needsUpdate = true;
    this.counts_.rings = k;
  }

  /** 落ちる 前の 予告の わ（ちぢんで くる） */
  setWarns(views: readonly WarnView[]): void {
    let k = 0;
    for (const v of views) {
      if (k >= this.warnMesh.instanceMatrix.count) break;
      const size = v.radius * 2 * (1.5 - 0.5 * v.warn);
      this.m.makeScale(size, 1, size).setPosition(v.x, v.y + 0.06, v.z);
      this.warnMesh.setMatrixAt(k, this.m);
      const br = 0.2 + 0.8 * v.warn;
      this.warnMesh.setColorAt(k, this.col.setRGB(br, br, br));
      k++;
    }
    this.warnMesh.count = k;
    this.warnMesh.instanceMatrix.needsUpdate = true;
    if (this.warnMesh.instanceColor) this.warnMesh.instanceColor.needsUpdate = true;
    this.counts_.warns = k;
  }

  /** 体の 電気: 箱の リストと 強さ（0 で 消える） */
  setElectric(boxes: readonly ArcBox[], level: number): void {
    this.boxes = boxes; this.level = level;
    if (level <= 0.01) { this.arcMesh.count = 0; this.counts_.arcs = 0; }
  }

  private rollArcs(): void {
    const K = T.thunder.body, boxes = this.boxes, max = K.arcs;
    let k = 0;
    const want = Math.min(max, Math.round(Math.min(max, boxes.length * 4) * (0.35 + 0.65 * this.level)));
    for (let tries = 0; k < want && tries < want * 3 && boxes.length; tries++) {
      const bx = boxes[Math.floor(this.rand() * boxes.length)]!;
      const face = Math.floor(this.rand() * 3), sign = this.rand() < 0.5 ? -1 : 1;
      const ia = (face + 1) % 3, ib = (face + 2) % 3;
      const ha = bx.half[ia]!, hb = bx.half[ib]!, hn = bx.half[face]!;
      if (Math.min(ha, hb) < 0.3 && Math.max(ha, hb) < 1.2) continue; // 小さすぎる 箱は とばす
      this.a.set(bx.ax[ia * 3]!, bx.ax[ia * 3 + 1]!, bx.ax[ia * 3 + 2]!);
      this.b.set(bx.ax[ib * 3]!, bx.ax[ib * 3 + 1]!, bx.ax[ib * 3 + 2]!);
      this.n.set(bx.ax[face * 3]!, bx.ax[face * 3 + 1]!, bx.ax[face * 3 + 2]!).multiplyScalar(sign);
      const off = hn + K.faceOffset;
      if (this.n.x * (this.camera.position.x - bx.c[0]!) + this.n.y * (this.camera.position.y - bx.c[1]!) + this.n.z * (this.camera.position.z - bx.c[2]!) <= 0) continue; // カメラと 反対の 面は 出さない
      this.pos.set(bx.c[0]! + this.n.x * off, bx.c[1]! + this.n.y * off, bx.c[2]! + this.n.z * off);
      const sa = Math.max(0.2, ha * 2), sb = Math.max(0.2, hb * 2);
      this.a.multiplyScalar(sa); this.b.multiplyScalar(sb);
      this.m.makeBasis(this.a, this.b, this.n).setPosition(this.pos);
      this.arcMesh.setMatrixAt(k, this.m);
      this.arcCell.setX(k, Math.floor(this.rand() * 4));
      this.arcAlpha.setX(k, (0.8 + 0.2 * this.rand()) * Math.min(1, this.level * 1.2));
      k++;
    }
    this.arcMesh.count = k;
    this.arcMesh.instanceMatrix.needsUpdate = true; this.arcCell.needsUpdate = true; this.arcAlpha.needsUpdate = true;
    this.counts_.arcs = k;
  }

  update(dt: number): void {
    this.clock += dt;
    const K = T.thunder;
    if (this.level > 0.01 && this.boxes.length) {
      this.reroll -= dt;
      if (this.reroll <= 0) { this.reroll = K.body.flickerSec; this.rollArcs(); }
    }
    // 空
    const cam = this.camera.position;
    const dark = this.cloud * K.cloudDark;
    if (this.deckMat && this.deckMesh) {
      const on = this.cloud > 0.01;
      this.deckMesh.visible = on;
      if (on) {
        const u = this.deckMat.uniforms;
        u.uOpacity!.value = Math.min(0.95, this.cloud * 0.95);
        (u.uColor!.value as Color).setHex(0x303a52).lerp(this.col.setHex(0xa4b4d8), Math.min(1, this.flash * (this.reduced ? 0.4 : 1)));
        (u.uCam!.value as Vector3).copy(cam);
        this.deckMesh.position.set(cam.x, cam.y + K.cloudHeight, cam.z);
        this.deckTex.offset.set((this.clock * 0.004) % 1, (this.clock * 0.0015) % 1);
      }
    }
    const shadeV = Math.round(dark * 100) / 100;
    if (this.shade && shadeV !== this.lastShade) { this.lastShade = shadeV; this.shade.style.opacity = String(shadeV); }
    const fl = Math.round(this.flash * K.flashAlpha * (this.reduced ? 0.35 : 1) * 100) / 100;
    if (this.flashEl && fl !== this.lastFlash) { this.lastFlash = fl; this.flashEl.style.opacity = String(fl); }
    this.counts_.cloud = this.cloud; this.counts_.flash = this.flash;
  }

  counts(): { bolts: number; rings: number; warns: number; arcs: number; cloud: number; flash: number; glow: boolean } { return { ...this.counts_ }; }

  /** ぜんぶ 消す（体が 作りなおされた とき） */
  clear(): void {
    this.setBolts([]); this.setRings([]); this.setWarns([]); this.setElectric([], 0); this.setFinger(null, 0); this.setSky(0, 0, false);
    this.update(0);
  }

  dispose(): void {
    this.scene.remove(this.root);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.shade?.remove(); this.flashEl?.remove();
  }
}
