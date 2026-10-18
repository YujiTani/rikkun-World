import type { AnimalEvent, AnimalView, Vec3 } from '../contracts';
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
} as const;

/** つぶの 絵の 番号（描く 側の 絵の 並びと そろえる） */
export const TILE = { heartFull: 0, heartEmpty: 1, star: 2, dot: 3 } as const;

const CAP = 256;
const DT = 1 / 60;

type Kind = 1 | 2 | 3 | 4; // 1 ハート 2 紙ふぶき 3 けむり 4 キラッ

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
      if (k === 2 || k === 1) {
        const d = k === 2 ? 0.985 : 0.97; // 空気の ていこう
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
}

interface Seen {
  x: number;
  y: number;
  z: number;
  gen: number;
}

export class AnimalFx {
  /** 鳴らした 音の 名前（テスト用。長くなりすぎない） */
  readonly played: AnimalSoundName[] = [];
  readonly particles = new AnimalParticles();
  private readonly counts: AnimalFxCounts = { hearts: 0, burst: 0, confetti: 0, puff: 0, sparkle: 0 };
  private readonly rnd: () => number;
  private readonly heads: HeadHeart[] = [];
  private headN = 0;
  private readonly seen = new Map<number, Seen>();
  private gen = 0;
  private tick = 0;

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
    const gen = this.gen;
    const r2 = ANIMAL_FX.cluckRange * ANIMAL_FX.cluckRange;
    for (const v of views) {
      let s = this.seen.get(v.id);
      if (!s) {
        s = { x: 0, y: 0, z: 0, gen };
        this.seen.set(v.id, s);
      }
      s.x = v.x;
      s.y = v.y;
      s.z = v.z;
      s.gen = gen;
      // コッコッ: やせい だけ。300〜600 ステップに 1 回（にわとり ごとに ずらす）
      if (!v.friend) {
        const dx = v.x - eye.x;
        const dz = v.z - eye.z;
        if (dx * dx + dz * dz <= r2) {
          const period = ANIMAL_FX.cluckMin + (mix(v.id, 11) % ANIMAL_FX.cluckSpan);
          const off = mix(v.id, 23) % period;
          if ((this.tick + off) % period === 0) this.snd('cluck');
        }
      }
    }
    if (this.seen.size > views.length) for (const [id, s] of this.seen) if (s.gen !== gen) this.seen.delete(id);
    const dist = this.d.lookDist ? this.d.lookDist() : ANIMAL_FX.lookDist;
    this.headN = headHeartsInto(this.heads, views, eye, dist);
    this.particles.step();
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

  private puff(p: Vec3): void {
    const n = ANIMAL_FX.puffEach;
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
      case 'spawn':
      case 'remove':
        break;
    }
  }

  // ---------------------------------------------------------------- 窓口・描く 側へ

  /** `animals.fx()`: 出た つぶの 数 と、今 出ている 頭の 上の ハート */
  fx(): AnimalFxCounts & { progress: Array<{ id: number; filled: number; empty: number }> } {
    const progress: Array<{ id: number; filled: number; empty: number }> = [];
    for (let i = 0; i < this.headN; i++) progress.push({ id: this.heads[i].id, filled: this.heads[i].filled, empty: this.heads[i].empty });
    return { ...this.counts, progress };
  }

  /** `animals.fxReset()` */
  fxReset(): void {
    this.counts.hearts = 0;
    this.counts.burst = 0;
    this.counts.confetti = 0;
    this.counts.puff = 0;
    this.counts.sparkle = 0;
  }

  /**
   * 描く 配列に 書く（頭の 上の ハート → つぶ の 順）。`right` = カメラの 右（水平）の 向き。
   * 戻り値 = 書いた 数。
   */
  write(out: ParticleOut, cap: number, right: { x: number; z: number }): number {
    let n = 0;
    const len = Math.hypot(right.x, right.z) || 1;
    const rx = right.x / len;
    const rz = right.z / len;
    for (let h = 0; h < this.headN && n + ANIMAL_FX.headHearts <= cap; h++) {
      const a = this.heads[h];
      for (let i = 0; i < ANIMAL_FX.headHearts; i++) {
        const o = (i - 1) * ANIMAL_FX.headHeartGap;
        const j = n * 3;
        out.pos[j] = a.x + rx * o;
        out.pos[j + 1] = a.y + ANIMAL_FX.headHeartY;
        out.pos[j + 2] = a.z + rz * o;
        out.col[j] = out.col[j + 1] = out.col[j + 2] = 1;
        out.size[n] = ANIMAL_FX.headHeartSize;
        out.tile[n] = i < a.filled ? TILE.heartFull : TILE.heartEmpty;
        n++;
      }
    }
    return this.particles.write(out, n, cap);
  }
}
