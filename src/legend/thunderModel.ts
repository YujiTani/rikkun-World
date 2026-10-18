import { makeRng } from '../fx/sfxVary';

/**
 * WEAPON-7 §3.5・決定「雷 v4」「光の つぶ」: 落雷の 見た目の 時間と 動き（DOM・three を 知らない）。
 * F は 落雷の F（はなした ステップが F1）。雷は F2 から 8 コマ × 2 ステップ（F2〜17）、F8 に 着地。
 */

export const BOLT = {
  /** 絵の コマの 数（1 枚の 絵の 横）・雷の 形の 数（たて） */
  frames: 8,
  variants: 4,
  stepsPerFrame: 2,
  /** 雷が 出はじめる F */
  startF: 2,
  /** 着地の コマ（F8〜9） */
  landFrame: 3,
  /** 高さ（S から 上へ） */
  height: 30,
  /** 1 コマの 絵の 大きさ（px）。たて・よこ 8 : 1 */
  cellW: 32,
  cellH: 256,
} as const;

/** その F の 雷の コマ（0〜7）。出ていない F は -1 */
export function boltFrameOf(F: number): number {
  if (F < BOLT.startF) return -1;
  const k = Math.floor((F - BOLT.startF) / BOLT.stepsPerFrame);
  return k < BOLT.frames ? k : -1;
}

const LAND_F = 8;
const GLOW_STEPS = 12;
const RING_STEPS = 20;
const RING_RADIUS = 5;

/** 着地の 光の たまり（S を 中心に 半径 1.5 → ふくらみながら きえる）。出ていない F は null */
export function groundGlow(F: number): { alpha: number; scale: number } | null {
  const a = F - LAND_F;
  if (a < 0 || a >= GLOW_STEPS) return null;
  const t = a / GLOW_STEPS;
  return { alpha: 1 - t * t, scale: 1 + 0.9 * (1 - (1 - t) ** 2) };
}

/** 着地の わ（半径 5 まで 広がって 20 ステップで きえる）。出ていない F は null */
export function landingRing(F: number): { radius: number; alpha: number } | null {
  const a = F - LAND_F;
  if (a < 0 || a >= RING_STEPS) return null;
  const t = a / RING_STEPS;
  const grow = Math.min(1, a / 10);
  return { radius: RING_RADIUS * (0.35 + 0.65 * (1 - (1 - grow) ** 2)), alpha: 0.9 * (1 - t) };
}

export const SPARKS = {
  count: 36,
  /** のぼる 高さ（マス） */
  riseMin: 2,
  riseMax: 3,
  lifeMin: 50,
  lifeMax: 80,
  /** 水平に ひろがる はんい（マス） */
  spreadMax: 2.2,
} as const;

export interface Spark {
  /** 向き（ラジアン）と 広がり（マス） */
  angle: number;
  spread: number;
  /** のぼる 高さ（マス）と 生きる ステップ */
  rise: number;
  life: number;
  /** 1 つぶの 大きさ（マス） */
  size: number;
  /** 色: 0 白・1 白っぽい 黄色 */
  tone: 0 | 1;
}

/** 着地で まきあがる 光の つぶ。シード付き（同じ シードで 同じ） */
export function makeSparks(seed: number): Spark[] {
  const r = makeRng(seed >>> 0);
  const out: Spark[] = [];
  for (let i = 0; i < SPARKS.count; i++) {
    out.push({
      angle: r() * Math.PI * 2,
      spread: 0.2 + r() * (SPARKS.spreadMax - 0.2),
      rise: SPARKS.riseMin + r() * (SPARKS.riseMax - SPARKS.riseMin),
      life: Math.round(SPARKS.lifeMin + r() * (SPARKS.lifeMax - SPARKS.lifeMin)),
      size: 0.1 + r() * 0.1,
      tone: r() < 0.5 ? 0 : 1,
    });
  }
  return out;
}

/** つぶの ようす（着地から t ステップ）。上へ ふわっと のぼって（はじめ はやく 終わり ゆっくり）、明るさは 下がる だけ */
export function sparkAt(s: Spark, t: number): { dx: number; dy: number; dz: number; alpha: number } {
  const u = Math.min(1, Math.max(0, t / s.life));
  const e = 1 - (1 - u) ** 2;
  // 明るさ: ほとんど そのまま → 終わりに かけて すーっと 0（点滅なし。下がる だけ）
  const alpha = u < 0.5 ? 1 : Math.max(0, 1 - (u - 0.5) / 0.5);
  const dist = s.spread * e;
  return { dx: Math.cos(s.angle) * dist, dy: s.rise * e, dz: Math.sin(s.angle) * dist, alpha: u >= 1 ? 0 : alpha };
}
