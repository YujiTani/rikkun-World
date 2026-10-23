// CHAR-4: 刃の軌跡（半月・4 だん・しっぽから 消える）。docs/design/CHAR-4.md §4.1〜§4.8
import * as THREE from 'three';
import type { BladeState, BladeTech, BladeTechFrames, BladeTrailStyle, ItemId, Vec3, W2Settings } from '../contracts';
import { BLADE_TRAIL_ITEMS, TRAIL_K, fadeOfAge, pathPoint, tauToTime, timeToTau, trailRow } from './bladeTrailModel';

export interface BladeTrailDeps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  settings: () => Pick<W2Settings, 'bladeTrail' | 'bladeTrailShape' | 'bladeTrailWindow' | 'bladeTech'>;
}

/** `window.__rikkun.blade.trail()` の 中身（仕様書 §8） */
export interface TrailSnapshot {
  visible: boolean;
  item: ItemId | null;
  tech: BladeTech | null;
  /** この わざで 書いた 点（次の わざまで のこす） */
  points: { step: number; tau: number; age: number; tip: Vec3; base: Vec3 }[];
  tail: number | null;
  head: number | null;
  /** 区切りの 点（ずらした あと）。しっぽ（q = 0）から 頭（q = 1）の 順 */
  columns: { q: number; age: number; tip: Vec3; inner: Vec3 }[];
  /** 区切りごと（列 j と j + 1 の あいだ） */
  strips: { age: number; fade: number }[];
  segments: number;
  triangles: number;
  objects: number;
  color: number;
  glow: number;
  stars: Vec3[];
}

const MAX_SEGS = 36;
const BANDS = 4;
const VERTS_PER_QUAD = 4;
const MAX_QUADS = MAX_SEGS * BANDS;
const STAR_QUADS = 5; // 十字: 4 本の うで + まん中
const MAX_STARS = 3;
const STAR_SIZE = 0.08;
const STAR_ARM = 0.014; // うでの 太さの 半分
const STAR_CORE = 0.026; // まん中の 半分
const STAR_WHITE = 0xffffff;
const STAR_YELLOW = 0xfff3a0;

/** 点（その ステップの おわりの 体と 刃先・つば。世界の 位置） */
interface Pt {
  time: number;
  tau: number;
  bx: number;
  by: number;
  bz: number;
  tip: Vec3;
  base: Vec3;
}

const newPt = (): Pt => ({ time: 0, tau: 0, bx: 0, by: 0, bz: 0, tip: { x: 0, y: 0, z: 0 }, base: { x: 0, y: 0, z: 0 } });

/** 小さな 十字の 四角（画面の 右・上 で [x0, x1, y0, y1, 色]） */
const STAR_RECTS: ReadonlyArray<readonly [number, number, number, number, 0 | 1]> = [
  [-STAR_SIZE, -STAR_CORE, -STAR_ARM, STAR_ARM, 0],
  [STAR_CORE, STAR_SIZE, -STAR_ARM, STAR_ARM, 0],
  [-STAR_ARM, STAR_ARM, STAR_CORE, STAR_SIZE, 0],
  [-STAR_ARM, STAR_ARM, -STAR_SIZE, -STAR_CORE, 0],
  [-STAR_CORE, STAR_CORE, -STAR_CORE, STAR_CORE, 1],
];

/** WEAPON-7: 雷神剣の 軌跡の ふちの 小さな いなずま（ぎざぎざ。白〜白っぽい 黄色。カメラの 向きの 面） */
const THUNDER_RECTS: ReadonlyArray<readonly [number, number, number, number, 0 | 1]> = [
  [0.01, 0.034, 0.04, 0.09, 0],
  [-0.03, 0.034, 0.024, 0.044, 1],
  [-0.034, -0.01, -0.02, 0.03, 0],
  [-0.034, 0.03, -0.036, -0.016, 1],
  [0.006, 0.03, -0.09, -0.03, 0],
];

/**
 * 刃の軌跡（いつも 1 本 以下）。1 ステップに 1 回 `step()`（ふみこみの あと）。
 * 物・頂点の 入れ物は はじめに 1 回だけ 作って 使いまわす（毎ステップ new しない）。
 */
export class BladeTrail {
  private readonly bandMesh: THREE.Mesh;
  private readonly starMesh: THREE.Mesh;
  private readonly bandPos: Float32Array;
  private readonly bandCol: Float32Array;
  private readonly starPos: Float32Array;
  private readonly starCol: Float32Array;
  private readonly bandGeo = new THREE.BufferGeometry();
  private readonly starGeo = new THREE.BufferGeometry();

  // わざの ようす
  private tech: BladeTech | null = null;
  private item: ItemId | null = null;
  private style: BladeTrailStyle | null = null;
  /** WEAPON-6: 何段目か（星の数）。段の情報が ない ときは 3 */
  private comboStep = 3;
  /** GOLD-1 試作: 金の 刀を 何回 ふったか（2 回に 1 回 きらり） */
  private goldSwings = 0;
  private lengths: BladeTechFrames = { startup: 1, active: 1, recovery: 1 };
  private writing = false;
  /** いまの 時刻（わざを 始めた ステップの おわり = 1） */
  private n = 0;
  private uSin = 0;
  private uCos = 1;
  private tStart = 0;
  private tEnd = 0;
  private readonly pts: Pt[] = [];
  private np = 0;

  // 見える 部分（build の 結果）
  private shown = false;
  private tail = 0;
  private head = 0;
  private nseg = 0;
  private strips = 0;
  private nStars = 0;
  private readonly colT = new Float64Array(MAX_SEGS + 1);
  private readonly colTip = new Float64Array((MAX_SEGS + 1) * 3);
  private readonly colInner = new Float64Array((MAX_SEGS + 1) * 3);
  private readonly colBase = new Float64Array((MAX_SEGS + 1) * 3); // つばの 向き（つば − 刃先）
  private readonly stripFade = new Float64Array(MAX_SEGS);
  private readonly stripAge = new Float64Array(MAX_SEGS);
  private readonly starAt = new Int32Array(MAX_STARS);

  // 作業用
  private readonly dT = [0, 0, 0];
  private readonly dB = [0, 0, 0];
  private readonly body = [0, 0, 0];
  private readonly c1 = new THREE.Color();
  private readonly c2 = new THREE.Color();
  /** WEAPON-7 PR3: 虹の 軌跡の 色（弧に そって 色相が ながれる） */
  private readonly cRb = new THREE.Color();
  private readonly cUnder = new THREE.Color();
  private readonly camPos = new THREE.Vector3();
  private readonly camR = new THREE.Vector3();
  private readonly camU = new THREE.Vector3();
  private readonly vV = new THREE.Vector3();
  private readonly vT = new THREE.Vector3();
  private readonly vN = new THREE.Vector3();

  constructor(private readonly d: BladeTrailDeps) {
    this.bandPos = new Float32Array(MAX_QUADS * VERTS_PER_QUAD * 3);
    this.bandCol = new Float32Array(MAX_QUADS * VERTS_PER_QUAD * 4);
    const idx = new Uint16Array(MAX_QUADS * 6);
    for (let q = 0; q < MAX_QUADS; q++) idx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
    this.bandGeo.setAttribute('position', new THREE.BufferAttribute(this.bandPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.bandGeo.setAttribute('color', new THREE.BufferAttribute(this.bandCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.bandGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.bandGeo.setDrawRange(0, 0);
    // 光の 帯: 明るさで かげを つけない（MeshBasic）。深さは 見るだけ（キャラ・ブロックの うしろは かくれる）。霧は ほかと 同じ
    this.bandMesh = new THREE.Mesh(this.bandGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    (this.bandMesh.material as THREE.MeshBasicMaterial).forceSinglePass = true; // 2 面 + 透明は 2 回 描かれる（描画回数 2 ばい）のを 1 回に
    this.bandMesh.name = 'bladeTrail';
    this.bandMesh.frustumCulled = false;
    this.bandMesh.visible = false;
    this.bandMesh.renderOrder = 5;
    d.scene.add(this.bandMesh);

    this.starPos = new Float32Array(MAX_STARS * STAR_QUADS * VERTS_PER_QUAD * 3);
    this.starCol = new Float32Array(MAX_STARS * STAR_QUADS * VERTS_PER_QUAD * 3);
    const sidx = new Uint16Array(MAX_STARS * STAR_QUADS * 6);
    for (let q = 0; q < MAX_STARS * STAR_QUADS; q++) sidx.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 1, q * 4 + 3, q * 4 + 2], q * 6);
    this.starGeo.setAttribute('position', new THREE.BufferAttribute(this.starPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.starGeo.setAttribute('color', new THREE.BufferAttribute(this.starCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.starGeo.setIndex(new THREE.BufferAttribute(sidx, 1));
    this.starGeo.setDrawRange(0, 0);
    this.starMesh = new THREE.Mesh(this.starGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    this.starMesh.name = 'bladeTrailStars';
    this.starMesh.frustumCulled = false;
    this.starMesh.visible = false;
    this.starMesh.renderOrder = 6;
    d.scene.add(this.starMesh);
  }

  /**
   * 1 ステップ（ふみこみの あと）。`st` = 刀の 状態、`body` = 体（当たり判定の 足もと）の そのステップの おわりの 位置。
   * 取り消しが 起きた ステップは 刀が もう わざで ないので 点を 書かない（§5）。
   */
  step(st: BladeState, body: Vec3): void {
    const s = this.d.settings();
    const inMove = st.item !== null && BLADE_TRAIL_ITEMS.has(st.item) && st.tech !== null && st.phase !== 'idle' && st.phase !== 'switch';
    if (inMove && st.frame === 1) {
      // 新しい わざ: 前の 軌跡は すぐ 消す
      const tech = st.tech!;
      this.np = 0;
      this.tech = tech;
      this.comboStep = st.combo?.step ?? 3;
      this.item = st.item;
      this.style = trailRow(s, st.item);
      if (this.style.style === 'gold') this.goldSwings++;
      this.lengths = st.lengths ?? s.bladeTech[tech];
      const u = ((((st.move?.dirDeg ?? 0) % 360) + 360) % 360 * Math.PI) / 180;
      this.uSin = Math.sin(u);
      this.uCos = Math.cos(u);
      const win = s.bladeTrailWindow[tech];
      this.tStart = tauToTime(tech, this.lengths, win[0]);
      this.tEnd = tauToTime(tech, this.lengths, win[1]);
      this.writing = true;
      this.n = 1;
    } else if (inMove && this.writing && st.tech === this.tech) {
      this.n = st.frame;
    } else if (this.tech) {
      this.writing = false;
      this.n += 1;
    }
    if (!this.tech) {
      this.hide();
      return;
    }
    if (this.writing && this.n >= this.tStart - 1e-6 && this.n <= this.tEnd + 1e-6) this.addPoint(body);
    this.build(s);
  }

  private addPoint(body: Vec3): void {
    let p = this.pts[this.np];
    if (!p) {
      p = newPt();
      this.pts[this.np] = p;
    }
    this.np++;
    p.time = this.n;
    p.tau = timeToTau(this.tech!, this.lengths, this.n);
    p.bx = body.x;
    p.by = body.y;
    p.bz = body.z;
    this.world(p.tau, 'tip', body.x, body.y, body.z, this.dT);
    p.tip.x = this.dT[0]!;
    p.tip.y = this.dT[1]!;
    p.tip.z = this.dT[2]!;
    this.world(p.tau, 'base', body.x, body.y, body.z, this.dB);
    p.base.x = this.dB[0]!;
    p.base.y = this.dB[1]!;
    p.base.z = this.dB[2]!;
  }

  /** τ の データの 点を 体の 位置から 世界の 位置に（前 = (sin u, 0, −cos u)、右 = (cos u, 0, sin u)） */
  private world(tau: number, which: 'tip' | 'base', bx: number, by: number, bz: number, out: number[]): void {
    pathPoint(this.tech!, tau, which, out);
    const r = out[0]! * TRAIL_K;
    const up = out[1]! * TRAIL_K;
    const fw = out[2]! * TRAIL_K;
    out[0] = bx + r * this.uCos + fw * this.uSin;
    out[1] = by + up;
    out[2] = bz + r * this.uSin - fw * this.uCos;
  }

  /** 時刻 t の 体の 位置（となりの 2 つの おわりの 位置を 直線で） */
  private bodyAt(t: number, out: number[]): void {
    const p = this.pts;
    const last = this.np - 1;
    let i = 0;
    while (i < last - 1 && p[i + 1]!.time < t) i++;
    const a = p[i]!;
    const b = p[Math.min(i + 1, last)]!;
    const w = b.time > a.time ? Math.max(0, Math.min(1, (t - a.time) / (b.time - a.time))) : 0;
    out[0] = a.bx + (b.bx - a.bx) * w;
    out[1] = a.by + (b.by - a.by) * w;
    out[2] = a.bz + (b.bz - a.bz) * w;
  }

  private hide(): void {
    this.shown = false;
    this.strips = 0;
    this.nStars = 0;
    this.nseg = 0;
    this.bandMesh.visible = false;
    this.starMesh.visible = false;
    this.bandGeo.setDrawRange(0, 0);
    this.starGeo.setDrawRange(0, 0);
  }

  private build(s: Pick<W2Settings, 'bladeTrailShape'>): void {
    const sh = s.bladeTrailShape;
    const style = this.style!;
    if (this.np === 0) {
      this.hide();
      return;
    }
    const n = this.n;
    const first = this.pts[0]!.time;
    const last = this.pts[this.np - 1]!.time;
    const tail = Math.max(first, n - sh.lifeSteps);
    const head = Math.min(n, last);
    const span = head - tail;
    if (!(span > 1e-9)) {
      this.hide();
      return;
    }
    const nseg = Math.min(sh.maxSegs, MAX_SEGS, Math.max(sh.segPerStep, Math.ceil(sh.segPerStep * span - 1e-9)));
    this.tail = tail;
    this.head = head;
    this.nseg = nseg;

    const cam = this.d.camera;
    cam.updateWorldMatrix(true, false);
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    this.camR.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    this.camU.setFromMatrixColumn(cam.matrixWorld, 1).normalize();

    // 区切りの 点: そとの へり = 刃先、うちの へり = 刃先 + (つば − 刃先) × 0.45 × sin(πq)
    const tip = this.colTip;
    const inner = this.colInner;
    const bd = this.colBase;
    for (let j = 0; j <= nseg; j++) {
      const t = j === nseg ? head : tail + (span * j) / nseg;
      this.colT[j] = t;
      const tau = timeToTau(this.tech!, this.lengths, t);
      this.bodyAt(t, this.body);
      this.world(tau, 'tip', this.body[0]!, this.body[1]!, this.body[2]!, this.dT);
      this.world(tau, 'base', this.body[0]!, this.body[1]!, this.body[2]!, this.dB);
      const w = sh.widthRatio * Math.sin((Math.PI * j) / nseg);
      for (let k = 0; k < 3; k++) {
        tip[j * 3 + k] = this.dT[k]!;
        bd[j * 3 + k] = this.dB[k]! - this.dT[k]!;
        inner[j * 3 + k] = this.dT[k]! + bd[j * 3 + k]! * w;
      }
    }
    // いちばん うすい はば: (うちの へり − 刃先) の n 成分が minWidth × sin(πq) より 小さいと、n の 向き（つばの 側）へ 足りない ぶん ずらす
    for (let j = 1; j < nseg; j++) {
      const a = j - 1;
      const b = j + 1;
      this.vT.set(tip[b * 3]! - tip[a * 3]!, tip[b * 3 + 1]! - tip[a * 3 + 1]!, tip[b * 3 + 2]! - tip[a * 3 + 2]!);
      if (this.vT.lengthSq() < 1e-12) continue;
      this.vT.normalize();
      this.vV.set(tip[j * 3]! - this.camPos.x, tip[j * 3 + 1]! - this.camPos.y, tip[j * 3 + 2]! - this.camPos.z).normalize();
      this.vN.crossVectors(this.vV, this.vT);
      const cl = this.vN.length();
      if (cl < 0.01) continue; // v と t が ほぼ 平行
      this.vN.divideScalar(cl);
      if (this.vN.x * bd[j * 3]! + this.vN.y * bd[j * 3 + 1]! + this.vN.z * bd[j * 3 + 2]! < 0) this.vN.negate(); // つばの 側
      const cur = (inner[j * 3]! - tip[j * 3]!) * this.vN.x + (inner[j * 3 + 1]! - tip[j * 3 + 1]!) * this.vN.y + (inner[j * 3 + 2]! - tip[j * 3 + 2]!) * this.vN.z;
      const want = sh.minWidth * Math.sin((Math.PI * j) / nseg);
      if (cur < want) {
        inner[j * 3] = inner[j * 3]! + this.vN.x * (want - cur);
        inner[j * 3 + 1] = inner[j * 3 + 1]! + this.vN.y * (want - cur);
        inner[j * 3 + 2] = inner[j * 3 + 2]! + this.vN.z * (want - cur);
      }
    }

    // 帯: 区切りごと・だんごとの 四角。だんの さかいで 頂点を 共有しない
    this.c1.setHex(style.glow);
    this.c2.setHex(style.color);
    const e1 = sh.bandEdges[0];
    const e2 = sh.bandEdges[1];
    const e3 = sh.bandEdges[2];
    let strips = 0;
    let vi = 0;
    for (let j = 0; j < nseg; j++) {
      const age = n - (this.colT[j]! + this.colT[j + 1]!) / 2;
      const fade = fadeOfAge(age, sh.fadeAges, sh.lifeSteps);
      if (fade <= 0) continue;
      this.stripAge[strips] = age;
      this.stripFade[strips] = fade;
      strips++;
      for (let b = 0; b < BANDS; b++) {
        let col = b === 0 ? this.c1 : this.c2;
        if (style.style === 'rainbow') {
          // 弧の はじめ → おわりで 赤 → むらさき。いちばん そとの だんは うすく（白っぽく）
          col = this.cRb.setHSL((0.85 * (j + 0.5)) / nseg, 0.9, b === 0 ? 0.85 : 0.65);
        }
        // GOLD-1 試作: いちばん うちがわの 帯は こん色の 下地（あかるい 空でも 見える）
        const under = b === 3 && style.style === 'gold' && style.under !== undefined;
        if (under) col = this.cUnder.setHex(style.under!);
        const al = (under ? 0.6 : sh.bandAlpha[b]!) * fade;
        const f0 = b === 0 ? 0 : b === 1 ? e1 : b === 2 ? e2 : e3;
        const f1 = b === 0 ? e1 : b === 1 ? e2 : b === 2 ? e3 : 1;
        for (let c = 0; c < 2; c++) {
          const jj = j + c;
          for (let e = 0; e < 2; e++) {
            const f = e === 0 ? f0 : f1;
            const o = vi * 3;
            for (let k = 0; k < 3; k++) {
              const a = tip[jj * 3 + k]!;
              this.bandPos[o + k] = a + (inner[jj * 3 + k]! - a) * f;
            }
            const co = vi * 4;
            this.bandCol[co] = col.r;
            this.bandCol[co + 1] = col.g;
            this.bandCol[co + 2] = col.b;
            this.bandCol[co + 3] = al;
            vi++;
          }
        }
      }
    }
    this.strips = strips;
    this.shown = strips > 0;
    this.bandGeo.setDrawRange(0, strips * BANDS * 6);
    this.bandGeo.getAttribute('position').needsUpdate = true;
    this.bandGeo.getAttribute('color').needsUpdate = true;
    this.bandMesh.visible = this.shown;

    // 星（きらきらの かたな だけ）: q = 0.25・0.55・0.85 の 区切りの 点の そとの へり
    this.nStars = 0;
    if ((style.style === 'star' || style.style === 'thunder') && this.shown) {
      this.c1.setHex(STAR_WHITE);
      this.c2.setHex(STAR_YELLOW);
      // WEAPON-6: 星の 数 = 何段目か（1 段目 まん中の 1 こ・2 段目 はしの 2 こ・3 段目 3 こ）
      for (let k = 0; k < sh.starAt.length; k++) {
        if (this.comboStep === 1 ? k !== 1 : this.comboStep === 2 && k === 1) continue;
        const q = sh.starAt[k]!;
        const j = Math.min(nseg, Math.floor(q * nseg));
        if (n - this.colT[j]! > sh.starMaxAge) continue;
        this.starAt[this.nStars] = j;
        this.writeStar(this.nStars, tip[j * 3]!, tip[j * 3 + 1]!, tip[j * 3 + 2]!);
        this.nStars++;
      }
    }
    // GOLD-1 試作: 金の 刀は 2 回に 1 回、まん中の 区切りに 1 つ きらり（3 だんで くらく。ふち線なし）
    if (style.style === 'gold' && this.shown && this.goldSwings % 2 === 0) {
      const j = Math.min(nseg, Math.floor(sh.starAt[1]! * nseg));
      const age = n - this.colT[j]!;
      if (age >= 0 && age <= sh.starMaxAge) {
        const life = age < 3 ? 0 : age < 6 ? 1 : 2;
        this.c1.setHex(life === 0 ? 0xfffbe6 : life === 1 ? 0xfff0b4 : 0xebb840);
        this.c2.setHex(life === 0 ? 0xfffbe6 : life === 1 ? 0xfff0b4 : 0xc98a1e);
        this.starAt[0] = j;
        this.writeStar(0, tip[j * 3]!, tip[j * 3 + 1]!, tip[j * 3 + 2]!);
        this.nStars = 1;
      }
    }
    this.starGeo.setDrawRange(0, this.nStars * STAR_QUADS * 6);
    this.starGeo.getAttribute('position').needsUpdate = true;
    this.starGeo.getAttribute('color').needsUpdate = true;
    this.starMesh.visible = this.nStars > 0;
  }

  /** 小さな 十字（カメラの 向きの 面。うでは 白、まん中は 黄） */
  private writeStar(i: number, x: number, y: number, z: number): void {
    for (let q = 0; q < STAR_QUADS; q++) {
      const [x0, x1, y0, y1, ci] = (this.style?.style === 'thunder' ? THUNDER_RECTS : STAR_RECTS)[q]!;
      const col = ci === 0 ? this.c1 : this.c2;
      for (let c = 0; c < 4; c++) {
        const v = (i * STAR_QUADS + q) * 4 + c;
        const a = c < 2 ? x0 : x1;
        const b = c % 2 === 0 ? y0 : y1;
        this.starPos[v * 3] = x + this.camR.x * a + this.camU.x * b;
        this.starPos[v * 3 + 1] = y + this.camR.y * a + this.camU.y * b;
        this.starPos[v * 3 + 2] = z + this.camR.z * a + this.camU.z * b;
        this.starCol[v * 3] = col.r;
        this.starCol[v * 3 + 1] = col.g;
        this.starCol[v * 3 + 2] = col.b;
      }
    }
  }

  /** テストの 窓口用の ようす（毎回 新しく 作る。ゲームの 毎ステップでは 呼ばない） */
  snapshot(): TrailSnapshot {
    const n = this.n;
    const v3 = (a: Float64Array, j: number): Vec3 => ({ x: a[j * 3]!, y: a[j * 3 + 1]!, z: a[j * 3 + 2]! });
    const columns: TrailSnapshot['columns'] = [];
    const strips: TrailSnapshot['strips'] = [];
    const stars: Vec3[] = [];
    if (this.shown) {
      for (let j = 0; j <= this.nseg; j++) columns.push({ q: j / this.nseg, age: n - this.colT[j]!, tip: v3(this.colTip, j), inner: v3(this.colInner, j) });
      for (let j = 0; j < this.strips; j++) strips.push({ age: this.stripAge[j]!, fade: this.stripFade[j]! });
      for (let i = 0; i < this.nStars; i++) stars.push(v3(this.colTip, this.starAt[i]!));
    }
    const points: TrailSnapshot['points'] = [];
    for (let i = 0; i < this.np; i++) {
      const p = this.pts[i]!;
      points.push({ step: p.time, tau: p.tau, age: n - p.time, tip: { ...p.tip }, base: { ...p.base } });
    }
    const objects = (this.bandMesh.visible ? 1 : 0) + (this.starMesh.visible ? 1 : 0);
    return {
      visible: this.shown,
      item: this.item,
      tech: this.tech,
      points,
      tail: this.shown ? this.tail : null,
      head: this.shown ? this.head : null,
      columns,
      strips,
      segments: this.shown ? this.strips : 0,
      triangles: this.shown ? this.strips * BANDS * 2 + this.nStars * STAR_QUADS * 2 : 0,
      objects,
      color: this.style?.color ?? 0,
      glow: this.style?.glow ?? 0,
      stars,
    };
  }

  dispose(): void {
    this.bandMesh.removeFromParent();
    this.starMesh.removeFromParent();
    this.bandGeo.dispose();
    this.starGeo.dispose();
    (this.bandMesh.material as THREE.Material).dispose();
    (this.starMesh.material as THREE.Material).dispose();
  }
}
