import * as THREE from 'three';
import type { BladeTech, BladeTechFrames, Vec3 } from '../contracts';
import { TRAIL_K, pathPoint, timeToTau } from './bladeTrailModel';
import { spawnDelayOf, type SlashStep } from './nijiSlashModel';
import { DOT, FxBatch, FxView, hash, makePts, rgbOf, type Grad } from './fxPaint';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * 虹 v3（2026-10-23 オーナー決定）: 白い 斬撃の 上の 層。
 * 刀身が プリズムの にじ色に 光り（振っている 間）、各わざの 終わりに 太陽の フレア（つき 1・きりあげ 2・けさ 3 つ。刀の さきの 弧の 上で
 * 場所・大きさ・時間を ずらす）。粒・星・すじは 1 つずつが 虹色（白い 芯から 外へ 赤〜むらさき）。当てた 時は 虹色の 点。
 * 試作 art/LEGEND-FX/proto/fx3-niji.js・bloom.js。発光 = 虹の エフェクトだけに 効かせる ブルーム（半分の 解像度）。
 * 虹が 出て いない 間は ブルームの パスを 回さない（ふだんの 重さを ふやさない）。
 * 描く 物は 2 つの 形（ふつう重ね・加算）。シード付き（hash）・毎ステップ new しない。
 */
const SPEC = ['#FF1F3D', '#FF8A00', '#FFE600', '#00E060', '#00B4FF', '#2E5CFF', '#B030FF'].map(rgbOf);
const EDGE = rgbOf('#2A2350');
const WH = rgbOf('#FFFFFF');
const SKY = rgbOf('#BFD8FF');
/** 虹の 絵: よこ 64 点（白→赤→だいだい→黄→緑→水→青→むらさき 各 7 点 + 無地の 白 8 点）。向きを かえて うつす */
function rainbowTexture(): THREE.CanvasTexture {
  const hexes = ['#FFFFFF', '#FF1F3D', '#FF8A00', '#FFE600', '#00E060', '#00B4FF', '#2E5CFF', '#B030FF'];
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 2;
  const g = c.getContext('2d')!;
  for (let x = 0; x < 64; x++) {
    g.fillStyle = x < 56 ? hexes[Math.floor(x / 7)]! : '#FFFFFF';
    g.fillRect(x, 0, 1, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
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
const easeOut = (x: number): number => 1 - (1 - clamp01(x)) * (1 - clamp01(x));

export class RainbowFx {
  private readonly view = new FxView();
  private readonly tex: THREE.CanvasTexture;
  private readonly grad: Grad = { mode: 0, cx: 0, cy: 0, cz: 0, ext: 1 };
  private readonly nrm: FxBatch;
  private readonly add: FxBatch;
  private readonly insts: Inst[] = [];
  private readonly hits: Hit[] = [];
  private seedN = 0;
  private readonly tmp: number[] = [0, 0, 0];
  private readonly tip = new Float32Array(3);
  private readonly base = new Float32Array(3);
  private readonly pts5 = makePts(6);
  private readonly pts6 = makePts(6);
  private readonly ringP = makePts(26);
  private readonly w5 = new Float32Array(6);
  // ブルーム
  private readonly bloom: RainbowBloom;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly lengths: (tech: BladeTech) => BladeTechFrames,
  ) {
    this.tex = rainbowTexture();
    this.nrm = new FxBatch(scene, { additive: false, map: this.tex, plainU: 0.94, depthTest: false, renderOrder: 8, maxVerts: 60000 });
    this.add = new FxBatch(scene, { additive: true, depthTest: false, renderOrder: 9, maxVerts: 30000 });
    // ブルームの 「虹だけ」の 道は レイヤー 1 を 使う（本描きは レイヤー 0 と 1 を 描く）
    this.nrm.mesh.layers.enable(1);
    this.add.mesh.layers.enable(1);
    for (let i = 0; i < MAX_INST; i++) {
      this.insts.push({ idx: 0, tech: 'thrust', uDeg: 0, startup: 0, T: 0, seed: 0, active: false, pos: () => ({ x: 0, y: 0, z: 0 }), fo: makePts(4), fSet: new Uint8Array(4), perm: [0] });
    }
    this.bloom = new RainbowBloom();
  }

  /** 虹が 出ている（描画・ブルームを 回す 必要が ある） */
  active(): boolean {
    return this.nrm.visible() || this.add.visible();
  }

  /** 世界を 描く（虹が 出て いる 間だけ ブルーム つき）。Game の worldPass から 呼ぶ */
  renderWorld(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    renderer.render(scene, camera);
    this.bloom.apply(renderer, scene, camera);
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
  step(): void {
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

  /** 粒ごとに 虹の 向きを きめる（0 中心から 外・1 ななめ・2 横・3 たて。シード付き。その 粒が 消えるまで かえない） */
  private g(seed: number, x: number, y: number, z: number, ext: number): Grad {
    const g = this.grad;
    g.mode = Math.min(3, Math.floor(hash(seed, 91) * 4));
    g.cx = x; g.cy = y; g.cz = z; g.ext = ext;
    return g;
  }

  /** 1 つの 粒の 中に 虹（向きは 粒ごとに ランダム） */
  private dotRB(x: number, y: number, z: number, r: number, a: number, seed: number): void {
    r = Math.max(r * K * 1.6, DOT * 2);
    this.nrm.disc(this.view, x, y, z, r + DOT * 0.6, EDGE, a * 0.85, false, 8);
    this.nrm.discG(this.view, x, y, z, r, a, this.g(seed, x, y, z, r), 8);
  }

  /** 十字の 星: 4 本の 腕に 虹（向きは 星ごとに ランダム） */
  private crossStar(x: number, y: number, z: number, sz: number, a: number, rot: number, seed: number): void {
    sz *= K;
    const F = [0, 0.2, 0.4, 0.65, 0.85, 1];
    const WE = [2.2, 2, 1.7, 1.2, 0.8, 0.3], WC = [1.4, 1.3, 1.1, 0.8, 0.5, 0.15];
    const gr = this.g(seed, x, y, z, sz);
    for (let k = 0; k < 4; k++) {
      const ang = rot + (k * Math.PI) / 2, dx = this.cdx(ang), dy = this.cdy(ang), dz = this.cdz(ang);
      for (let j = 0; j < 6; j++) {
        const d = sz * F[j]! * (k % 2 ? 0.75 : 1);
        this.pts6[j * 3] = x + dx * d; this.pts6[j * 3 + 1] = y + dy * d; this.pts6[j * 3 + 2] = z + dz * d;
        this.w5[j] = DOT * WE[j]! * 0.8;
      }
      this.nrm.band(this.view, this.pts6, 6, this.w5, 0, EDGE, 0.8 * a);
      for (let j = 0; j < 6; j++) this.w5[j] = DOT * WC[j]! * 0.8;
      this.nrm.bandG(this.view, this.pts6, 6, this.w5, a, gr);
    }
    this.dotRB(x, y, z, DOT * 2.5, a, seed + 1);
  }

  /** 白い 芯＋両ふちに 赤〜紫の 帯（にごらない ふつう重ね）。芯と にじみだけ 加算 */
  private prism(n: number, a: number): void {
    const p = this.pts5, wf = this.wA, w2 = this.wB, of = this.oA;
    for (let k = 0; k < n; k++) wf[k] = 0.2 * K * Math.max(0.3, Math.sin(Math.PI * clamp01((k / (n - 1)) * 0.92 + 0.04)));
    for (let k = 0; k < n; k++) w2[k] = wf[k]! * 1.12 + DOT * 3;
    this.nrm.band(this.view, p, n, w2, 0, EDGE, 0.85 * a);
    const N = 7;
    for (let j = 0; j < N; j++) {
      const o = (j - (N - 1) / 2) / N;
      for (let k = 0; k < n; k++) { w2[k] = (wf[k]! / N) * 1.3; of[k] = o * wf[k]!; }
      this.nrm.band(this.view, p, n, w2, of, j === 3 ? WH : SPEC[j > 3 ? j - 1 : j]!, a);
    }
    for (let k = 0; k < n; k++) w2[k] = wf[k]! * 0.3;
    this.add.band(this.view, p, n, w2, 0, WH, 0.95 * a);
    for (let k = 0; k < n; k++) w2[k] = wf[k]! * 1.9;
    this.add.band(this.view, p, n, w2, 0, SKY, 0.22 * a, true);
  }
  private readonly wA = new Float32Array(8);
  private readonly wB = new Float32Array(8);
  private readonly oA = new Float32Array(8);

  private draw(s: Inst): void {
    const T = s.T, idx = s.idx;
    const L = WINDOW[s.tech];
    const f = T + s.startup + 1;
    // ① 刀身が プリズムの にじ色に 光る
    if (T >= -6 && T <= L + 3) {
      this.swordAt(s, f, 'tip', this.tip);
      this.swordAt(s, f, 'base', this.base);
      let dx = this.tip[0]! - this.base[0]!, dy = this.tip[1]! - this.base[1]!, dz = this.tip[2]! - this.base[2]!;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const ex = this.tip[0]! + dx * 0.3, ey = this.tip[1]! + dy * 0.3, ez = this.tip[2]! + dz * 0.3;
      const a0 = smooth((T + 6) / 3) * (1 - smooth((T - L) / 3));
      for (let k = 0; k < 5; k++) {
        const t = k / 4;
        this.pts5[k * 3] = this.base[0]! + (ex - this.base[0]!) * t;
        this.pts5[k * 3 + 1] = this.base[1]! + (ey - this.base[1]!) * t;
        this.pts5[k * 3 + 2] = this.base[2]! + (ez - this.base[2]!) * t;
      }
      this.prism(5, a0);
      this.crossStar(ex, ey, ez, 0.22, a0, T * 0.1, s.seed + 5);
      for (let q = 0; q < 4; q++) {
        const fr = (hash(q, 8) + (T + 20) * 0.09 * (1 + q * 0.2)) % 1;
        this.crossStar(this.base[0]! + (ex - this.base[0]!) * fr, this.base[1]! + (ey - this.base[1]!) * fr, this.base[2]! + (ez - this.base[2]!) * fr, 0.08 + 0.05 * hash(q, 9), a0, q + (T + 20) * 0.05, s.seed + 10 + q);
      }
    }
    // ② わざの 終わり: 刀の 通り道に フレアが 順に 1・2・3 つ（ずらして、大きさも ばらばら）
    const nF = idx === 2 ? 2 : 1, mult = [[1], [1], [0.6, 0.9]][idx]!;
    let dly = 0;
    for (let fl = 0; fl < nF; fl++) {
      if (fl > 0) dly += 4 + Math.floor(hash(s.seed, fl, 33 + idx) * 5);
      const t = T - L - dly;
      if (t < -1 || t > FLARE_LIFE - 1) continue;
      const m = mult[s.perm[fl]!]!;
      if (!s.fSet[fl]) {
        // 出る とき 1 回: 刀の さきの 弧の 上（少し 前の 時刻の さき）に きめる
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

  private flare(s: Inst, fl: number, t: number, m: number): void {
    const idx = s.idx, v = this.view;
    const ox = s.fo[fl * 3]!, oy = s.fo[fl * 3 + 1]!, oz = s.fo[fl * 3 + 2]!;
    const dEye = Math.hypot(ox - v.eye.x, oy - v.eye.y, oz - v.eye.z);
    const S = [0.6, 0.85, 0.95][idx]! * K * m * Math.max(0.4, Math.min(1, dEye / 3.3)) * (fl === 0 && idx === 0 ? 0.85 : 1);
    const grow = easeOut((t + 1) / 5), fade = t > 7 ? 1 - (t - 7) / 8 : 1, g = grow * S;
    if (fade <= 0) return;
    const nr = Math.round([12, 18, 26][idx]! * (0.6 + 0.4 * m));
    const RW = [1.6, 3.1, 4.2, 2.8, 0.8], CW = [1, 2.3, 3.2, 2, 0.4];
    for (let q = 0; q < nr; q++) {
      const th = (q / nr) * 6.283 + hash(q, 1) * 0.12;
      const dx = this.cdx(th), dy = this.cdy(th), dz = this.cdz(th);
      const long = q % 2 === 0;
      const len = (long ? 1.0 + 0.6 * hash(q, 2) : 0.45 + 0.25 * hash(q, 3)) * g, r0 = 0.08 * S;
      const w = long ? 1 : 0.7;
      for (let j = 0; j < 5; j++) {
        const d = r0 + len * (j / 4);
        this.pts5[j * 3] = ox + dx * d; this.pts5[j * 3 + 1] = oy + dy * d; this.pts5[j * 3 + 2] = oz + dz * d;
        this.w5[j] = DOT * RW[j]! * w;
      }
      this.nrm.band(v, this.pts5, 5, this.w5, 0, EDGE, 0.7 * fade);
      for (let j = 0; j < 5; j++) this.w5[j] = DOT * CW[j]! * w;
      this.nrm.bandG(v, this.pts5, 5, this.w5, fade, this.g(hash(q, s.seed, fl, 77) * 1000, ox + dx * (r0 + len * 0.5), oy + dy * (r0 + len * 0.5), oz + dz * (r0 + len * 0.5), len * 0.5 + 0.02));
    }
    // 核（加算）
    this.add.disc(v, ox, oy, oz, 0.22 * g + 0.03, WH, 0.95 * fade, true, 10);
    this.add.disc(v, ox, oy, oz, 0.55 * g, SKY, 0.35 * fade, true, 10);
    // 光の 輪（にじ色）
    const nrg = idx === 0 ? 0 : m > 0.8 ? 2 : 1;
    for (let k = 0; k < nrg; k++) {
      const R = (0.4 + k * 0.3) * g;
      const NR = 24;
      for (let q = 0; q <= NR; q++) {
        const a = (q / NR) * 6.283;
        this.ringP[q * 3] = ox + this.cdx(a) * R; this.ringP[q * 3 + 1] = oy + this.cdy(a) * R; this.ringP[q * 3 + 2] = oz + this.cdz(a) * R;
      }
      this.nrm.band(v, this.ringP, NR + 1, DOT * 3.2, 0, EDGE, 0.6 * fade * (1 - k * 0.2));
      for (let j = 0; j < 7; j++) this.nrm.band(v, this.ringP, NR + 1, DOT * 1.1, (j - 3) * DOT * 0.9, SPEC[j]!, 0.9 * fade);
    }
    // レンズフレア: 画面の 一直線に ならぶ 丸い 光
    const la = -0.55 + idx * 0.1, lx = this.cdx(la), ly = this.cdy(la), lz = this.cdz(la);
    const no = Math.round([2, 3, 4][idx]! * (0.7 + 0.3 * m));
    for (let q = 0; q < no; q++) {
      const off = (q - 1) * (0.35 + 0.2 * hash(q, 4)) * g * 1.3, rr = (0.05 + 0.09 * hash(q, 5)) * (0.6 + S * 0.5);
      this.dotRB(ox + lx * off, oy + ly * off, oz + lz * off, rr, 0.9 * fade, hash(q, s.seed, fl, 78) * 1000);
      if (q % 2) this.add.disc(v, ox + lx * off, oy + ly * off, oz + lz * off, rr * 1.8, SKY, 0.22 * fade, true, 8);
    }
    // 星くず
    const nd = [5, 7, 11][idx]!;
    for (let q = 0; q < nd; q++) {
      const th = hash(q, 3, s.seed, fl) * 6.283, vel = (0.3 + 1.1 * hash(q, 5)) * S;
      const dd = vel * (1 - Math.exp(-(t + 1) * 0.3)) + 0.05;
      const px = ox + this.cdx(th) * dd, py = oy + this.cdy(th) * dd - 0.02 * t, pz = oz + this.cdz(th) * dd;
      if (q % 3 === 0) this.crossStar(px, py, pz, 0.09 + 0.06 * hash(q, 6), fade * 0.8, q * 0.7 + t * 0.08, hash(q, s.seed, fl, 79) * 1000);
      else this.dotRB(px, py, pz, DOT * (2.5 + hash(q, 7) * 1.6), fade * 0.8, hash(q, s.seed, fl, 80) * 1000);
    }
  }

  private drawHit(h: Hit): void {
    for (let q = 0; q < 9; q++) {
      const a = hash(q, 9, h.seed) * 6.28, D = (0.3 + 0.6 * hash(q, 3)) * (1 - Math.exp(-h.age * 0.4));
      this.dotRB(h.x + this.cdx(a) * D, h.y + this.cdy(a) * D, h.z + this.cdz(a) * D, DOT * (2.5 + 1.5 * hash(q, 5)), 1 - h.age / 12, hash(q, h.seed, 81) * 1000);
    }
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
    this.tex.dispose();
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
  lastPasses = 0;

  constructor(
  ) {
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
  }

  private ensure(renderer: THREE.WebGLRenderer): void {
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
  }

  /** 本描きの あとに 呼ぶ: 虹だけ（レイヤー 1）を 半分の 大きさに 2 回 描き、にじみを 足した 絵との 差を 画面に 足す */
  apply(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.ensure(renderer);
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
    renderer.setRenderTarget(rtB);
    renderer.clear();
    renderer.render(scene, camera);
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
    this.lastPasses = 2 + 12 + 1;
  }

  dispose(): void {
    this.rtFx?.dispose();
    this.rtB?.dispose();
    this.pass?.dispose();
    this.mat.dispose();
  }
}
