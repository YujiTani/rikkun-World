import * as THREE from 'three';
import type { BladeTech, Vec3 } from '../contracts';
import { spawnDelayOf, type SlashStep } from './nijiSlashModel';
import { DOT, FxBatch, FxView, frameOf, hash, makePts, newFrame, rgbOf, toWorld, type LocalFrame } from './fxPaint';

/**
 * 風神剣 v3: 振るたびに 風の 帯が 体の まわりを 1〜1.5 周 まわって 消える（つき 1 本・きりあげ 2 本・けさ 3 本。
 * ミント・ラベンダー・水色）。2026-10-23 オーナー決定（docs/decisions/2026-10-23-legend-fx-element.md 追記 4）。白い 斬撃の 上の 層。
 * 試作 art/LEGEND-FX/proto/fx3-fujin.js。今の 真空波（windWaveFx）は そのまま のこす。
 * 絵 = 筆の かすれの 帯（よこ 128 × たて 24）を 3 色 × [からだ・ふち] と 無地の 白 1 行 を 1 まいに まとめた 絵（コードで 作る）。
 * 帯・芯・ちりは ぜんぶ 1 つの 形（ふつう重ね）= **描画 1**。体の むこうがわの 帯は 深さで キャラに かくれ、さらに うすく する。
 * シード付き（hash）・毎ステップ new しない・点滅しない（明るさは 年れいだけで きまる）。
 */
const TILT = [
  { phi: 0.12, psi: 0.12, th0: -0.6 },
  { phi: 0.42, psi: 0.85, th0: -1.9 },
  { phi: -0.55, psi: 0.4, th0: 0.5 },
];
const RA = [1.4, 1.45, 1.6];
const TECH_IDX: Record<BladeTech, number> = { thrust: 0, kiriage: 1, kesa: 2 };
const N = 20; // 帯の 点の 数（試作は 44。三角形を へらす）
const DUST = 3;
const LIFE = 24;
const MAX_INST = 3;
/** 風の 三角形の 上限（段が 重なっても） */
const MAX_TRIS = 400;

interface Pal {
  row: number;
  core: [number, number, number];
  edge: [number, number, number];
  dust: [number, number, number];
  /** 絵の 色（からだ 4 段 + ふち） */
  tone: string[];
}
const PALS: Pal[] = [
  { row: 0, core: rgbOf('#F4FFFB'), edge: rgbOf('#14675C'), dust: rgbOf('#7FE0C0'), tone: ['#F4FFFB', '#BFF5E3', '#7FE0C0', '#2BB39A', '#14675C'] },
  { row: 1, core: rgbOf('#FFFFFF'), edge: rgbOf('#3A2578'), dust: rgbOf('#C9B0FF'), tone: ['#FFFFFF', '#EDE3FF', '#C9B0FF', '#8E6BE0', '#3A2578'] },
  { row: 2, core: rgbOf('#FFFFFF'), edge: rgbOf('#1E5E9A'), dust: rgbOf('#A9E2FF'), tone: ['#FFFFFF', '#E3F6FF', '#A9E2FF', '#4FB4F0', '#1E5E9A'] },
];
const TW = 128;
const TH = 24;
const ROWS = 3 * 2 * TH + 4; // 3 色 × [からだ・ふち] + 白 4 行
const WHITE_Y = 3 * 2 * TH;

/** 絵（Canvas）を 作る。Nearest・1/32 の 点 */
function makeAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = TW;
  c.height = ROWS;
  const g = c.getContext('2d')!;
  const im = g.createImageData(TW, ROWS);
  const put = (x: number, y: number, hex: string, a = 1): void => {
    const i = (y * TW + x) * 4;
    im.data[i] = parseInt(hex.slice(1, 3), 16);
    im.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    im.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    im.data[i + 3] = Math.round(a * 255);
  };
  for (const pal of PALS) {
    const seed = pal.row + 1;
    const mask = new Float32Array(TW * TH).fill(-1);
    for (let x = 0; x < TW; x++) {
      const n = 0.5 + 0.5 * Math.sin(x * 0.21 + seed) * Math.cos(x * 0.07 + seed * 2);
      const e = Math.round(9.6 * (0.6 + 0.4 * n * (hash(x >> 1, seed) * 0.5 + 0.75)));
      for (let y = 0; y < TH; y++) {
        const dy = Math.abs(y - 11.5);
        const edgeFrac = dy / Math.max(1, e);
        let on = dy < e;
        if (on && dy > e - 3 && hash(x >> 1, y, seed) > 0.9 - (dy - (e - 3)) * 0.28) on = false;
        if (on && hash(x, y >> 1, seed, 5) > 0.985) on = false;
        mask[y * TW + x] = on ? edgeFrac : -1;
      }
    }
    const y0 = pal.row * 2 * TH;
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        const f = mask[y * TW + x]!;
        if (f < 0) continue;
        const lite = hash(x >> 2, y, seed, 9) > 0.8 ? 0.12 : 0;
        put(x, y0 + y, f < 0.28 + lite ? pal.tone[0]! : f < 0.5 + lite ? pal.tone[1]! : f < 0.78 ? pal.tone[2]! : pal.tone[3]!);
      }
    }
    const on = (x: number, y: number): boolean => x >= 0 && x < TW && y >= 0 && y < TH && mask[y * TW + x]! >= 0;
    for (let y = 0; y < TH; y++) {
      for (let x = 0; x < TW; x++) {
        if (on(x, y)) continue;
        let hit = false;
        for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2; dx++) if (on(x + dx, y + dy)) { hit = true; break; }
        if (hit) put(x, y0 + TH + y, pal.tone[4]!);
      }
    }
  }
  for (let y = WHITE_Y; y < ROWS; y++) for (let x = 0; x < TW; x++) put(x, y, '#FFFFFF');
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
/** 行 y0（上から）〜 y0 + TH の 絵の たての 範囲（v）。ふちの 1/2 点 内がわ */
const vOf = (y: number): number => 1 - (y + 0.5) / ROWS;

interface Inst {
  idx: number;
  uDeg: number;
  reach: number;
  wait: number;
  T: number;
  seed: number;
  active: boolean;
  pos: () => Vec3;
  /** 予算の 数えおわり（capBudget の 作業用） */
  counted: boolean;
}

export interface FujinRequest {
  tech: BladeTech;
  step: SlashStep;
  uDeg: number;
  pos: () => Vec3;
  reach?: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const easeOut = (x: number): number => 1 - (1 - clamp01(x)) * (1 - clamp01(x));

export class FujinOrbitFx {
  private readonly view = new FxView();
  private readonly batch: FxBatch;
  private readonly atlas: THREE.CanvasTexture;
  private readonly insts: Inst[] = [];
  private seedN = 0;
  /** 動きを へらす 設定（ちりの 数を 半分に） */
  private reducedNow = false;
  private readonly f: LocalFrame = newFrame();
  private readonly eul = new THREE.Euler();
  private readonly mat = new THREE.Matrix4();
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  // 帯 3 本ぶんの 点・はば・明るさ（作りなおさない）
  private readonly pts: Float32Array[] = [makePts(N), makePts(N), makePts(N)];
  private readonly wid: Float32Array[] = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  private readonly alp: Float32Array[] = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
  private readonly core: Float32Array = new Float32Array(N);
  private readonly bandOn = [false, false, false];
  private readonly bandRep = [1, 1, 1];
  private readonly bandAl0 = [0, 0, 0];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.atlas = makeAtlas();
    // 体の むこうがわの 帯は キャラに かくれる（深さを 見る）。書きこみは しない
    this.batch = new FxBatch(scene, { additive: false, map: this.atlas, depthTest: true, renderOrder: 8, maxVerts: 9 * 6 * (N - 1) * 3 + 9 * DUST * 12 + 600 });
    for (let i = 0; i < MAX_INST; i++) this.insts.push({ idx: 0, uDeg: 0, reach: 2.2, wait: 0, T: 0, seed: 0, active: false, pos: () => ({ x: 0, y: 0, z: 0 }), counted: false });
  }

  /** 注文（techStart で 呼ぶ）。白い 斬撃の 決めの コマと 同じ ステップに はじまる */
  queue(req: FujinRequest): void {
    let s = this.insts.find((i) => !i.active);
    if (!s) s = this.insts.reduce((a, b) => (a.T > b.T ? a : b));
    s.active = true;
    s.idx = TECH_IDX[req.tech];
    s.uDeg = req.uDeg;
    s.reach = req.reach ?? 2.2;
    s.wait = spawnDelayOf(req.tech, req.step) + 2;
    s.T = 0;
    s.seed = ++this.seedN;
    s.pos = req.pos;
  }

  cancel(): void {
    for (const i of this.insts) if (i.active && i.wait > 0) i.active = false;
  }

  /** 1 ステップ ごと（カメラが 動いた あと） */
  step(reduced = false): void {
    this.reducedNow = reduced;
    this.view.update(this.camera);
    this.batch.begin();
    this.capBudget();
    for (const s of this.insts) {
      if (!s.active) continue;
      if (s.wait > 0) {
        s.wait--;
        continue;
      }
      this.draw(s);
      s.T++;
      if (s.T > LIFE) s.active = false;
    }
    this.batch.end();
  }

  /** 段が 重なって 三角形が 400 を こえそうなら、古い 方から 消す（新しい 段を のこす） */
  private capBudget(): void {
    const per = (N - 1) * 6 + (this.reducedNow ? Math.ceil(DUST / 2) : DUST) * 4;
    let used = 0;
    // 新しい（T が 小さい）順に 予算を 配る。まだ はじまって いない 物（wait > 0）は 数えない
    for (;;) {
      let best: Inst | null = null;
      for (const s of this.insts) if (s.active && s.wait <= 0 && !s.counted && (!best || s.T < best.T)) best = s;
      if (!best) break;
      best.counted = true;
      const cost = (best.idx + 1) * per;
      if (used + cost > MAX_TRIS) best.active = false;
      else used += cost;
    }
    for (const s of this.insts) s.counted = false;
  }

  private draw(s: Inst): void {
    const idx = s.idx, tt = s.T;
    const t = TILT[idx]!;
    const n = idx + 1;
    const p = s.pos();
    const f = this.f;
    f.bx = p.x; f.by = p.y; f.bz = p.z;
    frameOf(s.uDeg, f);
    const prog = easeOut(tt / 20) * 0.75 + clamp01(tt / 20) * 0.25;
    const S = 3.5 * Math.min(1, (tt + 1) / 4) * (1 - smooth((tt - 13) / 9));
    if (S < 0.15) return;
    const fade = tt > 18 ? 1 - (tt - 18) / 6 : 1;
    const eye = this.view.eye;
    for (let j = 0; j < 3; j++) this.bandOn[j] = false;
    for (let j = 0; j < n; j++) {
      const ok = 1 - j * 0.1, owk = 1 - j * 0.08, ooff = (j * 6.283185) / n, orot = j, ody = j * 0.06;
      this.eul.set(t.psi + orot * 0.3, 0, t.phi + orot * 0.25, 'ZXY');
      this.mat.makeRotationFromEuler(this.eul);
      this.e1.set(1, 0, 0).applyMatrix4(this.mat);
      this.e2.set(0, 0, 1).applyMatrix4(this.mat);
      const ra = RA[idx]! * ok * (s.reach / 2.2), rb = ra * 0.72;
      const cy = 1.0 + ody, cz = 0.15;
      const head = t.th0 + ooff + 6.283185 * 1.3 * prog;
      const P = this.pts[j]!, Wd = this.wid[j]!, Al = this.alp[j]!;
      // 帯の 中心の 世界の 位置（かくれ・うすくする 目安）
      toWorld(f, 0, cy, cz, P, 0);
      const dC = Math.hypot(P[0]! - eye.x, P[1]! - eye.y, P[2]! - eye.z);
      const wmax = 0.42 * owk * (idx === 2 ? 1.15 : 1);
      for (let k = 0; k < N; k++) {
        const th = head - S * (1 - k / (N - 1));
        const r = 1 + 0.06 * Math.sin(th * 2 + ooff);
        const lx = (this.e1.x * Math.cos(th) * ra + this.e2.x * Math.sin(th) * rb) * r;
        const ly = cy + (this.e1.y * Math.cos(th) * ra + this.e2.y * Math.sin(th) * rb) * r;
        const lz = cz + (this.e1.z * Math.cos(th) * ra + this.e2.z * Math.sin(th) * rb) * r;
        toWorld(f, lx, ly, lz, P, k);
        const u = k / (N - 1);
        Wd[k] = wmax * 1.25 * Math.max(0.03, Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9)) * (1 + 0.1 * Math.sin(k * 1.9 + ooff));
        const far = Math.hypot(P[k * 3]! - eye.x, P[k * 3 + 1]! - eye.y, P[k * 3 + 2]! - eye.z) > dC + 0.15 ? 0.6 : 1;
        Al[k] = far * fade;
      }
      this.bandOn[j] = true;
      this.bandRep[j] = Math.max(1, (S * ra * 1.2) / 4);
      this.bandAl0[j] = (s.seed + j) * 0.13;
    }
    const b = this.batch;
    const white = WHITE_Y + 1;
    const dust = this.reducedNow ? Math.ceil(DUST / 2) : DUST;
    for (let pass = 0; pass < 4; pass++) {
      for (let j = 0; j < n; j++) {
        if (!this.bandOn[j]) continue;
        const pal = PALS[j]!;
        const P = this.pts[j]!, Wd = this.wid[j]!, Al = this.alp[j]!;
        const y0 = pal.row * 2 * TH;
        if (pass === 0) {
          // ふち（こい 色）
          b.strip(this.view, P, N, Wd, this.scaled(Al, 0.95), [1, 1, 1], vOf(y0 + TH + TH - 1), vOf(y0 + TH), this.bandRep[j]!, this.bandAl0[j]!);
        } else if (pass === 1) {
          b.strip(this.view, P, N, Wd, Al, [1, 1, 1], vOf(y0 + TH - 1), vOf(y0), this.bandRep[j]!, this.bandAl0[j]!);
        } else if (pass === 2) {
          // 芯（細い 白）
          for (let k = 0; k < N; k++) this.core[k] = Wd[k]! * 0.22;
          b.strip(this.view, P, N, this.core, this.scaled(Al, 0.9), pal.core, vOf(white), vOf(white), 1, 0);
        } else {
          // ちり（こい ふち ＋ 色）
          for (let q = 0; q < dust; q++) {
            const k = Math.floor(hash(q, s.seed + j, idx) * (N - 4)) + 2;
            const dy = 0.1 * Math.sin(q + tt * 0.3);
            const a = Al[k]!;
            b.quad(this.view, P[k * 3]!, P[k * 3 + 1]! + dy, P[k * 3 + 2]!, DOT * 3.2, pal.edge, 0.85 * a, 0.5, vOf(white));
            b.quad(this.view, P[k * 3]!, P[k * 3 + 1]! + dy, P[k * 3 + 2]!, DOT * 2, pal.dust, a, 0.5, vOf(white));
          }
        }
      }
    }
  }

  private readonly tmpA = new Float32Array(N);
  private scaled(a: Float32Array, m: number): Float32Array {
    for (let k = 0; k < N; k++) this.tmpA[k] = a[k]! * m;
    return this.tmpA;
  }

  /** 読みこみ中に 材質と 絵を 先に 作る */
  warmUp(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): void {
    this.batch.warmUp(renderer, camera, scene);
    renderer.initTexture(this.atlas);
  }

  info(): { draws: number; tris: number; active: number } {
    return { draws: this.batch.visible() ? 1 : 0, tris: this.batch.triangles(), active: this.insts.filter((i) => i.active && i.wait <= 0).length };
  }

  dispose(): void {
    this.batch.dispose(this.scene);
  }
}
