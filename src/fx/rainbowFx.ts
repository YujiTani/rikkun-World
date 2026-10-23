import * as THREE from 'three';
import type { BladeTech, BladeTechFrames, Vec3 } from '../contracts';
import { TRAIL_K, pathPoint, timeToTau } from './bladeTrailModel';
import { spawnDelayOf, type SlashStep } from './nijiSlashModel';
import { DOT, FxBatch, FxView, hash, makePts, rgbOf } from './fxPaint';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * 虹 v4（2026-10-23 オーナー 07:05）: 白い 斬撃の 上の 層。「線の 粒」と「円の 粒」の 2 種類だけで 組む（図形は 描かない）。
 * 粒は 1 つ 単色（虹の 7 色から シード付き）。たくさん まざって 虹色に 見え、ブルームで 色が にじむ。
 * 刀身 = 刀身に そって 円の 粒が 流れ、細い 線の 粒。わざの 終わり = 中心から 線の 粒が はじけ 円の 粒が ふわっと 広がる
 * （つき 1・きりあげ 1・けさ 2。2 つ目は 場所・大きさ・時間を ずらす）。発光 = 虹だけに 効かせる ブルーム（半分の 解像度、
 * 虹が 出て いない 間は パスを 回さない）。シード付き・毎ステップ new しない。
 */
const SPEC = ['#FF1F3D', '#FF8A00', '#FFE600', '#00E060', '#00B4FF', '#2E5CFF', '#B030FF'].map(rgbOf);
/** エフェクトの 大きさ（オーナー 06:50: 今の 半分くらい） */
const K = 0.5;
const WINDOW: Record<BladeTech, number> = { thrust: 4, kiriage: 3, kesa: 6 };
const IDX: Record<BladeTech, number> = { thrust: 0, kiriage: 1, kesa: 2 };
const MAX_INST = 3;
const MAX_HIT = 8;
const FLARE_LIFE = 16;
/** ブルームの 強さ・半径・しきい値・足す 量（試作と 同じ） */
export const BLOOM = { strength: 0.35, radius: 0.2, threshold: 0.5, gain: 0.55 };

interface Inst {
  idx: number;
  tech: BladeTech;
  uDeg: number;
  startup: number;
  T: number;
  seed: number;
  active: boolean;
  pos: () => Vec3;
  /** フレアごとの 場所（出る とき 1 回 きめる） */
  fo: Float32Array;
  fSet: Uint8Array;
  perm: number[];
}
interface Hit {
  x: number;
  y: number;
  z: number;
  age: number;
  seed: number;
}

export interface RainbowRequest {
  tech: BladeTech;
  step: SlashStep;
  uDeg: number;
  pos: () => Vec3;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export class RainbowFx {
  private readonly view = new FxView();
  private readonly nrm: FxBatch;
  private readonly add: FxBatch;
  private readonly insts: Inst[] = [];
  private readonly hits: Hit[] = [];
  private seedN = 0;
  /** 動きを へらす 設定（粒の 数を 半分・ブルームを 弱めに） */
  private reducedNow = false;
  private readonly tmp: number[] = [0, 0, 0];
  private readonly tip = new Float32Array(3);
  private readonly base = new Float32Array(3);
  private readonly pts6 = makePts(6);
  // ブルーム
  private readonly bloom: RainbowBloom;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly lengths: (tech: BladeTech) => BladeTechFrames,
  ) {
    this.nrm = new FxBatch(scene, { additive: false, depthTest: false, renderOrder: 8, maxVerts: 60000 });
    this.add = new FxBatch(scene, { additive: true, depthTest: false, renderOrder: 9, maxVerts: 30000 });
    // ブルームの 「虹だけ」の 道は レイヤー 1 を 使う（本描きは レイヤー 0 と 1 を 描く）
    this.nrm.mesh.layers.enable(1);
    this.add.mesh.layers.enable(1);
    for (let i = 0; i < MAX_INST; i++) {
      this.insts.push({ idx: 0, tech: 'thrust', uDeg: 0, startup: 0, T: 0, seed: 0, active: false, pos: () => ({ x: 0, y: 0, z: 0 }), fo: makePts(4), fSet: new Uint8Array(4), perm: [0] });
    }
    this.bloom = new RainbowBloom();
  }

  /** 虹が 出ている（描画・ブルームを 回す 必要が ある）。形は step の 最後で きまる ので、その あと（描画の 前）に 読む */
  active(): boolean {
    return this.nrm.visible() || this.add.visible();
  }

  /** 世界を 描く（虹が 出て いる 間だけ ブルーム つき）。Game の worldPass から 呼ぶ */
  renderWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.render(scene, camera);
    this.bloom.apply(renderer, scene, camera, this.reducedNow);
  }

  /** 注文（techStart で 呼ぶ）。窓の はじまり = 白い 斬撃の 決めの コマ */
  queue(req: RainbowRequest): void {
    let s = this.insts.find((i) => !i.active);
    if (!s) s = this.insts.reduce((a, b) => (a.T > b.T ? a : b));
    s.active = true;
    s.idx = IDX[req.tech];
    s.tech = req.tech;
    s.uDeg = req.uDeg;
    s.startup = spawnDelayOf(req.tech, req.step) + 2;
    s.T = -s.startup;
    s.seed = ++this.seedN * 29;
    s.pos = req.pos;
    s.fSet.fill(0);
    s.perm = s.idx === 2 ? (hash(s.seed, 31) > 0.5 ? [0, 1] : [1, 0]) : [0];
  }

  cancel(): void {
    for (const i of this.insts) if (i.active && i.T < 0) i.active = false;
  }

  /** 当てた 妖怪の 胸に 虹色の 点（1 体ごとに 1 回） */
  hit(center: Vec3): void {
    if (this.hits.length >= MAX_HIT) this.hits.shift();
    this.hits.push({ x: center.x, y: center.y, z: center.z, age: 0, seed: ++this.seedN * 5 });
  }

  /** 1 ステップ ごと（カメラが 動いた あと） */
  step(reduced = false): void {
    this.reducedNow = reduced;
    this.view.update(this.camera);
    this.nrm.begin();
    this.add.begin();
    for (const s of this.insts) {
      if (!s.active) continue;
      this.draw(s);
      s.T++;
      if (s.T - WINDOW[s.tech] > 30) s.active = false;
    }
    for (let k = this.hits.length - 1; k >= 0; k--) {
      const h = this.hits[k]!;
      this.drawHit(h);
      if (++h.age >= 12) this.hits.splice(k, 1);
    }
    this.nrm.end();
    this.add.end();
  }

  private swordAt(s: Inst, f: number, which: 'tip' | 'base', out: Float32Array): void {
    const tau = timeToTau(s.tech, this.lengths(s.tech), f);
    pathPoint(s.tech, tau, which, this.tmp);
    const p = s.pos();
    const u = (s.uDeg * Math.PI) / 180;
    const r = this.tmp[0]! * TRAIL_K, up = this.tmp[1]! * TRAIL_K, fw = this.tmp[2]! * TRAIL_K;
    out[0] = p.x + r * Math.cos(u) + fw * Math.sin(u);
    out[1] = p.y + up;
    out[2] = p.z + r * Math.sin(u) - fw * Math.cos(u);
  }

  private cdx(a: number): number { return this.view.right.x * Math.cos(a) + this.view.up.x * Math.sin(a); }
  private cdy(a: number): number { return this.view.right.y * Math.cos(a) + this.view.up.y * Math.sin(a); }
  private cdz(a: number): number { return this.view.right.z * Math.cos(a) + this.view.up.z * Math.sin(a); }

  /** 粒の 色（虹の 7 色から シード付きで 1 つ。粒の 中は 単色） */
  private col(seed: number): readonly number[] {
    return SPEC[Math.min(6, Math.floor(hash(seed, 91) * 7))]!;
  }

  /** ①円の 粒（小さな 丸。単色） */
  private dot(x: number, y: number, z: number, r: number, a: number, seed: number): void {
    if (a <= 0.02) return;
    this.nrm.disc(this.view, x, y, z, Math.max(r, DOT * 1.2), this.col(seed), a, false, 6);
  }

  /** ②線の 粒（細く 短い 光の すじ。向き (dx,dy,dz) に のびる。単色） */
  private streak(x: number, y: number, z: number, dx: number, dy: number, dz: number, len: number, a: number, seed: number): void {
    if (a <= 0.02) return;
    const p = this.pts6;
    p[0] = x; p[1] = y; p[2] = z;
    p[3] = x + dx * len; p[4] = y + dy * len; p[5] = z + dz * len;
    this.nrm.band(this.view, p, 2, DOT * 1.3, 0, this.col(seed), a);
  }

  /** 刀身: 刀身に そって 円の 粒が 流れ、細い 線の 粒が ならぶ（粒の 数は 一定） */
  private blade(s: Inst, T: number, a: number): void {
    const f = T + s.startup + 1;
    this.swordAt(s, f, 'tip', this.tip);
    this.swordAt(s, f, 'base', this.base);
    const bx = this.base[0]!, by = this.base[1]!, bz = this.base[2]!;
    let dx = this.tip[0]! - bx, dy = this.tip[1]! - by, dz = this.tip[2]! - bz;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const ex = this.tip[0]! + (dx / dl) * 0.25, ey = this.tip[1]! + (dy / dl) * 0.25, ez = this.tip[2]! + (dz / dl) * 0.25;
    dx = (ex - bx); dy = (ey - by); dz = (ez - bz);
    const ul = Math.hypot(dx, dy, dz) || 1, ux = dx / ul, uy = dy / ul, uz = dz / ul;
    const v = this.view;
    const nDot = this.reducedNow ? 6 : 12, nStr = this.reducedNow ? 4 : 8;
    for (let q = 0; q < nDot; q++) {
      const fr = (hash(q, s.seed, 8) + (T + 20) * 0.1 * (0.8 + 0.5 * hash(q, 9))) % 1;
      const o = (hash(q, s.seed, 10) - 0.5) * 0.09 * K * 2;
      const ang = hash(q, 11) * 6.283;
      const px = bx + dx * fr + (v.right.x * Math.cos(ang) + v.up.x * Math.sin(ang)) * o;
      const py = by + dy * fr + (v.right.y * Math.cos(ang) + v.up.y * Math.sin(ang)) * o;
      const pz = bz + dz * fr + (v.right.z * Math.cos(ang) + v.up.z * Math.sin(ang)) * o;
      this.dot(px, py, pz, DOT * (1.3 + 1.6 * hash(q, 12)), a * (0.55 + 0.45 * Math.sin(fr * 3.14)), s.seed + q);
    }
    for (let q = 0; q < nStr; q++) {
      const fr = (hash(q, s.seed, 13) + (T + 20) * 0.07) % 1;
      const o = (hash(q, 14) - 0.5) * 0.05;
      this.streak(bx + dx * fr + v.up.x * o, by + dy * fr + v.up.y * o, bz + dz * fr + v.up.z * o, ux, uy, uz, 0.1 + 0.08 * hash(q, 15), a * 0.9, s.seed + 40 + q);
    }
  }

  private draw(s: Inst): void {
    const T = s.T, idx = s.idx;
    const L = WINDOW[s.tech];
    if (T >= -6 && T <= L + 3) {
      this.blade(s, T, smooth((T + 6) / 3) * (1 - smooth((T - L) / 3)));
    }
    const nF = idx === 2 ? 2 : 1, mult = [[1], [1], [0.6, 0.9]][idx]!;
    let dly = 0;
    for (let fl = 0; fl < nF; fl++) {
      if (fl > 0) dly += 4 + Math.floor(hash(s.seed, fl, 33 + idx) * 5);
      const t = T - L - dly;
      if (t < -1 || t > FLARE_LIFE - 1) continue;
      const m = mult[s.perm[fl]!]!;
      if (!s.fSet[fl]) {
        const back = fl === 0 ? 0 : 3 + Math.floor(hash(s.seed, fl, 35 + idx) * 7);
        const ff = Math.max(s.startup + 1, s.startup + L + 1 - back);
        this.swordAt(s, ff, 'tip', this.tip);
        this.swordAt(s, ff, 'base', this.base);
        let dx = this.tip[0]! - this.base[0]!, dy = this.tip[1]! - this.base[1]!, dz = this.tip[2]! - this.base[2]!;
        const dl = Math.hypot(dx, dy, dz) || 1;
        dx /= dl; dy /= dl; dz /= dl;
        const jx = (hash(s.seed, fl, 36) - 0.5) * 0.3 * (fl > 0 ? 1 : 0), jy = (hash(s.seed, fl, 37) - 0.5) * 0.3 * (fl > 0 ? 1 : 0);
        s.fo[fl * 3] = this.tip[0]! + dx * 0.25 + this.view.right.x * jx + this.view.up.x * jy;
        s.fo[fl * 3 + 1] = this.tip[1]! + dy * 0.25 + this.view.right.y * jx + this.view.up.y * jy;
        s.fo[fl * 3 + 2] = this.tip[2]! + dz * 0.25 + this.view.right.z * jx + this.view.up.z * jy;
        s.fSet[fl] = 1;
      }
      this.flare(s, fl, t, m);
    }
  }

  /** フレア: 中心から 線の 粒が 放射状に はじけ、円の 粒が ふわっと 広がって 消える */
  private flare(s: Inst, fl: number, t: number, m: number): void {
    const idx = s.idx;
    const ox = s.fo[fl * 3]!, oy = s.fo[fl * 3 + 1]!, oz = s.fo[fl * 3 + 2]!;
    const v = this.view;
    const dEye = Math.hypot(ox - v.eye.x, oy - v.eye.y, oz - v.eye.z);
    const S = [0.6, 0.85, 0.95][idx]! * K * m * Math.max(0.4, Math.min(1, dEye / 3.3)) * 1.6;
    const fade = t > 6 ? 1 - (t - 6) / 9 : 1;
    if (fade <= 0) return;
    const tt = Math.max(0, t + 1);
    // 線の 粒: 速く はじけて 止まる
    const ns = Math.round([10, 12, 14][idx]! * (0.7 + 0.3 * m) * (this.reducedNow ? 0.5 : 1));
    const head = 1 - Math.exp(-tt * 0.45);
    for (let q = 0; q < ns; q++) {
      const th = (q / ns) * 6.283 + hash(q, s.seed, fl, 1) * 0.4;
      const dx = this.cdx(th), dy = this.cdy(th), dz = this.cdz(th);
      const reach = (0.5 + 0.7 * hash(q, s.seed, fl, 2)) * S;
      const d1 = reach * head, len = Math.min(d1, reach * 0.35 * (1 - head * 0.5) + 0.03);
      this.streak(ox + dx * (d1 - len), oy + dy * (d1 - len), oz + dz * (d1 - len), dx, dy, dz, len, fade, hash(q, s.seed, fl, 3) * 1000);
    }
    // 円の 粒: ふわっと 広がり、小さく なって 消える
    const nd = Math.round([12, 16, 20][idx]! * (0.7 + 0.3 * m) * (this.reducedNow ? 0.5 : 1));
    const spread = 1 - Math.exp(-tt * 0.22);
    for (let q = 0; q < nd; q++) {
      const th = hash(q, s.seed, fl, 4) * 6.283, reach = (0.2 + 0.9 * hash(q, s.seed, fl, 5)) * S;
      const d = reach * spread;
      const sz = DOT * (1.6 + 2.4 * hash(q, s.seed, fl, 6)) * (1 - 0.6 * clamp01(t / 14));
      this.dot(ox + this.cdx(th) * d, oy + this.cdy(th) * d + 0.01 * tt, oz + this.cdz(th) * d, sz, fade * 0.9, hash(q, s.seed, fl, 7) * 1000);
    }
  }

  private drawHit(h: Hit): void {
    const f = 1 - h.age / 12, g = 1 - Math.exp(-h.age * 0.4);
    for (let q = 0; q < 8; q++) {
      const a = hash(q, 9, h.seed) * 6.28, D = (0.2 + 0.4 * hash(q, 3)) * g;
      const dx = this.cdx(a), dy = this.cdy(a), dz = this.cdz(a);
      if (q % 2) this.streak(h.x + dx * D, h.y + dy * D, h.z + dz * D, dx, dy, dz, 0.06, f, hash(q, h.seed, 81) * 1000);
      else this.dot(h.x + dx * D, h.y + dy * D, h.z + dz * D, DOT * (1.8 + hash(q, 5)), f, hash(q, h.seed, 81) * 1000);
    }
  }

  /** 読みこみ中に 材質・ブルームの 作業用の 絵と プログラムを 先に 作る（最初の 虹で かくつかない） */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, scene: THREE.Scene): void {
    this.nrm.warmUp(renderer, camera, scene);
    this.add.warmUp(renderer, camera, scene);
    this.bloom.ensure(renderer);
    this.bloom.apply(renderer, scene, camera, false);
  }

  /** 窓口用 */
  info(): { draws: number; tris: number; active: number; bloomPasses: number } {
    return {
      draws: (this.nrm.visible() ? 1 : 0) + (this.add.visible() ? 1 : 0),
      tris: this.nrm.triangles() + this.add.triangles(),
      active: this.insts.filter((i) => i.active && i.T >= 0).length,
      bloomPasses: this.active() ? this.bloom.lastPasses : 0,
    };
  }

  dispose(): void {
    this.nrm.dispose(this.scene);
    this.add.dispose(this.scene);
    this.bloom.dispose();
  }
}

/** 虹だけに 効かせる ブルーム（半分の 解像度）。キャラ・地面・空・白い 斬撃は にじませない */
class RainbowBloom {
  private rtFx: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget | null = null;
  private pass: UnrealBloomPass | null = null;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mat: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();
  private w = 0;
  private h = 0;
  private readonly bg = new THREE.Color();
  private readonly copyScene = new THREE.Scene();
  private readonly copyMat: THREE.ShaderMaterial;
  lastPasses = 1 + 1 + 12 + 1;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tB: { value: null }, tF: { value: null }, gain: { value: BLOOM.gain } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader:
        'uniform sampler2D tB; uniform sampler2D tF; uniform float gain; varying vec2 vUv; void main(){ vec3 d=max(texture2D(tB,vUv).rgb-texture2D(tF,vUv).rgb,0.)*gain; gl_FragColor=vec4(d,1.);\n #include <colorspace_fragment>\n }',
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { tF: { value: null } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: 'uniform sampler2D tF; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tF,vUv); }',
      blending: THREE.NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat));
  }

  ensure(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(2, Math.round(this.size.x * 0.5)), h = Math.max(2, Math.round(this.size.y * 0.5));
    if (this.rtFx && w === this.w && h === this.h) return;
    this.rtFx?.dispose();
    this.rtB?.dispose();
    this.pass?.dispose();
    this.w = w;
    this.h = h;
    this.rtFx = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.rtB = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    this.pass = new UnrealBloomPass(new THREE.Vector2(w, h), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.mat.uniforms.tB!.value = this.rtB.texture;
    this.mat.uniforms.tF!.value = this.rtFx.texture;
    this.copyMat.uniforms.tF!.value = this.rtFx.texture;
  }

  /** 本描きの あとに 呼ぶ: 虹だけ（レイヤー 1）を 半分の 大きさに 1 回 描いて コピーし、にじみを 足した 絵との 差を 画面に 足す */
  apply(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, reduced: boolean): void {
    this.ensure(renderer);
    this.pass!.strength = reduced ? BLOOM.strength * 0.5 : BLOOM.strength;
    const rtFx = this.rtFx!, rtB = this.rtB!;
    const prevBg = scene.background;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(this.bg);
    const prevAlpha = renderer.getClearAlpha();
    const prevMask = camera.layers.mask;
    scene.background = null;
    renderer.setClearColor(0x000000, 1);
    camera.layers.set(1);
    renderer.setRenderTarget(rtFx);
    renderer.clear();
    renderer.render(scene, camera);
    // 同じ 絵を もう 1 まい（ブルームの 作業用）。シーンを もう 1 回 描かず コピーする
    const ac0 = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(rtB);
    renderer.render(this.copyScene, this.quadCam);
    renderer.autoClear = ac0;
    camera.layers.mask = prevMask;
    scene.background = prevBg;
    renderer.setClearColor(prevClear, prevAlpha);
    this.pass!.render(renderer, rtB, rtB, 0, false);
    renderer.setRenderTarget(null);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.quadScene, this.quadCam);
    renderer.autoClear = ac;
    renderer.setRenderTarget(prevTarget);
    this.lastPasses = 1 + 1 + 12 + 1;
  }

  dispose(): void {
    this.rtFx?.dispose();
    this.rtB?.dispose();
    this.pass?.dispose();
    this.mat.dispose();
    this.copyMat.dispose();
  }
}
