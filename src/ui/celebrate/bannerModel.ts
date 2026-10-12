import { CELEBRATE, type CelebrateSettings } from './config';

export type BannerKind = 'craft' | 'bake';
export type BannerPhase = 'in' | 'stay' | 'out';

export interface BannerInfo {
  recipe: string;
  item: string;
  kind: BannerKind;
  phase: BannerPhase;
  /** 画面ステップ（もちもの画面では 1 ステップで 4 進む） */
  age: number;
  /** 入場の回転（0 → 720）。そのあとは 720 のまま */
  rotationDeg: number;
  scale: number;
}

/** 見た目のための値 */
export interface BannerLook extends BannerInfo {
  opacity: number;
  /** ゆらゆら（±3°） */
  tiltDeg: number;
  offsetY: number;
  /** 後光の向き */
  haloDeg: number;
  /** つやの帯の位置 0〜1、通っていないときは -1 */
  shine: number;
  /** 星の組ごとの明るさ 0〜1 */
  starLight: number[];
  /** 紙ふぶきが出ている割合 0〜1、出ていなければ -1 */
  confetti: number;
}

export type BannerEvent = { type: 'start'; recipe: string } | { type: 'fanfare'; recipe: string };

interface Entry {
  recipe: string;
  item: string;
  kind: BannerKind;
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** 横断幕（はじめて作った・焼いた）の時間とじゅんばん。DOM を知らない */
export class BannerModel {
  private cur: Entry | null = null;
  private age = 0;
  private queued: Entry[] = [];

  constructor(private readonly cfg: () => CelebrateSettings) {}

  /** 'shown' = すぐ出る / 'queued' = じゅんばん待ち / 'dropped' = 4 こ目からは出さない */
  enqueue(recipe: string, item: string, kind: BannerKind): 'shown' | 'queued' | 'dropped' {
    const e: Entry = { recipe, item, kind };
    if (!this.cur) {
      this.cur = e;
      this.age = 0;
      return 'shown';
    }
    if (this.queued.length < CELEBRATE.bannerQueueMax) {
      this.queued.push(e);
      return 'queued';
    }
    return 'dropped';
  }

  showing(): boolean {
    return this.cur !== null;
  }

  queue(): string[] {
    return this.queued.map((q) => q.recipe);
  }

  /** 新しく出た横断幕（start のお知らせ用）。enqueue の直後に 1 度だけ読む */
  currentRecipe(): string | null {
    return this.cur ? this.cur.recipe : null;
  }

  /** 画面ステップを amount だけ進める（ふつう 1、もちもの画面 4）。0 以下は進まない */
  step(amount: number): BannerEvent[] {
    const ev: BannerEvent[] = [];
    if (!this.cur || amount <= 0) return ev;
    const c = this.cfg();
    const prev = this.age;
    this.age += amount;
    if (prev < c.bannerInTicks && this.age >= c.bannerInTicks) ev.push({ type: 'fanfare', recipe: this.cur.recipe });
    if (this.age >= c.bannerTicks) {
      this.cur = null;
      const next = this.queued.shift();
      if (next) {
        this.cur = next;
        this.age = 0;
        ev.push({ type: 'start', recipe: next.recipe });
      }
    }
    return ev;
  }

  clear(): void {
    this.cur = null;
    this.queued = [];
    this.age = 0;
  }

  info(): BannerInfo | null {
    const l = this.look();
    if (!l) return null;
    return { recipe: l.recipe, item: l.item, kind: l.kind, phase: l.phase, age: l.age, rotationDeg: l.rotationDeg, scale: l.scale };
  }

  look(): BannerLook | null {
    if (!this.cur) return null;
    const c = this.cfg();
    const a = this.age;
    const inEnd = c.bannerInTicks;
    const outStart = c.bannerTicks - c.bannerOutTicks;
    const phase: BannerPhase = a < inEnd ? 'in' : a < outStart ? 'stay' : 'out';
    let rotationDeg = 720;
    let scale = 1;
    let opacity = 1;
    let offsetY = 0;
    if (phase === 'in') {
      const e = easeOut(clamp01(a / inEnd));
      rotationDeg = 720 * e;
      scale = 0.3 + 0.7 * e;
      opacity = e;
    } else if (a < CELEBRATE.bannerPoyonEnd) {
      // ぽよん: 1.0 → 1.08 → 1.0
      scale = 1 + 0.08 * Math.sin((Math.PI * (a - inEnd)) / (CELEBRATE.bannerPoyonEnd - inEnd));
    }
    if (phase === 'out') {
      const t = clamp01((a - outStart) / c.bannerOutTicks);
      scale = 1 - 0.4 * t;
      offsetY = -40 * t;
      opacity = 1 - t;
    }
    const g = a - CELEBRATE.bannerGlowStart;
    const glowing = g >= 0 && phase !== 'out';
    const tiltDeg = glowing ? CELEBRATE.wobbleDeg * Math.sin((2 * Math.PI * g) / CELEBRATE.wobblePeriod) : 0;
    const haloDeg = (g > 0 ? g : 0) * CELEBRATE.haloDegPerStep;
    let shine = -1;
    if (glowing) {
      const w = g % CELEBRATE.shinePeriod;
      if (w < CELEBRATE.shinePassSteps) shine = w / CELEBRATE.shinePassSteps;
    }
    const starLight = starLights(g, glowing);
    const confetti = a < CELEBRATE.confettiSteps ? a / CELEBRATE.confettiSteps : -1;
    return {
      recipe: this.cur.recipe,
      item: this.cur.item,
      kind: this.cur.kind,
      phase,
      age: a,
      rotationDeg,
      scale,
      opacity,
      tiltDeg,
      offsetY,
      haloDeg,
      shine,
      starLight,
      confetti,
    };
  }
}

/** 星の 2 組: 1 組は 72 ステップに 1 回（36 ステップかけて ふわっと）。組は交互 */
export function starLights(t: number, on: boolean): number[] {
  const out: number[] = [];
  for (let g = 0; g < CELEBRATE.starGroups; g++) {
    if (!on || t < 0) {
      out.push(0);
      continue;
    }
    const w = (t + (g * CELEBRATE.starPeriod) / CELEBRATE.starGroups) % CELEBRATE.starPeriod;
    out.push(w < CELEBRATE.starFlash ? Math.sin((Math.PI * w) / CELEBRATE.starFlash) : 0);
  }
  return out;
}
