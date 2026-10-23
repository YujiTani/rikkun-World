/**
 * #293 試作: 大きい がしゃどくろが プレイヤーの 攻撃を 受ける 口（体力・部位の 倍率・怒る・火花・光る・体力ゲージ）。
 *
 * 口は 2 つ:
 *  ・矢・パンチは 妖怪への「線の 当たり（raycast）」と「ダメージ（damage）」を 通る ので、YokaiManager の その 2 つに 割りこむ
 *    （がしゃどくろの 箱に 当たる 線は 仮の id（BIG_ID_BASE + 箱の 番号）の 妖怪に 当たった ことに して、ダメージが 来たら ここで 受ける）。
 *    ダメージの 数は 矢・パンチ 本来の 数が そのまま 来る。
 *  ・刀・真空波・らせん・雷・ドームは 妖怪の 一覧（円柱）で 当たりを 見て いる ので、がしゃどくろには 当たらない。
 *    そこで 毎ステップ 「いまの 当たりの 形」を 聞いて（HitSources。つなぎは gashaBigHitWire.ts）、箱と 重なったら ここで 受ける。
 *
 * ダメージ = ふだんの 武器の 強さ × 部位の 倍率（gashaBigTuning.ts の hit.partMul）。1 回の 攻撃（1 振り・1 発の 波・1 回の 雷）で 1 回だけ。
 * 画面・DOM は 体力ゲージ（document が あるとき）だけ。数は ぜんぶ gashaBigTuning.ts。
 */
import { BoxGeometry, Mesh, MeshBasicMaterial, type Scene } from 'three';
import type { BladeShapeInfo, Vec3, YokaiRayHit } from '../contracts';
import type { BigModel } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';

/** 当たりの 箱（世界の 座標。BigActor の 箱と おなじ 形） */
export interface BoxLike {
  name: string;
  /** 中心 */
  c: ArrayLike<number>;
  /** 3 本の 軸（長さ 1。x0 y0 z0 x1 y1 z1 x2 y2 z2） */
  ax: ArrayLike<number>;
  /** 軸ごとの はんぶんの 大きさ */
  half: ArrayLike<number>;
}

export type Part = 'hand' | 'foreArm' | 'upperArm' | 'head' | 'core' | 'ribbon' | 'cloud';

/** 箱の 名前 → 部位（gashaBig.ts の 当たりの 名前: hand・foreArm・upperArm・skull・ribbon*・それ以外は 雲） */
export function partOf(name: string): Part {
  if (name.startsWith('hand')) return 'hand';
  if (name.startsWith('foreArm')) return 'foreArm';
  if (name.startsWith('upperArm')) return 'upperArm';
  if (name === 'skull') return 'head';
  if (name.startsWith('ribbon')) return 'ribbon';
  return 'cloud';
}

/** 部位の 倍率（表に なければ 0） */
export const mulOf = (part: string): number => Math.max(0, T.hit.partMul[part] ?? 0);

/** 仮の 妖怪 id の はじまり（本物の 妖怪の id と ぶつからない 大きい 数） */
export const BIG_ID_BASE = 900_000_000;

// ---------------------------------------------------------------- 形の 計算（箱 ＝ 回転した はこ）
type P3 = [number, number, number];

function local(b: BoxLike, x: number, y: number, z: number, out: P3): P3 {
  const dx = x - b.c[0]!, dy = y - b.c[1]!, dz = z - b.c[2]!;
  out[0] = dx * b.ax[0]! + dy * b.ax[1]! + dz * b.ax[2]!;
  out[1] = dx * b.ax[3]! + dy * b.ax[4]! + dz * b.ax[5]!;
  out[2] = dx * b.ax[6]! + dy * b.ax[7]! + dz * b.ax[8]!;
  return out;
}
const tl: P3 = [0, 0, 0];

/** 点 → 箱の いちばん 近い 点（箱の 中なら その 点） */
export function closestOnBox(b: BoxLike, x: number, y: number, z: number, out: Vec3): Vec3 {
  local(b, x, y, z, tl);
  const u = Math.max(-b.half[0]!, Math.min(b.half[0]!, tl[0]));
  const v = Math.max(-b.half[1]!, Math.min(b.half[1]!, tl[1]));
  const w = Math.max(-b.half[2]!, Math.min(b.half[2]!, tl[2]));
  out.x = b.c[0]! + u * b.ax[0]! + v * b.ax[3]! + w * b.ax[6]!;
  out.y = b.c[1]! + u * b.ax[1]! + v * b.ax[4]! + w * b.ax[7]!;
  out.z = b.c[2]! + u * b.ax[2]! + v * b.ax[5]! + w * b.ax[8]!;
  return out;
}

/** 点 → 箱までの 距離（中なら 0） */
export function distToBox(b: BoxLike, x: number, y: number, z: number): number {
  local(b, x, y, z, tl);
  const du = Math.max(Math.abs(tl[0]) - b.half[0]!, 0);
  const dv = Math.max(Math.abs(tl[1]) - b.half[1]!, 0);
  const dw = Math.max(Math.abs(tl[2]) - b.half[2]!, 0);
  return Math.hypot(du, dv, dw);
}

const lo: P3 = [0, 0, 0];
const ld: P3 = [0, 0, 0];

/** 線（向き d は 長さ 1）→ 箱の 面までの 距離。当たらなければ null（はじめから 箱の 中なら 0） */
export function rayBox(b: BoxLike, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number | null {
  local(b, ox, oy, oz, lo);
  ld[0] = dx * b.ax[0]! + dy * b.ax[1]! + dz * b.ax[2]!;
  ld[1] = dx * b.ax[3]! + dy * b.ax[4]! + dz * b.ax[5]!;
  ld[2] = dx * b.ax[6]! + dy * b.ax[7]! + dz * b.ax[8]!;
  let t0 = 0, t1 = max;
  for (let k = 0; k < 3; k++) {
    const h = b.half[k]!;
    if (Math.abs(ld[k]!) < 1e-9) {
      if (Math.abs(lo[k]!) > h) return null;
      continue;
    }
    let a = (-h - lo[k]!) / ld[k]!, c = (h - lo[k]!) / ld[k]!;
    if (a > c) { const t = a; a = c; c = t; }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

/** 線分 a → b の 太さ radius の カプセルと 箱が ふれるか（0.25 ブロックごとに 点を 見る） */
export function boxTouchesCapsule(b: BoxLike, a: Vec3, c: Vec3, radius: number): boolean {
  const len = Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.25));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (distToBox(b, a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t, a.z + (c.z - a.z) * t) <= radius) return true;
  }
  return false;
}

/** 球と 箱が ふれるか */
export function boxTouchesSphere(b: BoxLike, c: Vec3, r: number): boolean {
  return distToBox(b, c.x, c.y, c.z) <= r;
}

type Fan = Extract<BladeShapeInfo, { kind: 'fan' }>;

/** 扇形の 柱（刀の けさ・きりあげ）と 箱が ふれるか。箱の 中の 点を 0.75 ブロックごとに 見る（rMin は 自分の 体の ぶんなので 見ない。BladeSystem と おなじ） */
export function boxTouchesFan(b: BoxLike, f: Fan, margin = 0): boolean {
  // 大きさの 見積もり（箱を 入れる 球）で 先に はじく
  const rad = Math.hypot(b.half[0]!, b.half[1]!, b.half[2]!);
  if (Math.hypot(b.c[0]! - f.center.x, b.c[2]! - f.center.z) > f.rMax + margin + rad) return false;
  if (b.c[1]! + rad < f.yMin - margin || b.c[1]! - rad > f.yMax + margin) return false;
  const cosA = Math.cos((f.halfAngleDeg * Math.PI) / 180);
  const nU = Math.min(10, Math.max(1, Math.ceil((b.half[0]! * 2) / 0.75))), nV = Math.min(10, Math.max(1, Math.ceil((b.half[1]! * 2) / 0.75))), nW = Math.min(10, Math.max(1, Math.ceil((b.half[2]! * 2) / 0.75)));
  for (let i = 0; i <= nU; i++) for (let j = 0; j <= nV; j++) for (let k = 0; k <= nW; k++) {
    const u = (i / nU * 2 - 1) * b.half[0]!, v = (j / nV * 2 - 1) * b.half[1]!, w = (k / nW * 2 - 1) * b.half[2]!;
    const x = b.c[0]! + u * b.ax[0]! + v * b.ax[3]! + w * b.ax[6]!;
    const y = b.c[1]! + u * b.ax[1]! + v * b.ax[4]! + w * b.ax[7]!;
    const z = b.c[2]! + u * b.ax[2]! + v * b.ax[5]! + w * b.ax[8]!;
    if (y < f.yMin - margin || y > f.yMax + margin) continue;
    const dx = x - f.center.x, dz = z - f.center.z;
    const d = Math.hypot(dx, dz);
    if (d > f.rMax + margin) continue;
    if (d < 1e-6) return true;
    const cos = (dx * f.forward.x + dz * f.forward.z) / (d * (Math.hypot(f.forward.x, f.forward.z) || 1));
    // 近い 点は 角度の ずれを ゆるす（体の はば ぶん）
    if (cos >= cosA || (margin > 0 && d <= margin)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- 当たりの 形を 聞く 口（つなぎは gashaBigHitWire.ts）
/** 妖怪の 世界の うち、割りこむ 2 つ */
export interface YokaiWorldLike {
  raycast(origin: Vec3, dir: Vec3, maxDistance: number): YokaiRayHit | null;
  damage(id: number, amount: number, from: Vec3, knock?: unknown): number | void;
}

export interface HitSources {
  /** 刀の いまの 当たりの 形（当たりの コマ だけ。ほかは null）。damage は その わざの ダメージ（武器の 強さ × わざの 倍率）、swing は 1 振りを 見分ける 名前、frame は わざの 何コマ目 */
  blade?(): { shape: BladeShapeInfo; damage: number; swing: string; frame: number } | null;
  /** 飛んで いる 真空波・らせん（id で 見分ける） */
  waves?(): readonly { id: number; position: Vec3; radius: number; damage: number }[];
  /** 今の ステップに 落ちた 雷（球） */
  strikes?(): readonly { center: Vec3; radius: number; damage: number }[];
  /** 虹の ドーム（ない ときは null）。everySteps ごとに 1 回 当たる */
  dome?(): { center: Vec3; radius: number; damage: number; everySteps: number } | null;
  /** 矢・パンチの 口を つなぐ 相手（YokaiManager） */
  yokai?(): YokaiWorldLike | null;
  /** 当たった 音 */
  sound?(): void;
}

export interface HitEnv {
  scene: Scene;
  /** 怒らせる（白目 → 赤い 目。20 秒 カウントを はじめから） */
  angry(): void;
  sources?: HitSources;
}

export interface LastHit { part: Part; mul: number; dealt: number; source: string; at: Vec3 | null; hp: number }

const round2 = (v: number): number => Math.round(v * 100 + 1e-7) / 100;
const SPARKS_MAX = 48;

/** 体力・倍率・怒る・火花・光る・体力ゲージ。1 つの からだに つき 1 つ（bind で からだを つなぐ） */
export class BigHit {
  maxHp = T.hit.hp;
  hp = T.hit.hp;
  last: LastHit | null = null;
  /** 当たった 回数（テスト用） */
  hits = 0;
  private boxes: readonly BoxLike[] = [];
  private parts: Part[] = [];
  private mats: { m: MeshBasicMaterial; r: number; g: number; b: number }[] = [];
  private flash = 0;
  private stepNo = 0;
  private swingKey: string | null = null;
  private swingFrame = 0;
  private swingDone = false;
  private waveLast = new Map<number, Vec3>();
  private waveDone = new Set<number>();
  private domeLast = -1e9;
  private sparks: { mesh: Mesh; vx: number; vy: number; vz: number; left: number }[] = [];
  private sparkGeo: BoxGeometry | null = null;
  private sparkMat: MeshBasicMaterial | null = null;
  private bar: { root: HTMLElement; fill: HTMLElement; text: HTMLElement } | null = null;
  private barShown = -1;
  private installed = false;

  constructor(private readonly env: HitEnv) {
    this.makeBar();
    this.install();
  }

  /** からだ（当たりの 箱）を つなぐ。体力は かえない（もどすのは reset） */
  bind(boxes: readonly BoxLike[], model: BigModel | null): void {
    this.boxes = boxes;
    this.parts = boxes.map((b) => partOf(b.name));
    this.mats = [];
    if (model) {
      const seen = new Set<MeshBasicMaterial>();
      model.group.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        const mat = m.material as MeshBasicMaterial;
        if (seen.has(mat) || mat === model.eyes || mat === model.eyeHalo || mat.transparent) return;
        seen.add(mat);
        this.mats.push({ m: mat, r: mat.color.r, g: mat.color.g, b: mat.color.b });
      });
    }
    this.flash = 0;
  }

  /** 体力を 満タンに もどす（調整表の hp を 読みなおす） */
  reset(): void {
    this.maxHp = T.hit.hp;
    this.hp = this.maxHp;
    this.last = null;
    this.hits = 0;
    this.swingKey = null; this.swingDone = false;
    this.waveLast.clear(); this.waveDone.clear();
    this.showBar(true);
  }

  // ------------------------------------------------------------ ダメージ
  /** 部位に ダメージ（武器の 強さ amount × 倍率）。実際に 与えた 数を 返す（倍率 0 なら 0 で、怒らない） */
  damage(part: string, amount: number, at: Vec3 | null = null, source = 'test'): number {
    const mul = mulOf(part);
    if (!(mul > 0) || !(amount > 0)) return 0;
    const dealt = round2(amount * mul);
    this.hp = Math.max(0, round2(this.hp - dealt));
    this.hits++;
    this.last = { part: part as Part, mul, dealt, source, at: at ? { ...at } : null, hp: this.hp };
    this.env.angry();
    if (!at) {
      const i = this.parts.indexOf(part as Part);
      if (i >= 0) at = { x: this.boxes[i]!.c[0]!, y: this.boxes[i]!.c[1]!, z: this.boxes[i]!.c[2]! };
    }
    if (at) this.spark(at);
    this.flash = 1;
    this.env.sources?.sound?.();
    this.showBar();
    return dealt;
  }

  /** 箱の 番号に ダメージ。at = 火花の 場所（なければ 箱の いちばん 近い 点） */
  private strike(i: number, amount: number, from: Vec3, source: string): number {
    const at = closestOnBox(this.boxes[i]!, from.x, from.y, from.z, { x: 0, y: 0, z: 0 });
    return this.damage(this.parts[i]!, amount, at, source);
  }

  /** 当たった 箱の 中で いちばん 倍率が 高い もの（同じなら 近い もの）。当たりが なければ -1 */
  private pick(touched: (i: number) => boolean, from: Vec3): number {
    let best = -1, bm = 0, bd = Infinity;
    for (let i = 0; i < this.boxes.length; i++) {
      const m = mulOf(this.parts[i]!);
      if (!(m > 0) || !touched(i)) continue;
      const d = distToBox(this.boxes[i]!, from.x, from.y, from.z);
      if (m > bm || (m === bm && d < bd)) { best = i; bm = m; bd = d; }
    }
    return best;
  }

  // ------------------------------------------------------------ 矢・パンチ（YokaiManager の 線の 当たりと ダメージに 割りこむ）
  private install(): void {
    const ym = this.env.sources?.yokai?.() ?? null;
    if (!ym || this.installed) return;
    this.installed = true;
    const rayOrig = ym.raycast.bind(ym);
    const dmgOrig = ym.damage.bind(ym);
    ym.raycast = (origin: Vec3, dir: Vec3, max: number): YokaiRayHit | null => {
      const real = rayOrig(origin, dir, max);
      let bi = -1, bt = real ? real.distance : max;
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      for (let i = 0; i < this.boxes.length; i++) {
        if (!(mulOf(this.parts[i]!) > 0)) continue;
        const t = rayBox(this.boxes[i]!, origin.x, origin.y, origin.z, dir.x / len, dir.y / len, dir.z / len, bt);
        if (t !== null && (bi < 0 ? t <= bt : t < bt)) { bi = i; bt = t; }
      }
      return bi >= 0 ? { id: BIG_ID_BASE + bi, kind: 'nurikabe', distance: bt } : real;
    };
    ym.damage = (id: number, amount: number, from: Vec3, knock?: unknown): number | void => {
      if (id >= BIG_ID_BASE && id < BIG_ID_BASE + 1_000_000) {
        const i = id - BIG_ID_BASE;
        return this.boxes[i] ? this.strike(i, amount, from, 'ray') : 0;
      }
      return dmgOrig(id, amount, from, knock);
    };
  }

  // ------------------------------------------------------------ 毎ステップ（刀・波・雷・ドームの 形を 聞く）
  step(dt: number): void {
    this.stepNo++;
    const s = this.env.sources;
    if (s && this.boxes.length > 0) {
      this.stepBlade(s);
      this.stepWaves(s);
      this.stepStrikes(s);
      this.stepDome(s);
    }
    this.stepFx(dt);
  }

  private stepBlade(s: HitSources): void {
    const b = s.blade?.() ?? null;
    if (!b) { this.swingKey = null; return; }
    if (b.swing !== this.swingKey || b.frame < this.swingFrame) { this.swingKey = b.swing; this.swingDone = false; }
    this.swingFrame = b.frame;
    if (this.swingDone) return;
    const m = T.hit.swordMargin;
    let from: Vec3, touched: (i: number) => boolean;
    if (b.shape.kind === 'capsule') {
      const sh = b.shape;
      from = sh.from;
      touched = (i) => boxTouchesCapsule(this.boxes[i]!, sh.from, sh.to, sh.radius + m);
    } else {
      const sh = b.shape;
      from = sh.center;
      touched = (i) => boxTouchesFan(this.boxes[i]!, sh, m);
    }
    const i = this.pick(touched, from);
    if (i < 0) return;
    this.swingDone = true; // 1 振りに つき 1 回
    this.strike(i, b.damage, from, 'blade');
  }

  private stepWaves(s: HitSources): void {
    const ws = s.waves?.();
    if (!ws) return;
    const alive = new Set<number>();
    for (const w of ws) {
      alive.add(w.id);
      const prev = this.waveLast.get(w.id) ?? w.position;
      if (!this.waveDone.has(w.id)) {
        const from = { ...prev }, to = { ...w.position };
        const i = this.pick((k) => boxTouchesCapsule(this.boxes[k]!, from, to, w.radius + T.hit.waveMargin), to);
        if (i >= 0) { this.waveDone.add(w.id); this.strike(i, w.damage, to, 'wave'); }
      }
      this.waveLast.set(w.id, { ...w.position });
    }
    for (const id of [...this.waveLast.keys()]) if (!alive.has(id)) { this.waveLast.delete(id); this.waveDone.delete(id); }
  }

  private stepStrikes(s: HitSources): void {
    const ks = s.strikes?.();
    if (!ks) return;
    for (const k of ks) {
      const i = this.pick((n) => boxTouchesSphere(this.boxes[n]!, k.center, k.radius), k.center);
      if (i >= 0) this.strike(i, k.damage, k.center, 'strike');
    }
  }

  private stepDome(s: HitSources): void {
    const d = s.dome?.() ?? null;
    if (!d) { this.domeLast = -1e9; return; }
    if (this.stepNo - this.domeLast < d.everySteps) return;
    const i = this.pick((n) => boxTouchesSphere(this.boxes[n]!, d.center, d.radius), d.center);
    if (i < 0) return;
    this.domeLast = this.stepNo;
    this.strike(i, d.damage, d.center, 'dome');
  }

  // ------------------------------------------------------------ 火花・光る・体力ゲージ
  private spark(at: Vec3): void {
    const H = T.hit;
    if (H.sparkCount <= 0) return;
    if (!this.sparkGeo) { this.sparkGeo = new BoxGeometry(1, 1, 1); this.sparkMat = new MeshBasicMaterial({ color: H.sparkColor, fog: false }); }
    this.sparkMat!.color.setHex(H.sparkColor);
    for (let n = 0; n < H.sparkCount; n++) {
      let sp = this.sparks.length < SPARKS_MAX ? undefined : this.sparks.find((q) => q.left <= 0);
      if (!sp) {
        if (this.sparks.length >= SPARKS_MAX) sp = this.sparks[0]!;
        else { const mesh = new Mesh(this.sparkGeo, this.sparkMat!); mesh.visible = false; this.env.scene.add(mesh); sp = { mesh, vx: 0, vy: 0, vz: 0, left: 0 }; this.sparks.push(sp); }
      }
      // 上むき 半球に ちらす（決まった 並びで 乱数は つかわない: 見た目だけ）
      const a = (n / H.sparkCount) * Math.PI * 2 + this.hits * 0.7, e = 0.35 + 0.5 * ((n * 37) % 10) / 10;
      const sp2 = H.sparkSpeed * (0.6 + 0.4 * (((n * 53) % 10) / 10));
      sp.vx = Math.cos(a) * Math.cos(e) * sp2; sp.vz = Math.sin(a) * Math.cos(e) * sp2; sp.vy = Math.sin(e) * sp2;
      sp.left = H.sparkSec;
      sp.mesh.position.set(at.x, at.y, at.z);
      sp.mesh.scale.setScalar(H.sparkSize);
      sp.mesh.visible = true;
    }
  }

  private stepFx(dt: number): void {
    const H = T.hit;
    for (const sp of this.sparks) {
      if (sp.left <= 0) continue;
      sp.left -= dt;
      if (sp.left <= 0) { sp.mesh.visible = false; continue; }
      sp.vy -= 14 * dt;
      sp.mesh.position.x += sp.vx * dt; sp.mesh.position.y += sp.vy * dt; sp.mesh.position.z += sp.vz * dt;
      sp.mesh.scale.setScalar(H.sparkSize * Math.max(0.1, sp.left / H.sparkSec));
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt / Math.max(1e-3, H.flashSec));
      const k = 1 + H.flashBoost * this.flash;
      for (const q of this.mats) q.m.color.setRGB(q.r * k, q.g * k, q.b * k);
    }
  }

  private makeBar(): void {
    if (typeof document === 'undefined') return;
    const root = document.createElement('div');
    root.id = 'gashaBigHp';
    const H = T.hit;
    root.style.cssText = `position:fixed;top:10px;left:50%;transform:translateX(-50%);width:min(${H.barWidthVw}vw,${H.barMaxPx}px);z-index:40;pointer-events:none;font:700 15px/1.2 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000;text-align:center`;
    const name = document.createElement('div');
    name.textContent = 'がしゃどくろ';
    const track = document.createElement('div');
    track.style.cssText = 'margin-top:3px;height:14px;border:2px solid #fff;border-radius:8px;background:rgba(0,0,0,.55);overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:100%;background:linear-gradient(#ff7a7a,#d93a3a);transition:width .15s';
    track.appendChild(fill);
    const text = document.createElement('div');
    text.style.cssText = 'font-size:11px;font-weight:400;margin-top:1px';
    root.append(name, track, text);
    document.body.appendChild(root);
    this.bar = { root, fill, text };
    this.showBar(true);
  }

  private showBar(force = false): void {
    if (!this.bar) return;
    if (!force && this.barShown === this.hp) return;
    this.barShown = this.hp;
    const r = this.maxHp > 0 ? this.hp / this.maxHp : 0;
    this.bar.fill.style.width = `${Math.round(r * 1000) / 10}%`;
    this.bar.text.textContent = `${Math.ceil(this.hp)} / ${this.maxHp}`;
    this.bar.root.dataset.hp = String(this.hp);
  }
}
