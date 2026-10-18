import type { AnimalEvent, AnimalFxRecord, AnimalMark, AnimalView, SwingReason, Vec3 } from '../contracts';
import { playAnimal, type AnimalSoundName } from './animalSounds';
import type { SoundFx } from './sound';

/**
 * LIVE-1（にわとり）の 音・つぶ・頭の 上の ハート（仕様 §3.3・§3.6・§3.7）。Three.js なし の 計算の 係。
 * 描くのは `src/animals/models/AnimalRenderer.ts`（`write()` で 1 つの Points に 書く）。
 * つなぎ込みは 毎ステップ: `fx.onEvents(animals.events())` → `fx.step(views, eye)`。
 * 乱数は シード つき（同じ 操作なら 同じ つぶ）。毎ステップ new しない。
 */
export const ANIMAL_FX = {
  /** 頭の 上の ハートが 出る 近さ（水平。設定 animalLookDist の 初期値） */
  lookDist: 6,
  /** 声（コッコッ）が 聞こえる 近さ */
  cluckRange: 16,
  /** 声の 間 = 300〜600 ステップ（にわとり ごとに 決まる） */
  cluckMin: 300,
  cluckSpan: 301,
  /** 頭の 上の ハート: 3 つ。同時に 出る のは やせいの 数（3）まで */
  headHearts: 3,
  headHeartGap: 0.23,
  /** 頭の 上 0.3 マス（にわとり の 高さ 0.80 の 上） */
  headHeartY: 0.8 + 0.3,
  headHeartSize: 0.26,
  /** はじけ: はじめて 8・2 わ目から 5 */
  burstFirst: 8,
  burstNext: 5,
  /** 紙ふぶき: はじめての なかま だけ。1 回 60 つぶ まで */
  confetti: 60,
  puffEach: 6,
  sparkle: 4,
  // ---- 版 3.2（§3.3・§3.7）
  /** あしあと・おなかいっぱい の しるし が 出る 近さ（水平） */
  markDist: 8,
  /** ついてくる おわり の けむり */
  puffFollowEnd: 4,
  /** あみ の はっぱ・とれた ときの キラッ */
  leaf: 4,
  sparkleBug: 3,
  /** あしあと の まるい 数の きざみ（のこり > 12,000 → 3、> 6,000 → 2、> 0 → 1） */
  stepsHigh: 12000,
  stepsMid: 6000,
  /** のこり この 以下 の あしあと は ゆっくり うすく・こく（1 しゅう 60 ステップ） */
  stepsFade: 1800,
  fadePeriod: 60,
  /** おなかいっぱい（初期値 600 ステップ。しるし が 小さく なって いく 目安） */
  fullTicks: 600,
  /** あみ: ふって から むし が とび出す まで・とんで くる 長さ（ステップ。§2.4） */
  bugPop: 10,
  bugFly: 20,
  /** パタパタ の 音の 間（ステップ） */
  flutterGap: 16,
  flutterRange: 16,
} as const;

/** つぶの 絵の 番号（描く 側の 絵の 並びと そろえる。8 まい 並び） */
export const TILE = { heartFull: 0, heartEmpty: 1, star: 2, dot: 3, footFull: 4, footEmpty: 5, belly: 6 } as const;
/** 描く 側 の 絵 の 数（`atlasTexture` の 横の 枚数） */
export const TILE_COUNT = 8;

const CAP = 256;
const DT = 1 / 60;

type Kind = 1 | 2 | 3 | 4 | 5; // 1 ハート 2 紙ふぶき 3 けむり 4 キラッ 5 はっぱ

const CONFETTI_COLORS = [0xe8553d, 0xf2b33d, 0x5fbf6a, 0x4a90d9, 0xf08fb4, 0xf28a2e] as const;

/** つぶの 一覧（struct of arrays のリング）。時間で 消える */
export class AnimalParticles {
  readonly cap = CAP;
  private readonly kind = new Uint8Array(CAP);
  private readonly px = new Float32Array(CAP);
  private readonly py = new Float32Array(CAP);
  private readonly pz = new Float32Array(CAP);
  private readonly vx = new Float32Array(CAP);
  private readonly vy = new Float32Array(CAP);
  private readonly vz = new Float32Array(CAP);
  private readonly age = new Int16Array(CAP);
  private readonly life = new Int16Array(CAP); // 0 = 使っていない
  private readonly size = new Float32Array(CAP);
  private readonly rgb = new Uint32Array(CAP);
  private cursor = 0;

  spawn(kind: Kind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, rgb: number): void {
    let slot = -1;
    for (let k = 0; k < CAP; k++) {
      const i = (this.cursor + k) % CAP;
      if (this.life[i] === 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) slot = this.cursor; // いっぱい: いちばん 古い 所に 上書き
    this.cursor = (slot + 1) % CAP;
    this.kind[slot] = kind;
    this.px[slot] = x;
    this.py[slot] = y;
    this.pz[slot] = z;
    this.vx[slot] = vx;
    this.vy[slot] = vy;
    this.vz[slot] = vz;
    this.age[slot] = 0;
    this.life[slot] = life;
    this.size[slot] = size;
    this.rgb[slot] = rgb;
  }

  /** 1 ステップ */
  step(): void {
    for (let i = 0; i < CAP; i++) {
      if (this.life[i] === 0) continue;
      if (++this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        continue;
      }
      const k = this.kind[i];
      if (k === 2) this.vy[i] -= 7 * DT; // 紙ふぶき: 落ちる
      if (k === 5) this.vy[i] -= 4 * DT; // はっぱ: ひらひら 落ちる
      if (k === 2 || k === 1 || k === 5) {
        const d = k === 2 ? 0.985 : k === 5 ? 0.95 : 0.97; // 空気の ていこう
        this.vx[i] *= d;
        this.vz[i] *= d;
      }
      if (k === 1) this.vy[i] *= 0.985;
      this.px[i] += this.vx[i] * DT;
      this.py[i] += this.vy[i] * DT;
      this.pz[i] += this.vz[i] * DT;
    }
  }

  active(kind?: Kind): number {
    let n = 0;
    for (let i = 0; i < CAP; i++) if (this.life[i] !== 0 && (kind === undefined || this.kind[i] === kind)) n++;
    return n;
  }

  clear(): void {
    this.life.fill(0);
  }

  /** `out` に 書く。戻り値 = 書いた 数 */
  write(out: ParticleOut, start: number, cap: number): number {
    let n = start;
    for (let i = 0; i < CAP && n < cap; i++) {
      if (this.life[i] === 0) continue;
      const t = this.age[i] / this.life[i];
      const k = this.kind[i];
      let s = this.size[i];
      let tile: number = TILE.dot;
      if (k === 1) {
        tile = TILE.heartFull;
        if (t > 0.6) s *= 1 - (t - 0.6) / 0.4;
      } else if (k === 2) {
        if (t > 0.75) s *= 1 - (t - 0.75) / 0.25;
      } else if (k === 3) {
        s *= 0.6 + 1.2 * Math.sin(Math.PI * Math.min(1, t * 0.8 + 0.1));
      } else if (k === 5) {
        if (t > 0.6) s *= 1 - (t - 0.6) / 0.4;
      } else {
        tile = TILE.star;
        if (t > 0.5) s *= 1 - (t - 0.5) / 0.5;
      }
      const j = n * 3;
      out.pos[j] = this.px[i];
      out.pos[j + 1] = this.py[i];
      out.pos[j + 2] = this.pz[i];
      const c = this.rgb[i];
      out.col[j] = ((c >> 16) & 255) / 255;
      out.col[j + 1] = ((c >> 8) & 255) / 255;
      out.col[j + 2] = (c & 255) / 255;
      out.size[n] = s;
      out.tile[n] = tile;
      n++;
    }
    return n;
  }
}

/** 描く 配列（`Points` の 属性 に そのまま 合う） */
export interface ParticleOut {
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  tile: Float32Array;
}

export interface AnimalFxDeps {
  sound: Pick<SoundFx, 'playTones'>;
  /** 「動きの 強さ」0〜1（0 で 紙ふぶき・はじけ・ジャンプの 高さを 止める。ハート 1 つ と 音は のこす）。なければ 1 */
  motion?: () => number;
  /** 頭の 上の ハートが 出る 近さ（設定 animalLookDist）。なければ 6 */
  lookDist?: () => number;
  /** おなかいっぱい の 全部 の 長さ（設定 animalFullTicks。しるし の 小ささ の 基準）。なければ 600 */
  fullTicks?: () => number;
  /** 乱数の シード（つぶの 場所） */
  seed?: number;
}

export interface HeadHeart {
  id: number;
  filled: number;
  empty: number;
  x: number;
  y: number;
  z: number;
  d2: number;
}

/**
 * 頭の 上の ハート に する にわとり を えらぶ（AC18）。やせい（なかまでない）で hearts ≥ 1、
 * プレイヤー から 水平 `dist` 以内、近い 順に 3 わ まで。`out` を 書きかえて 数を 返す。
 */
export function headHeartsInto(out: HeadHeart[], views: readonly AnimalView[], eye: Vec3, dist: number): number {
  let n = 0;
  const lim = ANIMAL_FX.headHearts;
  const r2 = dist * dist;
  while (out.length < lim) out.push({ id: 0, filled: 0, empty: 0, x: 0, y: 0, z: 0, d2: 0 });
  for (const v of views) {
    if (v.friend || v.hearts < 1) continue;
    const dx = v.x - eye.x;
    const dz = v.z - eye.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > r2) continue;
    // 近い 順に 並べて 入れる（最大 3）
    let at = n;
    while (at > 0 && out[at - 1].d2 > d2) at--;
    if (at >= lim) continue;
    if (n < lim) n++;
    // うしろに ずらす
    for (let k = n - 1; k > at; k--) copyHeart(out[k], out[k - 1]);
    const o = out[at];
    o.id = v.id;
    o.filled = v.hearts;
    o.empty = ANIMAL_FX.headHearts - v.hearts;
    o.x = v.x;
    o.y = v.y;
    o.z = v.z;
    o.d2 = d2;
  }
  return n;
}

function copyHeart(to: HeadHeart, from: HeadHeart): void {
  to.id = from.id;
  to.filled = from.filled;
  to.empty = from.empty;
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.d2 = from.d2;
}

/** テスト用: `headHeartsInto` の 結果を `{ id, filled, empty }` の 配列で */
export function headHeartProgress(views: readonly AnimalView[], eye: Vec3, dist: number): Array<{ id: number; filled: number; empty: number }> {
  const buf: HeadHeart[] = [];
  const n = headHeartsInto(buf, views, eye, dist);
  return buf.slice(0, n).map((h) => ({ id: h.id, filled: h.filled, empty: h.empty }));
}

function mix(a: number, b: number): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 窓口 `animals.fx()` の 数（`fxReset()` で 0） */
export interface AnimalFxCounts {
  hearts: number;
  burst: number;
  confetti: number;
  puff: number;
  sparkle: number;
  /** 版 3.2: あみ を ふった ときの はっぱ の つぶ */
  leaf: number;
}

interface Seen {
  x: number;
  y: number;
  z: number;
  gen: number;
  /** パタパタ の 音を 最後に 鳴らした ステップ */
  flutterAt: number;
}

/** 頭の 上の しるし 1 組（1 わ ぶん。ハート／あしあと・おなかいっぱい）。使いまわす */
interface MarkRow {
  id: number;
  x: number;
  y: number;
  z: number;
  /** 0 = ハート なし */
  hearts: number;
  /** 0 = あしあと なし */
  steps: number;
  follow: number;
  fullLeft: number;
}

/** とんで くる むし 1 ぴき（§2.4。ふって 10 ステップ 目 から 20 ステップ） */
export interface BugFlight {
  x: number;
  y: number;
  z: number;
  /** とぶ 向き（Three.js の `rotation.y`。頭 = −z が すすむ 向きを 向く） */
  yaw: number;
  /** 上下 の かたむき（ラジアン。上へ とぶ と 正） */
  pitch: number;
  /** 大きさ の 倍率（ぴょんと 出て くる） */
  scale: number;
  /** 空中 で まるまる（体を たてに ちぢめる 割合 0..0.25） */
  curl: number;
  age: number;
  sx: number;
  sy: number;
  sz: number;
}

interface Pending {
  at: number;
  x: number;
  y: number;
  z: number;
  caught: boolean;
  reason: SwingReason;
}

const RUSTLES = ['rustle', 'rustle2', 'rustle3'] as const;
const FLIGHT_SLOTS = 4;

const ease = (t: number): number => t * t * (3 - 2 * t);

export class AnimalFx {
  /** 鳴らした 音の 名前（テスト用。長くなりすぎない） */
  readonly played: AnimalSoundName[] = [];
  readonly particles = new AnimalParticles();
  /** とんで いる むし（描く 側が 読む。あみ を ふって 10〜30 ステップ） */
  readonly flights: BugFlight[] = [];
  private readonly counts: AnimalFxCounts = { hearts: 0, burst: 0, confetti: 0, puff: 0, sparkle: 0, leaf: 0 };
  private readonly rnd: () => number;
  private readonly heads: HeadHeart[] = [];
  private headN = 0;
  private readonly marks: MarkRow[] = [];
  private markN = 0;
  private readonly seen = new Map<number, Seen>();
  private readonly pending: Pending[] = [];
  private gen = 0;
  private tick = 0;
  private flutterThisStep = false;
  private rustleLast = -1;
  private readonly eye: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly d: AnimalFxDeps) {
    this.rnd = rngOf(d.seed ?? 65);
  }

  private motion(): number {
    return this.d.motion ? this.d.motion() : 1;
  }

  private snd(name: AnimalSoundName): void {
    playAnimal(this.d.sound, name);
    this.played.push(name);
    if (this.played.length > 64) this.played.shift();
  }

  // ---------------------------------------------------------------- 毎ステップ

  /** 1 ステップ。`views` = 今 見えている にわとり（`animals.forEachVisible`）、`eye` = プレイヤー の 位置 */
  step(views: readonly AnimalView[], eye: Vec3): void {
    this.tick++;
    this.gen++;
    this.eye.x = eye.x;
    this.eye.y = eye.y;
    this.eye.z = eye.z;
    this.flutterThisStep = false;
    const gen = this.gen;
    const r2 = ANIMAL_FX.cluckRange * ANIMAL_FX.cluckRange;
    const fr2 = ANIMAL_FX.flutterRange * ANIMAL_FX.flutterRange;
    for (const v of views) {
      let s = this.seen.get(v.id);
      if (!s) {
        s = { x: 0, y: 0, z: 0, gen, flutterAt: -1e9 };
        this.seen.set(v.id, s);
      }
      s.x = v.x;
      s.y = v.y;
      s.z = v.z;
      s.gen = gen;
      const dx = v.x - eye.x;
      const dz = v.z - eye.z;
      // コッコッ: やせい だけ。300〜600 ステップに 1 回（にわとり ごとに ずらす）
      if (!v.friend && dx * dx + dz * dz <= r2) {
        const period = ANIMAL_FX.cluckMin + (mix(v.id, 11) % ANIMAL_FX.cluckSpan);
        const off = mix(v.id, 23) % period;
        if ((this.tick + off) % period === 0) this.snd('cluck');
      }
      // パタパタ: おちる あいだ 16 ステップ に 1 回、近い とき だけ。1 ステップ に 1 回 まで。着地で 止まる
      if (v.fluttering && !v.carried) {
        if (!this.flutterThisStep && dx * dx + dz * dz <= fr2 && this.tick - s.flutterAt >= ANIMAL_FX.flutterGap) {
          this.snd('flutter');
          s.flutterAt = this.tick;
          this.flutterThisStep = true;
        }
      } else s.flutterAt = -1e9;
    }
    if (this.seen.size > views.length) for (const [id, s] of this.seen) if (s.gen !== gen) this.seen.delete(id);
    const dist = this.d.lookDist ? this.d.lookDist() : ANIMAL_FX.lookDist;
    this.headN = headHeartsInto(this.heads, views, eye, dist);
    this.collectMarks(views, eye);
    this.stepFlights();
    this.runPending(); // とび出した ステップ の 経過は 0（次の ステップ から 動く）
    this.particles.step();
  }

  /** 頭の 上の しるし の 組（ハート／あしあと・おなかいっぱい）を 集める（§3.3） */
  private collectMarks(views: readonly AnimalView[], eye: Vec3): void {
    let n = 0;
    const md2 = ANIMAL_FX.markDist * ANIMAL_FX.markDist;
    for (const v of views) {
      if (v.carried) continue; // だっこ 中は 出さない（手の 中に ある）
      let hearts = 0;
      for (let h = 0; h < this.headN; h++) if (this.heads[h].id === v.id) hearts = this.heads[h].filled;
      const dx = v.x - eye.x;
      const dz = v.z - eye.z;
      const near = dx * dx + dz * dz <= md2;
      const follow = v.follow ?? 0;
      const fullLeft = v.fullLeft ?? 0;
      const steps = v.friend && near && follow > 0 ? (follow > ANIMAL_FX.stepsHigh ? 3 : follow > ANIMAL_FX.stepsMid ? 2 : 1) : 0;
      const full = near && fullLeft > 0;
      if (hearts === 0 && steps === 0 && !full) continue;
      let m = this.marks[n];
      if (!m) m = this.marks[n] = { id: 0, x: 0, y: 0, z: 0, hearts: 0, steps: 0, follow: 0, fullLeft: 0 };
      n++;
      m.id = v.id;
      m.x = v.x;
      m.y = v.y;
      m.z = v.z;
      m.hearts = hearts;
      m.steps = steps;
      m.follow = follow;
      m.fullLeft = full ? fullLeft : 0;
    }
    this.markN = n;
  }

  /** 少し あとで 起きる もの（あみ を ふって 10 ステップ 目）を 流す */
  private runPending(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p.at > this.tick) continue;
      this.pending.splice(i, 1);
      this.swingDone(p);
    }
  }

  private swingDone(p: Pending): void {
    // はっぱ 4（とれても とれなくても）
    this.counts.leaf += ANIMAL_FX.leaf;
    const cx = p.x + 0.5;
    const cy = p.y + 0.5;
    const cz = p.z + 0.5;
    for (let i = 0; i < ANIMAL_FX.leaf; i++) {
      const a = this.rnd() * Math.PI * 2;
      const g = this.rnd();
      this.particles.spawn(5, cx + Math.cos(a) * 0.5, cy + 0.3 + g * 0.3, cz + Math.sin(a) * 0.5, Math.cos(a) * 0.5, 0.9 + g * 0.6, Math.sin(a) * 0.5, 28 + Math.floor(g * 10), 0.13, g < 0.5 ? 0x6ea04a : 0x8cc152);
    }
    if (p.caught) {
      this.startFlight(cx, cy, cz);
      return;
    }
    // とれなかった: がさがさ（3 しゅるい から 直前と ちがう もの）
    let k = 0;
    if (this.rustleLast >= 0) {
      k = (this.rustleLast + 1 + Math.floor(this.rnd() * 2)) % RUSTLES.length;
    }
    this.rustleLast = k;
    this.snd(RUSTLES[k]);
    if (p.reason === 'empty') this.snd('animalHint'); // おやすみ の き は「おしい」
  }

  private startFlight(cx: number, cy: number, cz: number): void {
    if (this.motion() <= 0) return; // むし は すぐ 持ち物 へ（弧 を 止める）
    if (this.flights.length >= FLIGHT_SLOTS) this.flights.shift();
    // ねらった ブロック の プレイヤー がわ の 面 から ぴょん と 出る
    const dx = this.eye.x - cx;
    const dz = this.eye.z - cz;
    const len = Math.hypot(dx, dz) || 1;
    const sx = cx + (dx / len) * 0.55;
    const sz = cz + (dz / len) * 0.55;
    this.flights.push({ x: sx, y: cy, z: sz, yaw: Math.atan2(-dx, -dz), pitch: 0, scale: 0.4, curl: 0, age: 0, sx, sy: cy, sz });
  }

  private stepFlights(): void {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.age++;
      if (f.age >= ANIMAL_FX.bugFly) {
        this.flights.splice(i, 1);
        continue;
      }
      const t = f.age / ANIMAL_FX.bugFly;
      const k = ease(t);
      // 行き先 = プレイヤー の 胸（毎ステップ 読みなおす）
      const tx = this.eye.x;
      const ty = this.eye.y - 0.35;
      const tz = this.eye.z;
      const px = f.x;
      const py = f.y;
      const pz = f.z;
      f.x = f.sx + (tx - f.sx) * k;
      f.z = f.sz + (tz - f.sz) * k;
      f.y = f.sy + (ty - f.sy) * k + 0.55 * Math.sin(Math.PI * t); // 弧
      const mx = f.x - px;
      const mz = f.z - pz;
      if (mx * mx + mz * mz > 1e-8) f.yaw = Math.atan2(-mx, -mz); // 頭（−z）が すすむ 向き
      f.pitch = Math.atan2(f.y - py, Math.hypot(mx, mz) + 1e-4) * 0.6;
      f.scale = t < 0.2 ? 0.4 + 0.6 * ease(t / 0.2) : 1 - 0.35 * ease((t - 0.2) / 0.8);
      f.curl = 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.6)); // 空中 で まるまる
    }
  }

  // ---------------------------------------------------------------- 出来事

  /** `animals.events()` を 流す（毎ステップ。1 つずつ 音・つぶに する） */
  onEvents(events: readonly AnimalEvent[]): void {
    for (const e of events) this.one(e);
  }

  private pop(id: number): void {
    this.counts.hearts++;
    const s = this.seen.get(id);
    if (s) this.particles.spawn(1, s.x, s.y + ANIMAL_FX.headHeartY + 0.1, s.z, 0, 0.9, 0, 40, 0.22, 0xffffff);
  }

  private burst(id: number, first: boolean): void {
    if (this.motion() <= 0) return;
    const n = first ? ANIMAL_FX.burstFirst : ANIMAL_FX.burstNext;
    this.counts.burst += n;
    const s = this.seen.get(id);
    if (!s) return;
    const a0 = this.rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2;
      this.particles.spawn(1, s.x, s.y + 0.55, s.z, Math.cos(a) * 1.4, 1.2, Math.sin(a) * 1.4, 36, 0.2, 0xffffff);
    }
  }

  private confetti(id: number): void {
    if (this.motion() <= 0) return;
    const n = ANIMAL_FX.confetti;
    this.counts.confetti += n;
    const s = this.seen.get(id);
    if (!s) return;
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 0.8 + this.rnd() * 1.6;
      const up = 3 + this.rnd() * 2.2;
      const c = CONFETTI_COLORS[Math.floor(this.rnd() * CONFETTI_COLORS.length)];
      this.particles.spawn(2, s.x, s.y + 0.6, s.z, Math.cos(a) * sp, up, Math.sin(a) * sp, 60 + Math.floor(this.rnd() * 30), 0.09, c);
    }
  }

  private puff(p: Vec3, n: number = ANIMAL_FX.puffEach): void {
    this.counts.puff += n;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd();
      this.particles.spawn(3, p.x + Math.cos(a) * 0.12, p.y + 0.25, p.z + Math.sin(a) * 0.12, Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35, 24, 0.3, 0xf4f1ea);
    }
  }

  private one(e: AnimalEvent): void {
    switch (e.type) {
      case 'feed':
        this.snd('feed');
        this.pop(e.id);
        break;
      case 'friend':
        this.snd(e.first ? 'friendFirst' : 'friend');
        this.burst(e.id, e.first);
        if (e.first) this.confetti(e.id);
        break;
      case 'pet':
        // やせいを なでた だけ では ここでは 音を 出さない（合図の 音は `hint`）
        if (e.friend) {
          this.snd('petAnimal');
          this.pop(e.id);
        }
        break;
      case 'egg':
        this.snd('egg');
        this.counts.sparkle += ANIMAL_FX.sparkle;
        for (let i = 0; i < ANIMAL_FX.sparkle; i++) {
          const a = (i / ANIMAL_FX.sparkle) * Math.PI * 2 + this.rnd();
          this.particles.spawn(4, e.x + Math.cos(a) * 0.18, e.y + 0.35, e.z + Math.sin(a) * 0.18, 0, 0.5, 0, 30, 0.16, 0xffe27a);
        }
        break;
      case 'warp':
        this.snd('warp');
        this.puff(e.from);
        this.puff(e.to);
        break;
      case 'hint':
        this.snd('animalHint');
        break;
      // ---- 版 3.2
      case 'full':
        this.snd('animalFull');
        break;
      case 'followEnd': {
        this.snd('followEnd');
        const s = this.seen.get(e.id);
        if (s) this.puff(s, ANIMAL_FX.puffFollowEnd);
        else this.counts.puff += ANIMAL_FX.puffFollowEnd;
        break;
      }
      case 'carry':
        this.snd('carryUp');
        break;
      case 'putDown':
        this.snd('carryDown');
        break;
      case 'swing':
        // 押した ステップ に ひゅっ。はっぱ・がさがさ・むし の とび出し は 10 ステップ 目（ふりぬいた とき）
        this.snd('netSwing');
        this.pending.push({ at: this.tick + ANIMAL_FX.bugPop, x: Math.floor(e.x), y: Math.floor(e.y), z: Math.floor(e.z), caught: e.caught, reason: e.reason });
        break;
      case 'bugCatch':
        this.snd('bugCatch');
        this.counts.sparkle += ANIMAL_FX.sparkleBug;
        for (let i = 0; i < ANIMAL_FX.sparkleBug; i++) {
          const a = (i / ANIMAL_FX.sparkleBug) * Math.PI * 2 + this.rnd();
          this.particles.spawn(4, this.eye.x + Math.cos(a) * 0.3, this.eye.y - 0.45, this.eye.z + Math.sin(a) * 0.3, 0, 0.4, 0, 26, 0.12, 0xffe27a);
        }
        break;
      case 'spawn':
      case 'remove':
        break;
    }
  }

  // ---------------------------------------------------------------- 窓口・描く 側へ

  /** `animals.fx()`: 出た つぶの 数 と、今 出ている 頭の 上の しるし（`marks`） */
  fx(): AnimalFxRecord {
    const marks: AnimalMark[] = [];
    for (let i = 0; i < this.markN; i++) {
      const m = this.marks[i];
      const row: AnimalMark = { id: m.id, full: m.fullLeft > 0 };
      if (m.hearts > 0) row.hearts = m.hearts;
      if (m.steps > 0) row.steps = m.steps;
      marks.push(row);
    }
    return { ...this.counts, marks };
  }

  /** `animals.fxReset()` */
  fxReset(): void {
    this.counts.hearts = 0;
    this.counts.burst = 0;
    this.counts.confetti = 0;
    this.counts.puff = 0;
    this.counts.sparkle = 0;
    this.counts.leaf = 0;
  }

  /**
   * 描く 配列に 書く（頭の 上の しるし → つぶ の 順）。`right` = カメラの 右（水平）の 向き。
   * しるし 1 組 = ハート 3 つ か あしあと 3 つ（あれば）＋ おなかいっぱい 1 つ。戻り値 = 書いた 数。
   */
  write(out: ParticleOut, cap: number, right: { x: number; z: number }): number {
    let n = 0;
    const len = Math.hypot(right.x, right.z) || 1;
    const rx = right.x / len;
    const rz = right.z / len;
    const gap = ANIMAL_FX.headHeartGap;
    const fullTicks = this.d.fullTicks ? this.d.fullTicks() : ANIMAL_FX.fullTicks;
    const put = (m: MarkRow, off: number, tile: number, size: number, shade: number): void => {
      const j = n * 3;
      out.pos[j] = m.x + rx * off;
      out.pos[j + 1] = m.y + ANIMAL_FX.headHeartY;
      out.pos[j + 2] = m.z + rz * off;
      out.col[j] = out.col[j + 1] = out.col[j + 2] = shade;
      out.size[n] = size;
      out.tile[n] = tile;
      n++;
    };
    // のこり 1,800 以下 の あしあと は 60 ステップ で 1 しゅう、うすく → こく（0.56〜1.0。強い 点滅 に しない）
    const wave = 0.78 + 0.22 * Math.sin((2 * Math.PI * this.tick) / ANIMAL_FX.fadePeriod);
    for (let h = 0; h < this.markN; h++) {
      const m = this.marks[h];
      if (n + 4 > cap) break;
      const hasMain = m.hearts > 0 || m.steps > 0;
      if (m.hearts > 0) {
        for (let i = 0; i < ANIMAL_FX.headHearts; i++) put(m, (i - 1) * gap, i < m.hearts ? TILE.heartFull : TILE.heartEmpty, ANIMAL_FX.headHeartSize, 1);
      } else if (m.steps > 0) {
        const shade = m.follow <= ANIMAL_FX.stepsFade ? wave : 1;
        for (let i = 0; i < ANIMAL_FX.headHearts; i++) put(m, (i - 1) * gap, i < m.steps ? TILE.footFull : TILE.footEmpty, ANIMAL_FX.headHeartSize * 0.95, shade);
      }
      if (m.fullLeft > 0) {
        const k = Math.max(0, Math.min(1, m.fullLeft / fullTicks));
        put(m, hasMain ? 2 * gap : 0, TILE.belly, ANIMAL_FX.headHeartSize * (0.55 + 0.45 * k), 1);
      }
    }
    return this.particles.write(out, n, cap);
  }
}
