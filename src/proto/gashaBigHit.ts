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
 * ダメージ = 最低 1（ふだんの 武器の 強さ × 部位の 倍率 − 部位の 防御力。gashaBigTuning.ts の hit.partMul・partDef）。1 回の 攻撃（1 振り・1 発の 波・1 回の 雷）で 1 回だけ。
 * 画面・DOM は 体力ゲージ（document が あるとき）だけ。数は ぜんぶ gashaBigTuning.ts。
 */
import { BoxGeometry, Mesh, MeshBasicMaterial, type Scene } from 'three';
import type { BladeShapeInfo, Vec3, YokaiRayHit } from '../contracts';
import { GHOST_BIG_BASE, GHOST_ID_SPAN } from '../combat/ghostIds';
import type { BigModel } from './gashaBig';
import { TUNE as T } from './gashaBigTuning';
import { HpBar } from './gashaBigHpBar';

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

export type Part = 'hand' | 'foreArm' | 'upperArm' | 'head' | 'core' | 'ribbon' | 'cloud' | 'body' | 'girl';

/** 箱の 名前 → 部位（gashaBig.ts の 当たりの 名前: hand*（指・親指も）・foreArm・upperArm・skull*（頭がいの よこ・ほお・あご・てっぺんも）・ribbon*・torso/spine/chest/neck/collar/shoulderCloth/hair* は 胴体・それ以外は 雲） */
export function partOf(name: string): Part {
  if (name === 'core') return 'core';
  if (name === 'girl') return 'girl';
  if (name.startsWith('hand')) return 'hand';
  if (name.startsWith('foreArm')) return 'foreArm';
  if (name.startsWith('upperArm')) return 'upperArm';
  if (name.startsWith('skull')) return 'head';
  if (name.startsWith('ribbon')) return 'ribbon';
  if (/^(torso|waist|spine|chest|neck|collar|shoulderCloth|hair)/.test(name)) return 'body';
  return 'cloud';
}

const round2 = (v: number): number => Math.round(v * 100 + 1e-7) / 100;

/** 部位の 倍率（表に なければ 0） */
export const mulOf = (part: string): number => Math.max(0, T.hit.partMul[part] ?? 0);

/** 部位の 防御力（受ける ダメージから ひく 数。表に なければ 0） */
export const defOf = (part: string): number => Math.max(0, T.hit.partDef[part] ?? 0);

/** ダメージ = 最低 1（武器の 強さ × 部位の 倍率 − 部位の 防御力）。倍率が 0 の 部位・強さが 0 いかは 0（当たらない） */
export function damageOf(part: string, amount: number): number {
  const mul = mulOf(part);
  if (!(mul > 0) || !(amount > 0)) return 0;
  return round2(Math.max(1, amount * mul - defOf(part)));
}

/** 仮の 妖怪 id の はじまり（本物の 妖怪の id と ぶつからない 大きい 数） */
export const BIG_ID_BASE = GHOST_BIG_BASE;

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
  damage(id: number, amount: number, from: Vec3, knock?: unknown, by?: unknown): number | void;
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
  /** コアに ダメージが 入った（ふり落とす 合図） */
  onCore?(): void;
  /** true の 間は コアが 無敵（当たっても ダメージ 0、はじかれた 火花だけ）。ふり落とし前の 予兆の 間 */
  coreGuard?(): boolean;
  /** とどめの あと(finish が core)コアを たたいた。数えて よければ true（数える 間かくは 呼んだ 側が 見る）。at = 当たった 点 */
  onCoreHit?(at: Vec3 | null): boolean;
  /** true の 間は 大きな 姿の 体・コアは ダメージ 0(少女の 間。「少女」の 部位だけ 通る)。はじいた 火花・音・バリアの 波紋だけ */
  bodyGuard?(): boolean;
  /** bodyGuard で はじいた(at = 当たった 点。なければ null)。バリアの 波紋・音に つなぐ */
  onDeflect?(at: Vec3 | null, part: string): void;
  /** NINJA-1: 刀（blade）・パンチ（ray。矢・マッチョの パンチは 除く）が 部位に 当たった（忍びの手甲の 追い打ち用）。波・雷・ドーム・追い打ち自身は 知らせない */
  onStrike?(info: { part: string; source: string }): void;
  /** 刀が ガラスの 雲に 当たった（ダメージの ある 部位に 当たらなかった とき）。当たった 点（世界の 座標） */
  onCloud?(at: Vec3): void;
  sources?: HitSources;
}

export interface LastHit { part: Part; mul: number; dealt: number; source: string; at: Vec3 | null; hp: number }

const SPARKS_MAX = 48;

/** 体力・倍率・怒る・火花・光る・体力ゲージ。1 つの からだに つき 1 つ（bind で からだを つなぐ） */
export class BigHit {
  maxHp = T.hit.hp;
  hp = T.hit.hp;
  last: LastHit | null = null;
  /** 当たった 回数（テスト用） */
  hits = 0;
  /** コアが 無敵の 間に はじいた 回数（テスト用） */
  deflects = 0;
  private boxes: readonly BoxLike[] = [];
  /** からだの 箱（bind で わたされた もの）。boxes = これ ＋ extra */
  private base: readonly BoxLike[] = [];
  /** 足す 箱 1 つ（座っている 少女。名前 girl。外から 毎コマ 場所を 更新される） */
  private extra: BoxLike | null = null;
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
  private bar: HpBar | null = null;
  private installed = false;
  /** 今の ray の 当たりが 矢か（パンチは knock を わたさない・矢は わたす） */
  private viaArrow = false;
  /** とどめの あとの モード: off = ふつう / lock = どこに 当たっても ダメージ 0 / core = コアだけ onCoreHit に 知らせる */
  private finish: 'off' | 'lock' | 'core' = 'off';
  /** コアの 当たりを 太らせる ぶん（ブロック。たおれた あと） */
  private coreReach = 0;

  constructor(private readonly env: HitEnv) {
    this.makeBar();
    this.install();
  }

  /** からだ（当たりの 箱）を つなぐ。体力は かえない（もどすのは reset） */
  bind(boxes: readonly BoxLike[], model: BigModel | null): void {
    this.base = boxes;
    this.rebuild();
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

  /** 箱の 一覧を 作りなおす（からだ ＋ 足した 箱） */
  private rebuild(): void {
    this.boxes = this.extra ? [...this.base, this.extra] : this.base;
    this.parts = this.boxes.map((b) => partOf(b.name));
  }

  /** 足す 箱を 入れる / 外す（座っている 少女）。箱の 中身は 持ち主が 毎コマ 更新する */
  setExtra(box: BoxLike | null): void {
    this.extra = box;
    this.rebuild();
  }

  /** 片づける（#293 まとめ）: 体力ゲージを 画面から はずし、当たりの 箱・火花・光りを 手ばなす。射線の 割りこみは 箱が 空なので 本物の まま 通る。reset() で また 作る */
  dismiss(): void {
    this.bar?.destroy();
    this.bar = null;
    this.base = [];
    this.extra = null;
    this.boxes = [];
    this.parts = [];
    this.mats = [];
    this.flash = 0;
    this.swingKey = null; this.swingDone = false;
    this.waveLast.clear(); this.waveDone.clear();
    for (const sp of this.sparks) { sp.left = 0; sp.mesh.visible = false; }
  }

  /** とどめの あとの モードを きめる */
  setFinish(mode: 'off' | 'lock' | 'core'): void {
    this.finish = mode;
  }

  /** コアの 当たりを この ぶん(ブロック)だけ 太らせる（刀・波が とどきやすい。たおれた あとだけ） */
  setCoreReach(r: number): void {
    this.coreReach = Math.max(0, r);
  }

  /** 火花を 出す（とどめの 一撃などで 大きく）。k = 数の 倍 */
  burst(at: Vec3, k = 1, color: number = T.hit.sparkColor): void {
    this.spark(at, color, k);
  }

  /** 体力を 満タンに もどす（調整表の hp を 読みなおす） */
  reset(): void {
    this.finish = 'off';
    this.coreReach = 0;
    this.maxHp = T.hit.hp;
    this.hp = this.maxHp;
    this.last = null;
    this.hits = 0;
    this.swingKey = null; this.swingDone = false;
    this.waveLast.clear(); this.waveDone.clear();
    this.makeBar();
  }

  // ------------------------------------------------------------ ダメージ
  /** 部位に ダメージ（武器の 強さ amount × 倍率）。実際に 与えた 数を 返す（倍率 0 なら 0 で、怒らない） */
  damage(part: string, amount: number, at: Vec3 | null = null, source = 'test'): number {
    if (this.finish !== 'off') return this.finishDamage(part, at);
    // 少女の 間: 体も コアも ダメージ 0(はじく 手ごたえだけ)。肩の 少女('girl')は 通る
    if (part !== 'girl' && mulOf(part) > 0 && this.env.bodyGuard?.()) {
      if (!at) {
        const i = this.parts.indexOf(part as Part);
        if (i >= 0) at = { x: this.boxes[i]!.c[0]!, y: this.boxes[i]!.c[1]!, z: this.boxes[i]!.c[2]! };
      }
      this.deflects++;
      if (at) this.spark(at, 0x9fe8ff, 0.5);
      this.env.onDeflect?.(at, part);
      this.env.sources?.sound?.();
      return 0;
    }
    if (part === 'core' && this.env.coreGuard?.()) {
      if (!at) { const i = this.parts.indexOf('core'); if (i >= 0) at = { x: this.boxes[i]!.c[0]!, y: this.boxes[i]!.c[1]!, z: this.boxes[i]!.c[2]! }; }
      this.deflects++;
      if (at) this.spark(at, 0x9fe8ff, 0.5);
      return 0;
    }
    const mul = mulOf(part);
    const dealt = damageOf(part, amount);
    if (dealt <= 0) return 0;
    this.hp = Math.max(0, round2(this.hp - dealt));
    this.hits++;
    this.last = { part: part as Part, mul, dealt, source, at: at ? { ...at } : null, hp: this.hp };
    if (source === 'blade' || (source === 'ray' && !this.viaArrow)) this.env.onStrike?.({ part, source });
    this.env.angry();
    if (part === 'core') this.env.onCore?.();
    if (!at) {
      const i = this.parts.indexOf(part as Part);
      if (i >= 0) at = { x: this.boxes[i]!.c[0]!, y: this.boxes[i]!.c[1]!, z: this.boxes[i]!.c[2]! };
    }
    if (at) this.spark(at);
    this.flash = 1;
    this.env.sources?.sound?.();
    this.showBar(true);
    return dealt;
  }

  /** とどめの あと: コアだけ 数える。ほかは 0 */
  private finishDamage(part: string, at: Vec3 | null): number {
    if (!at) {
      const i = this.parts.indexOf(part as Part);
      if (i >= 0) at = { x: this.boxes[i]!.c[0]!, y: this.boxes[i]!.c[1]!, z: this.boxes[i]!.c[2]! };
    }
    if (this.finish === 'core' && part === 'core' && this.env.onCoreHit?.(at)) {
      if (at) this.spark(at, 0xff8a60, 1.5);
      this.flash = 1;
      this.env.sources?.sound?.();
      return 1;
    }
    return 0;
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
    ym.damage = (id: number, amount: number, from: Vec3, knock?: unknown, by?: unknown): number | void => {
      if (id >= BIG_ID_BASE && id < BIG_ID_BASE + GHOST_ID_SPAN) {
        const i = id - BIG_ID_BASE;
        if (!this.boxes[i]) return 0;
        // NINJA-1: 矢（knock を わたす）・マッチョの パンチ（by = macho）は 手甲の 追い打ちに しない
        this.viaArrow = knock !== undefined || by === 'macho';
        try {
          return this.strike(i, amount, from, 'ray');
        } finally {
          this.viaArrow = false;
        }
      }
      return (dmgOrig as (...a: unknown[]) => number | void)(id, amount, from, knock, by);
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

  private reachOf(i: number): number {
    return this.coreReach > 0 && this.parts[i] === 'core' ? this.coreReach : 0;
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
      touched = (i) => boxTouchesCapsule(this.boxes[i]!, sh.from, sh.to, sh.radius + m + this.reachOf(i));
    } else {
      const sh = b.shape;
      from = sh.center;
      touched = (i) => boxTouchesFan(this.boxes[i]!, sh, m + this.reachOf(i));
    }
    const i = this.pick(touched, from);
    if (i < 0) { this.breakCloud(touched, from); return; }
    this.swingDone = true; // 1 振りに つき 1 回
    // ダメージが 入らなかった(少女の 間・とどめの あと)ときは、そこに ガラスの 雲が あれば 割る(はじかれて ガラスまで 割れなく ならない ように)
    if (this.strike(i, b.damage, from, 'blade') <= 0) this.breakCloud(touched, from);
  }

  /** ガラスの 雲に 当たって いれば 割る(1 振りに つき 1 回) */
  private breakCloud(touched: (i: number) => boolean, from: Vec3): void {
    if (!this.env.onCloud) return;
    let bj = -1, bd = Infinity;
    for (let k = 0; k < this.boxes.length; k++) {
      if (this.parts[k] !== 'cloud' || !touched(k)) continue;
      const d = distToBox(this.boxes[k]!, from.x, from.y, from.z);
      if (d < bd) { bj = k; bd = d; }
    }
    if (bj >= 0) { this.swingDone = true; this.env.onCloud(closestOnBox(this.boxes[bj]!, from.x, from.y, from.z, { x: 0, y: 0, z: 0 })); }
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
        const i = this.pick((k) => boxTouchesCapsule(this.boxes[k]!, from, to, w.radius + T.hit.waveMargin + this.reachOf(k)), to);
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
  private spark(at: Vec3, color: number = T.hit.sparkColor, k = 1): void {
    const H = T.hit;
    if (H.sparkCount <= 0) return;
    if (!this.sparkGeo) { this.sparkGeo = new BoxGeometry(1, 1, 1); this.sparkMat = new MeshBasicMaterial({ color: H.sparkColor, fog: false }); }
    this.sparkMat!.color.setHex(color);
    const cnt = Math.max(2, Math.round(H.sparkCount * k));
    for (let n = 0; n < cnt; n++) {
      let sp = this.sparks.length < SPARKS_MAX ? undefined : this.sparks.find((q) => q.left <= 0);
      if (!sp) {
        if (this.sparks.length >= SPARKS_MAX) sp = this.sparks[0]!;
        else { const mesh = new Mesh(this.sparkGeo, this.sparkMat!); mesh.visible = false; this.env.scene.add(mesh); sp = { mesh, vx: 0, vy: 0, vz: 0, left: 0 }; this.sparks.push(sp); }
      }
      // 上むき 半球に ちらす（決まった 並びで 乱数は つかわない: 見た目だけ）
      const a = (n / cnt) * Math.PI * 2 + this.hits * 0.7, e = 0.35 + 0.5 * ((n * 37) % 10) / 10;
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

  /** 体力ゲージを 作る（調整表の barStyle の 案で）。document が なければ 作らない */
  private makeBar(): void {
    if (typeof document === 'undefined') return;
    this.bar?.destroy();
    this.bar = new HpBar();
    this.showBar(false, true);
  }

  private showBar(damaged = false, instant = false): void {
    this.bar?.set(this.hp, this.maxHp, damaged, instant);
  }
}
