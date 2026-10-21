import * as THREE from 'three';
import ribbon from './fujinSpiralRibbon.json';
import type { SpiralEvent, WaveView } from '../legend/WaveSystem';
import type { SpiralDebris } from '../legend/spiralDebris';
import { DotPoints } from './dotPoints';

/**
 * WEAPON-8 §3.1: らせんの かぜ（S2「すける らせんの おび」）の 見た目。素材 `public/models/fx/fujin_spiral_ribbon.{png,json}`。
 * - ねじれた 帯 2 本（96 三角形）＋ 回りの すじ 4 本（32）を 1 つの メッシュに まとめ、1 回で 描く（両面。表・裏は 絵を えらぶ）。
 *   アルファは 絵に 入って いる（表 0.5・裏 0.3・すじ 0.6 / 0.3・ふち・しま・頭は 不透明）。
 * - 先の 光（カメラに 向く 板）も 同じ メッシュの 中の 4 点（頂点シェーダーで カメラに 向ける）。地面の 土と 草の つぶ（Points 48）は べつ。
 *   描画 2・三角形 130・点 48 以下（描画の 上限 4 に 余裕を もたせる）。
 * - 大きさ・明るさの 区間（出る → のびる → 決め → とぶ → ほどける）は 見た目だけ。位置は 当たりの P(a)。
 * - 「動きを減らす」: 回らない（`spin` が 0）・土と 草の つぶは 出ない（土けむりだけ）。点滅しない。
 */
const BASE = './models/fx/';
const TEX = { w: 128, h: 32 };
const GAME_RADIUS = 1.25;
export const UNWIND_STEPS = 6;
const SIZE_BY_AGE = (a: number): number => (a < 2 ? 0.35 : a < 4 ? 0.75 : 1);
const KEY_FROM = 4;
const KEY_TO = 9;
const FRONT_KEY_ROW = 18;
const BACK_ROW = 9;

const GROUND_PALETTES: readonly (readonly string[])[] = [
  ribbon.ground.palettes.grass,
  ribbon.ground.palettes.dirt,
  ribbon.ground.palettes.stone,
  ribbon.ground.palettes.sand,
];

const VERT = `
attribute vec2 aDot;
attribute float aKind;
attribute vec2 aCorner;
uniform float uTipSize;
varying vec2 vDot;
varying float vKind;
void main() {
  vDot = aDot;
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // 先の 光（kind 2）: 中心だけ 帯と いっしょに うごかし、板は カメラに 向ける
  if (aKind > 1.5) mv.xy += aCorner * uTipSize;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex;
uniform float uFrontRow;
uniform float uFade;
uniform float uArcs;
uniform vec4 uTipRect;
uniform float uTipOn;
varying vec2 vDot;
varying float vKind;
void main() {
  if (vKind > 1.5) {
    if (uTipOn < 0.5) discard;
    vec2 tp = floor(vec2(uTipRect.x + vDot.x * uTipRect.z, uTipRect.y + (1.0 - vDot.y) * uTipRect.w));
    vec4 tc = texture2D(uTex, (tp + 0.5) / vec2(${TEX.w}.0, ${TEX.h}.0));
    if (tc.a < 0.01) discard;
    gl_FragColor = tc;
    #include <colorspace_fragment>
    return;
  }
  float row = vDot.y;
  if (vKind < 0.5) row = clamp(vDot.y, 0.0, 8.9) + (gl_FrontFacing ? uFrontRow : ${BACK_ROW}.0);
  else if (uArcs < 0.5) discard;
  vec4 c = texture2D(uTex, vec2(vDot.x, row) / vec2(${TEX.w}.0, ${TEX.h}.0));
  if (c.a < 0.01) discard;
  if (uFade > 0.0 && mod(floor(vDot.x) + floor(row), 4.0) < floor(uFade * 3.0)) discard;
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;
function buildGeometry(): THREE.BufferGeometry {
  const rv = ribbon.mesh.vertices as number[][];
  const av = ribbon.arcs.vertices as number[][];
  const pos: number[] = [];
  const dot: number[] = [];
  const kind: number[] = [];
  for (const v of rv) {
    pos.push(v[0]!, v[1]!, v[2]!);
    dot.push(v[3]!, v[4]!);
    kind.push(0);
  }
  for (const v of av) {
    pos.push(v[0]!, v[1]!, v[2]!);
    dot.push(v[3]!, v[4]!);
    kind.push(1);
  }
  // 先の 光の 板（中心 = 帯の 頭。四隅は 頂点シェーダーで カメラの 向きに ひろげる）
  const corner: number[] = new Array((rv.length + av.length) * 2).fill(0);
  const tipBase = rv.length + av.length;
  for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]] as const) {
    pos.push(0, 0, 0);
    dot.push(cx + 0.5, cy + 0.5);
    kind.push(2);
    corner.push(cx, cy);
  }
  const idx: number[] = [];
  for (const t of ribbon.mesh.triangles as number[][]) idx.push(t[0]!, t[1]!, t[2]!);
  for (const t of ribbon.arcs.triangles as number[][]) idx.push(t[0]! + rv.length, t[1]! + rv.length, t[2]! + rv.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDot', new THREE.Float32BufferAttribute(dot, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  idx.push(tipBase, tipBase + 1, tipBase + 2, tipBase, tipBase + 2, tipBase + 3);
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setIndex(idx);
  return g;
}

export interface SpiralFxDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  basePath?: string;
}

export class SpiralFx {
  private readonly root = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly dots = new DotPoints(48);
  private readonly colors: THREE.Color[][] = GROUND_PALETTES.map((p) => p.map((c) => new THREE.Color(c)));
  private readonly tex: THREE.Texture;
  private readonly geo: THREE.BufferGeometry;
  /** ほどける 進み（-1 = ほどけて いない） */
  private unwind = -1;
  private last = { pos: new THREE.Vector3(), yaw: 0, spin: 0 };

  constructor(deps: SpiralFxDeps) {
    this.tex = new THREE.TextureLoader().load(`${deps.basePath ?? BASE}${ribbon.texture}`);
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.flipY = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.geo = buildGeometry();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: this.tex }, uFrontRow: { value: 0 }, uFade: { value: 0 }, uArcs: { value: 0 }, uTipRect: { value: new THREE.Vector4(0, 27, 3, 3) }, uTipOn: { value: 0 }, uTipSize: { value: 0.2 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    this.body = new THREE.Mesh(this.geo, this.mat);
    this.body.frustumCulled = false;
    this.body.renderOrder = 10;
    this.spin.add(this.body);
    this.root.add(this.spin);
    this.root.visible = false;
    deps.scene.add(this.root);

    deps.scene.add(this.dots.points);
  }

  /** `legend` の 出来事（毎ステップ 1 回）。とどいて 終わったら ほどける */
  onEvent(e: { type: string }): void {
    if (e.type === 'spiralStart') this.unwind = -1;
    if (e.type !== 'spiralEnd') return;
    const se = e as SpiralEvent & { type: 'spiralEnd' };
    if (se.reason === 'range') {
      this.unwind = 0;
      this.last.pos.set(se.position.x, se.position.y, se.position.z);
    } else this.unwind = -1;
  }

  /** 1 ステップに 1 回。row = 今 とんでいる らせん（なければ undefined）、debris = 土と 草の つぶ */
  step(row: WaveView | undefined, debris: SpiralDebris): void {
    let a = 0;
    let fade = 0;
    if (row) {
      a = row.age;
      this.last.pos.set(row.position.x, row.position.y, row.position.z);
      this.last.yaw = Math.atan2(-row.dir.z, row.dir.x);
      this.last.spin = row.spin;
      this.unwind = -1;
    } else if (this.unwind >= 0 && this.unwind < UNWIND_STEPS) {
      a = 99;
      fade = this.unwind < 3 ? 0.4 : 0.8;
      this.unwind += 1;
    } else {
      this.unwind = -1;
      this.root.visible = false;
      this.syncDebris(debris);
      return;
    }
    const s = SIZE_BY_AGE(a);
    this.root.visible = true;
    this.root.position.copy(this.last.pos);
    this.root.rotation.set(0, this.last.yaw, 0);
    this.root.scale.set(s, s * (1 + 0.5 * fade) * GAME_RADIUS, s * (1 + 0.5 * fade) * GAME_RADIUS);
    this.spin.rotation.x = (this.last.spin * Math.PI) / 180;
    const key = a >= KEY_FROM && a <= KEY_TO;
    const u = this.mat.uniforms;
    u.uFrontRow!.value = key ? FRONT_KEY_ROW : 0;
    u.uFade!.value = fade;
    u.uArcs!.value = a >= 2 ? 1 : 0;
    // 先の 光（とんでいる 間だけ。帯の 頭に ぴったり）
    u.uTipOn!.value = row ? 1 : 0;
    (u.uTipRect!.value as THREE.Vector4).set(key ? 4 : 0, 27, key ? 5 : 3, key ? 5 : 3);
    u.uTipSize!.value = ((key ? 5 : 3) / 16) * 2;
    this.syncDebris(debris);
  }

  private syncDebris(d: SpiralDebris): void {
    this.dots.reset();
    for (let i = 0; i < d.count; i++) {
      const pal = this.colors[d.kind[i]!]!;
      this.dots.add(d.px[i]!, d.py[i]!, d.pz[i]!, pal[d.tone[i]!]!, d.size[i]!, d.dither[i]! ? 2 : 0);
    }
    this.dots.done();
  }

  dispose(): void {
    this.root.removeFromParent();
    this.dots.points.removeFromParent();
    this.dots.dispose();
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
