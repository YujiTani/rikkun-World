import { CELEBRATE } from './config';

/** 種つきの乱数（mulberry32）。見た目のばらつきをテストで再現できるように */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Spark {
  /** はじまりの位置（画面 px）と 速さ（px/ステップ） */
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  /** 0 = めずらしさの色、1 = 金色 */
  color: 0 | 1;
  size: number;
}

/** 光のつぶ。上限つきの固定長（毎フレーム new しない） */
export class SparkPool {
  readonly items: Spark[];
  private readonly rng: () => number;

  constructor(readonly max = 96, seed = 1234) {
    this.rng = makeRng(seed);
    this.items = Array.from({ length: max }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, color: 0 as 0 | 1, size: 0 }));
  }

  /** マスの真ん中からまるく とびちる */
  burst(x: number, y: number, count: number): number {
    let n = 0;
    for (const s of this.items) {
      if (n >= count) break;
      if (s.life > 0) continue;
      const ang = (n / count) * Math.PI * 2 + this.rng() * 0.4;
      const sp = 1.6 + this.rng() * 1.4;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(ang) * sp;
      s.vy = Math.sin(ang) * sp - 0.6;
      s.age = 0;
      s.life = CELEBRATE.sparkSteps;
      s.color = n % 3 === 2 ? 1 : 0;
      s.size = 6 + Math.floor(this.rng() * 4);
      n++;
    }
    return n;
  }

  step(amount: number): void {
    if (amount <= 0) return;
    for (const s of this.items) {
      if (s.life <= 0) continue;
      s.age += amount;
      if (s.age >= s.life) s.life = 0;
    }
  }

  active(): number {
    let n = 0;
    for (const s of this.items) if (s.life > 0) n++;
    return n;
  }

  /** いまの位置（重力つき） */
  posAt(s: Spark): { x: number; y: number; opacity: number } {
    return {
      x: s.x + s.vx * s.age,
      y: s.y + s.vy * s.age + 0.04 * s.age * s.age,
      opacity: 1 - s.age / s.life,
    };
  }
}

/** ぽよんの大きさ: 1.0 → 1.3 → 0.95 → 1.0（t = 0〜1） */
export function poyonScale(t: number): number {
  if (t <= 0 || t >= 1) return 1;
  if (t < 0.4) return 1 + 0.3 * (t / 0.4);
  if (t < 0.7) return 1.3 - 0.35 * ((t - 0.4) / 0.3);
  return 0.95 + 0.05 * ((t - 0.7) / 0.3);
}
