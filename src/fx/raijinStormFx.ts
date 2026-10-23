import type * as THREE from 'three';
import type { BladeTech, BladeTechFrames, Vec3 } from '../contracts';
import { TRAIL_K, pathPoint, timeToTau } from './bladeTrailModel';
import { spawnDelayOf, type SlashStep } from './nijiSlashModel';
import { DOT, FxBatch, FxView, hash, makePts, rgbOf } from './fxPaint';

/**
 * 雷神剣 v3「R2 黄色」（2026-10-23 オーナー決定。docs/decisions/2026-10-23-legend-fx-element.md）。白い 斬撃の 上の 層。
 * 段ごとに 強くなる 雷: つき = 刀身の 電気 ＋ パチパチ 火花 ＋ 振った 弧の 軌跡 / きりあげ = ＋ 軌跡から 枝 3 本 /
 * けさ = ＋ 枝 5 本 ＋ 体の まわりの 稲妻の 輪。試作 art/LEGEND-FX/proto/fx3-raijin.js（見本 v3/raijin.gif の 右）。
 * 刀の さき・もとは 刃の 通り道（bladeTrailModel の データ）から 体の 位置で 出す（キャラの 刀と 同じ 動き）。
 * 描画 2（ふつう重ね = こい ふち・からだ / 加算 = にじみ・芯）。折れ方は シード付き（hash）。毎ステップ new しない。
 * 当てた 時の 火花は 白い 斬撃（slashFx）が 出すので ここでは 何も しない。
 */
const W = rgbOf('#FFF8DC');
const B = rgbOf('#FFE98A');
const GLOW = rgbOf('#FFC83A');
const UNDER = rgbOf('#2E2160');
/** 窓の 長さ（ステップ）= 当たりの 長さ */
const WINDOW: Record<BladeTech, number> = { thrust: 4, kiriage: 3, kesa: 6 };
const IDX: Record<BladeTech, number> = { thrust: 0, kiriage: 1, kesa: 2 };
const BRANCHES = [0, 3, 5];
const MAX_INST = 3;
const FADE = 8;
const TRAIL_N = 14;
const RING_N = 28;

interface Inst {
  idx: number;
  tech: BladeTech;
  uDeg: number;
  startup: number;
  /** わざの 窓の はじまりから 数えた ステップ（はじまる 前は 負） */
  T: number;
  seed: number;
  active: boolean;
  pos: () => Vec3;
  tips: Float32Array;
  nTips: number;
}

export interface RaijinStormRequest {
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

export class RaijinStormFx {
  private readonly view = new FxView();
  private readonly under: FxBatch;
  private readonly glow: FxBatch;
  private readonly insts: Inst[] = [];
  private seedN = 0;
  private readonly tmp: number[] = [0, 0, 0];
  private readonly coarse = makePts(10);
  private readonly bolt1 = makePts(24);
  private readonly bolt2 = makePts(12);
  private readonly bolt3 = makePts(12);
  private readonly trailP = makePts(TRAIL_N + 2);
  private readonly trailW = new Float32Array(TRAIL_N + 2);
  private readonly ringP = makePts(RING_N + 2);
  private readonly ringW = new Float32Array(RING_N + 2);
  private readonly skip = new Uint8Array(24);
  private readonly tip = new Float32Array(3);
  private readonly base = new Float32Array(3);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly lengths: (tech: BladeTech) => BladeTechFrames,
  ) {
    // 深さは 見ない（刀・体の うえに 重ねる）。白い 斬撃（5・6）の 上
    this.under = new FxBatch(scene, { additive: false, depthTest: false, renderOrder: 8, maxVerts: 16000 });
    this.glow = new FxBatch(scene, { additive: true, depthTest: false, renderOrder: 9, maxVerts: 16000 });
    for (let i = 0; i < MAX_INST; i++) {
      this.insts.push({ idx: 0, tech: 'thrust', uDeg: 0, startup: 0, T: 0, seed: 0, active: false, pos: () => ({ x: 0, y: 0, z: 0 }), tips: makePts(8), nTips: 0 });
    }
  }

  /** 注文（techStart で 呼ぶ）。窓の はじまり = 白い 斬撃の 決めの コマ = techStart から (spawnDelay + 2) ステップ */
  queue(req: RaijinStormRequest): void {
    let s = this.insts.find((i) => !i.active);
    if (!s) s = this.insts.reduce((a, b) => (a.T > b.T ? a : b));
    s.active = true;
    s.idx = IDX[req.tech];
    s.tech = req.tech;
    s.uDeg = req.uDeg;
    s.startup = spawnDelayOf(req.tech, req.step) + 2;
    s.T = -s.startup;
    s.seed = ++this.seedN * 17;
    s.pos = req.pos;
    s.nTips = 0;
  }

  /** わざが やめに なった（出ている 雷は ふつうに 消える） */
  cancel(): void {
    for (const i of this.insts) if (i.active && i.T < 0) i.active = false;
  }

  /** 1 ステップ ごと（カメラが 動いた あと） */
  step(): void {
    this.view.update(this.camera);
    this.under.begin();
    this.glow.begin();
    for (const s of this.insts) {
      if (!s.active) continue;
      this.draw(s);
      s.T++;
      if (s.T - WINDOW[s.tech] > FADE + 10) s.active = false;
    }
    this.under.end();
    this.glow.end();
  }

  /** 刃の さき・もとの 世界の 位置（BladeTrail と 同じ 式。体は 今の 位置） */
  private sword(s: Inst, f: number, which: 'tip' | 'base', out: Float32Array): void {
    const tau = timeToTau(s.tech, this.lengths(s.tech), f);
    pathPoint(s.tech, tau, which, this.tmp);
    const p = s.pos();
    const u = (s.uDeg * Math.PI) / 180;
    const r = this.tmp[0]! * TRAIL_K, up = this.tmp[1]! * TRAIL_K, fw = this.tmp[2]! * TRAIL_K;
    out[0] = p.x + r * Math.cos(u) + fw * Math.sin(u);
    out[1] = p.y + up;
    out[2] = p.z + r * Math.sin(u) - fw * Math.cos(u);
  }

  private bolt(p: Float32Array, n: number, k: number, a: number, skipOn: boolean): void {
    const sk = skipOn ? this.skip : null;
    this.under.ribbon(this.view, p, n, 6 * DOT * k + 3 * DOT, UNDER, 0.92 * a, false, sk);
    this.glow.ribbon(this.view, p, n, 14 * DOT * k, GLOW, 0.2 * a, false, sk);
    this.under.ribbon(this.view, p, n, 3.4 * DOT * k, B, 0.95 * a, false, sk);
    this.glow.ribbon(this.view, p, n, 1.6 * DOT * k, W, a, false, sk);
  }

  /** a → b を ぎざぎざに（nc 区間を 2 つに 分けて 2 nc + 1 点）。out に 書く */
  private fine(out: Float32Array, ax: number, ay: number, az: number, bx: number, by: number, bz: number, nc: number, amp: number, seed: number): number {
    const c = this.coarse;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const ev = this.view.eye;
    for (let k = 0; k <= nc; k++) {
      let x = ax + (dx * k) / nc, y = ay + (dy * k) / nc, z = az + (dz * k) / nc;
      if (k > 0 && k < nc) {
        let vx = x - ev.x, vy = y - ev.y, vz = z - ev.z;
        const vl = Math.hypot(vx, vy, vz) || 1;
        vx /= vl; vy /= vl; vz /= vl;
        let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
        const sl = Math.hypot(sx, sy, sz);
        if (sl < 1e-6) { sx = this.view.right.x; sy = this.view.right.y; sz = this.view.right.z; } else { sx /= sl; sy /= sl; sz /= sl; }
        const r = hash(k, seed) * 2 - 1;
        const m = (k % 2 ? 1 : -1) * amp * (0.35 + 0.65 * Math.abs(r)) * (hash(k, seed, 9) > 0.85 ? 1.9 : 1);
        x += sx * m; y += sy * m; z += sz * m;
        const al = ((hash(k, seed, 5) - 0.5) * amp * 0.8) / dl;
        x += dx * al; y += dy * al; z += dz * al;
      }
      c[k * 3] = x; c[k * 3 + 1] = y; c[k * 3 + 2] = z;
    }
    let n = 0;
    for (let k = 0; k < nc; k++) {
      out[n * 3] = c[k * 3]!; out[n * 3 + 1] = c[k * 3 + 1]!; out[n * 3 + 2] = c[k * 3 + 2]!; n++;
      const mx = (c[k * 3]! + c[k * 3 + 3]!) / 2, my = (c[k * 3 + 1]! + c[k * 3 + 4]!) / 2, mz = (c[k * 3 + 2]! + c[k * 3 + 5]!) / 2;
      const j = (hash(k * 4 + 2, seed, 8) - 0.5) * 0.04;
      out[n * 3] = mx + this.view.right.x * j; out[n * 3 + 1] = my + this.view.right.y * j; out[n * 3 + 2] = mz + this.view.right.z * j; n++;
    }
    out[n * 3] = c[nc * 3]!; out[n * 3 + 1] = c[nc * 3 + 1]!; out[n * 3 + 2] = c[nc * 3 + 2]!;
    return n + 1;
  }

  /** カメラの 面の 向き（角 ang）の 単位ベクトル */
  private camDirX(ang: number): number { return this.view.right.x * Math.cos(ang) + this.view.up.x * Math.sin(ang); }
  private camDirY(ang: number): number { return this.view.right.y * Math.cos(ang) + this.view.up.y * Math.sin(ang); }
  private camDirZ(ang: number): number { return this.view.right.z * Math.cos(ang) + this.view.up.z * Math.sin(ang); }

  private dot(x: number, y: number, z: number, size: number, a: number): void {
    this.under.quad(this.view, x, y, z, size + DOT * 0.9, UNDER, a * 0.9);
    this.glow.quad(this.view, x, y, z, size, W, a);
  }

  private draw(s: Inst): void {
    const T = s.T, idx = s.idx, st = idx + 1;
    const L = WINDOW[s.tech];
    const A = T - L;
    const f = T + s.startup + 1; // わざの ステップ（techStart = 1）
    const p = s.pos();
    // ① 刀身に まとわりつく 電気と パチパチ 火花
    if (T >= -6 && T <= L + 3) {
      this.sword(s, f, 'tip', this.tip);
      this.sword(s, f, 'base', this.base);
      let dx = this.tip[0]! - this.base[0]!, dy = this.tip[1]! - this.base[1]!, dz = this.tip[2]! - this.base[2]!;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      const ex = this.tip[0]! + dx * 0.35, ey = this.tip[1]! + dy * 0.35, ez = this.tip[2]! + dz * 0.35;
      const a0 = smooth((T + 6) / 3) * (1 - smooth((T - L) / 3));
      const bx = this.base[0]! + dx * 0.1, by = this.base[1]! + dy * 0.1, bz = this.base[2]! + dz * 0.1;
      for (let q = 0; q < 1 + st; q++) {
        const n = this.fine(this.bolt1, bx, by, bz, ex, ey, ez, 5, 0.05 + 0.02 * q, s.seed + T * 7 + q * 31);
        this.bolt(this.bolt1, n, 0.5 + 0.1 * st, a0, false);
      }
      for (let q = 0; q < 5 + 3 * st; q++) {
        const at = hash(q, s.seed, idx);
        const age = (T + 20 + q) % 6;
        const ang = hash(q, 9, idx, Math.floor((T + 20) / 6)) * 6.28;
        const rr = 0.08 + 0.12 * age;
        this.dot(bx + (ex - bx) * at + this.camDirX(ang) * rr, by + (ey - by) * at + this.camDirY(ang) * rr, bz + (ez - bz) * at + this.camDirZ(ang) * rr, DOT * (q % 2 ? 1.6 : 2.4), a0 * (1 - age / 7));
      }
    }
    // 窓の 間、刃の さきを きろく（弧の 軌跡の もと。そのときの 体の 位置で）
    if (T >= 0 && T <= L && s.nTips === T) {
      this.sword(s, f, 'tip', this.tip);
      s.tips[T * 3] = this.tip[0]!; s.tips[T * 3 + 1] = this.tip[1]!; s.tips[T * 3 + 2] = this.tip[2]!;
      s.nTips = T + 1;
    }
    // ② 振った 弧に 残る 太い 軌跡
    if (T >= 1 && A <= FADE && s.nTips >= 2) {
      const fade = A > 0 ? 1 - A / FADE : 1;
      const m = this.catmull(s.tips, s.nTips, this.trailP, TRAIL_N);
      for (let k = 0; k < m; k++) {
        const u = k / (m - 1);
        this.trailW[k] = 0.3 * Math.max(0.12, Math.sin(Math.PI * clamp01(u * 0.9 + 0.08))) + DOT * 3;
      }
      this.under.ribbon(this.view, this.trailP, m, this.trailW, UNDER, 0.9 * fade);
      for (let k = 0; k < m; k++) this.trailW[k] = 0.6 * Math.max(0.12, Math.sin(Math.PI * clamp01((k / (m - 1)) * 0.9 + 0.08)));
      this.glow.ribbon(this.view, this.trailP, m, this.trailW, GLOW, 0.28 * fade, true);
      for (let k = 0; k < m; k++) this.trailW[k] = 0.22 * Math.max(0.12, Math.sin(Math.PI * clamp01((k / (m - 1)) * 0.9 + 0.08)));
      this.under.ribbon(this.view, this.trailP, m, this.trailW, B, fade);
      for (let k = 0; k < m; k++) this.trailW[k] = 0.07 * Math.max(0.12, Math.sin(Math.PI * clamp01((k / (m - 1)) * 0.9 + 0.08)));
      this.glow.ribbon(this.view, this.trailP, m, this.trailW, W, fade);
      // ③ 軌跡から 外へ はしる 枝（きりあげ 3・けさ 5）
      const nb = BRANCHES[idx]!, ps = Math.floor(Math.min(T, L + 6) / 2);
      const known = (s.nTips - 1) / L;
      for (let b = 0; b < nb; b++) {
        const u = ((b + 0.6) / nb) * 0.85 + 0.08;
        if (u > known) continue;
        const k = Math.min(m - 1, Math.round(u * (m - 1)));
        const ox = this.trailP[k * 3]!, oy = this.trailP[k * 3 + 1]!, oz = this.trailP[k * 3 + 2]!;
        let ox2 = ox - p.x, oy2 = oy - (p.y + 1.0), oz2 = oz - p.z;
        const ol = Math.hypot(ox2, oy2, oz2) || 1;
        ox2 /= ol; oy2 /= ol; oz2 /= ol;
        const ang = hash(b, s.seed) * 6.28;
        let dx = ox2 + this.camDirX(ang) * 0.5, dy = oy2 + this.camDirY(ang) * 0.5, dz = oz2 + this.camDirZ(ang) * 0.5;
        const dl = Math.hypot(dx, dy, dz) || 1;
        const len = 0.9 + 0.5 * hash(b, 4);
        dx = (dx / dl) * len; dy = (dy / dl) * len; dz = (dz / dl) * len;
        const n = this.fine(this.bolt2, ox, oy, oz, ox + dx, oy + dy, oz + dz, 4, 0.1, b * 13 + ps * 5 + idx + s.seed);
        if (A > 0) for (let j = 0; j < n - 1; j++) this.skip[j] = hash(j, b, A) > 0.85 - A * 0.08 ? 1 : 0;
        this.bolt(this.bolt2, n, 0.55, fade, A > 0);
        if (hash(b, 7) > 0.4) {
          const kk = Math.floor(n * 0.5);
          const bx = this.bolt2[kk * 3]!, by = this.bolt2[kk * 3 + 1]!, bz = this.bolt2[kk * 3 + 2]!;
          const a2 = b * 2.1;
          const n2 = this.fine(this.bolt3, bx, by, bz, bx + this.camDirX(a2) * 0.35, by + this.camDirY(a2) * 0.35, bz + this.camDirZ(a2) * 0.35, 2, 0.06, b * 7 + ps + s.seed);
          if (A > 0) for (let j = 0; j < n2 - 1; j++) this.skip[j] = hash(j, b, A, 2) > 0.8 - A * 0.08 ? 1 : 0;
          this.bolt(this.bolt3, n2, 0.35, fade * 0.9, A > 0);
        }
      }
    }
    // ④ 体の まわりの 稲妻の 輪（けさ）
    if (idx === 2 && T >= L - 2 && T <= L + 16) this.drawRing(s, T, L, p);
  }

  /** 点の ならび（x, y, z）を なめらかな 曲線に（Catmull-Rom）。out に m 点 */
  private catmull(src: Float32Array, n: number, out: Float32Array, samples: number): number {
    const segs = n - 1;
    const total = Math.max(2, Math.min(samples, segs * 4));
    for (let i = 0; i < total; i++) {
      const g = (i / (total - 1)) * segs;
      const k = Math.min(segs - 1, Math.floor(g));
      const t = g - k, t2 = t * t, t3 = t2 * t;
      const i0 = Math.max(0, k - 1), i1 = k, i2 = k + 1, i3 = Math.min(segs, k + 2);
      for (let c = 0; c < 3; c++) {
        const p0 = src[i0 * 3 + c]!, p1 = src[i1 * 3 + c]!, p2 = src[i2 * 3 + c]!, p3 = src[i3 * 3 + c]!;
        out[i * 3 + c] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      }
    }
    return total;
  }

  private drawRing(s: Inst, T: number, L: number, p: Vec3): void {
    const v = this.view;
    const t = T - (L - 2);
    // fw = right × up（カメラの 前の 反対）
    const fx = v.right.y * v.up.z - v.right.z * v.up.y, fy = v.right.z * v.up.x - v.right.x * v.up.z, fz = v.right.x * v.up.y - v.right.y * v.up.x;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const cr = Math.cos(0.25), sr = Math.sin(0.25);
    const e1x = v.right.x * cr + v.up.x * sr, e1y = v.right.y * cr + v.up.y * sr, e1z = v.right.z * cr + v.up.z * sr;
    const b2x = v.up.x * cr - v.right.x * sr, b2y = v.up.y * cr - v.right.y * sr, b2z = v.up.z * cr - v.right.z * sr;
    const c55 = Math.cos(0.55), s55 = Math.sin(0.55);
    const e2x = b2x * c55 + (fx / fl) * s55, e2y = b2y * c55 + (fy / fl) * s55, e2z = b2z * c55 + (fz / fl) * s55;
    const u = (s.uDeg * Math.PI) / 180;
    const cx = p.x + Math.sin(u) * 0.15, cy = p.y + 1.1, cz = p.z - Math.cos(u) * 0.15;
    const ra = 1.45, rb = 1.05;
    const prog = clamp01(t / 6), fade = t > 12 ? 1 - (t - 12) / 5 : 1, th0 = -1.0;
    const span = 6.283 * prog, tail = t > 8 ? 6.283 * smooth((t - 8) / 8) : 0;
    if (span - tail <= 0.3) return;
    const n = RING_N;
    for (let k = 0; k <= n; k++) {
      const th = th0 + tail + ((span - tail) * k) / n;
      const ca = Math.cos(th) * ra, sa = Math.sin(th) * rb;
      this.ringP[k * 3] = cx + e1x * ca + e2x * sa;
      this.ringP[k * 3 + 1] = cy + e1y * ca + e2y * sa;
      this.ringP[k * 3 + 2] = cz + e1z * ca + e2z * sa;
    }
    const m = n + 1;
    const prof = (k: number): number => Math.max(0.2, Math.sin(Math.PI * clamp01((k / n) * 0.95 + 0.03)));
    for (let k = 0; k < m; k++) this.ringW[k] = 0.2 * prof(k) + DOT * 3;
    this.under.ribbon(this.view, this.ringP, m, this.ringW, UNDER, 0.9 * fade);
    for (let k = 0; k < m; k++) this.ringW[k] = 0.55 * Math.max(0.2, Math.sin(Math.PI * (k / n)));
    this.glow.ribbon(this.view, this.ringP, m, this.ringW, GLOW, 0.3 * fade, true);
    for (let k = 0; k < m; k++) this.ringW[k] = 0.16 * prof(k);
    this.under.ribbon(this.view, this.ringP, m, this.ringW, B, fade);
    for (let k = 0; k < m; k++) this.ringW[k] = 0.06 * prof(k);
    this.glow.ribbon(this.view, this.ringP, m, this.ringW, W, fade);
    // 輪に そって 走る 細い 稲妻（1 つ おきに ふる）と 枝 3 本
    const half = Math.floor(T / 2);
    for (let k = 1; k < n; k += 2) {
      const a = k - 1, b = k + 1;
      const tx = this.ringP[b * 3]! - this.ringP[a * 3]!, ty = this.ringP[b * 3 + 1]! - this.ringP[a * 3 + 1]!, tz = this.ringP[b * 3 + 2]! - this.ringP[a * 3 + 2]!;
      let dx = this.ringP[k * 3]! - v.eye.x, dy = this.ringP[k * 3 + 1]! - v.eye.y, dz = this.ringP[k * 3 + 2]! - v.eye.z;
      const dl = Math.hypot(dx, dy, dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;
      let sx = ty * dz - tz * dy, sy = tz * dx - tx * dz, sz = tx * dy - ty * dx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      const j = (hash(k, half) - 0.5) * 0.22;
      this.ringP[k * 3] += sx * j; this.ringP[k * 3 + 1] += sy * j; this.ringP[k * 3 + 2] += sz * j;
    }
    this.bolt(this.ringP, m, 0.4, 0.85 * fade, false);
    for (let q = 0; q < 3; q++) {
      const k = Math.min(n, Math.floor(n * (0.2 + 0.3 * q)));
      const x = this.ringP[k * 3]!, y = this.ringP[k * 3 + 1]!, z = this.ringP[k * 3 + 2]!;
      const ang = q * 2.3 + 1;
      const n2 = this.fine(this.bolt3, x, y, z, x + this.camDirX(ang) * 0.6, y + this.camDirY(ang) * 0.6, z + this.camDirZ(ang) * 0.6, 3, 0.07, q * 11 + half + s.seed);
      this.bolt(this.bolt3, n2, 0.4, 0.9 * fade, false);
    }
    // 足もの 火花
    for (let q = 0; q < 10; q++) {
      const age = (t + q * 3) % 9;
      this.dot(cx + Math.cos(q * 1.7) * 0.5, p.y + 0.04 + age * 0.05, cz + Math.sin(q * 2.3) * 0.5, DOT * 2, fade * (1 - age / 10));
    }
  }

  info(): { draws: number; tris: number; active: number } {
    return {
      draws: (this.under.visible() ? 1 : 0) + (this.glow.visible() ? 1 : 0),
      tris: this.under.triangles() + this.glow.triangles(),
      active: this.insts.filter((i) => i.active && i.T >= 0).length,
    };
  }

  dispose(): void {
    this.under.dispose(this.scene);
    this.glow.dispose(this.scene);
  }
}
