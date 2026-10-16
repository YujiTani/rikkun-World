import type { DayPhase } from '../contracts';
import type { TimeSettings } from '../time/config';
import { sunMoonPose } from '../sky/sunMoon';

export type ClockBody = 'sun' | 'moon';

export const CLOCK_COLORS = { sun: '#FFE14D', moon: '#F5F5DC' } as const;

/**
 * 時計のマーク（右上の 48px の丸）の中身。ひる は おひさま、よる は おつきさま。
 * ゆうがた（おひさま → おつきさま）・あさ（おつきさま → おひさま）は 左右の半分ずつ。
 */
export function clockFace(phase: DayPhase): { left: ClockBody; right: ClockBody } {
  switch (phase) {
    case 'day':
      return { left: 'sun', right: 'sun' };
    case 'night':
      return { left: 'moon', right: 'moon' };
    case 'dusk':
      return { left: 'sun', right: 'moon' };
    case 'dawn':
      return { left: 'moon', right: 'sun' };
  }
}

/** CSS の background */
export function clockBackground(phase: DayPhase): string {
  const f = clockFace(phase);
  const l = CLOCK_COLORS[f.left];
  const r = CLOCK_COLORS[f.right];
  return l === r ? l : `linear-gradient(90deg, ${l} 50%, ${r} 50%)`;
}

/** 円の中の空の色（ふちの内がわ） */
export const CLOCK_SKY: Record<DayPhase, string> = {
  day: '#8FD3FF',
  dusk: '#FF9E6B',
  night: '#1B2350',
  dawn: '#FFC48A',
};

/**
 * 時計の絵の位置。東（右）からのぼり、てっぺんを通って西（左）へしずむ。
 * x, y は -1..1（円の中心が 0、y は上が +）。body は今出ている方（ひる・ゆうがた = おひさま、よる・あさ = おつきさま）。
 */
export function clockBodyPose(dayTick: number, s: TimeSettings): { body: ClockBody; x: number; y: number } {
  const p = sunMoonPose(dayTick, s);
  const body: ClockBody = p.sun.visible ? 'sun' : 'moon';
  const angle = p.sun.visible ? p.sun.angle : p.moon.angle;
  return { body, x: Math.cos(angle), y: Math.sin(angle) };
}

// ---------------------------------------------------------------- 時間帯の絵 6 つ（M6-clock）

export type ClockScene = 'sunrise' | 'morning' | 'noon' | 'afternoon' | 'sunset' | 'night';

export const CLOCK_SCENES: readonly ClockScene[] = ['sunrise', 'morning', 'noon', 'afternoon', 'sunset', 'night'];

/** 時計に出すことば（ひらがな） */
export const CLOCK_WORDS: Record<ClockScene, string> = {
  sunrise: 'ひので',
  morning: 'あさ',
  noon: 'おひる',
  afternoon: 'ゆうやけ',
  sunset: 'ひのいり',
  night: 'よる',
};

/** ひる を 3 つに分ける割合（0〜1。あさ → おひる → ゆうやけ の境目）。設定 `clockPhases` */
export const CLOCK_PHASES = { morningEnd: 0.4, noonEnd: 0.7 } as const;
export type ClockPhases = { morningEnd: number; noonEnd: number };

/** 1 日の中のステップ → 6 つの絵のどれか。1 日 = ひる → ゆうがた → よる → 夜明け の順 */
export function clockScene(dayTick: number, s: TimeSettings, cfg: ClockPhases = CLOCK_PHASES): ClockScene {
  const t = dayTick;
  if (t < s.dayTicks) {
    const f = t / s.dayTicks;
    return f < cfg.morningEnd ? 'morning' : f < cfg.noonEnd ? 'noon' : 'afternoon';
  }
  if (t < s.dayTicks + s.duskTicks) return 'sunset';
  if (t < s.dayTicks + s.duskTicks + s.nightTicks) return 'night';
  return 'sunrise';
}

// ---------------------------------------------------------------- 入れかえ（#129）

/** ふつうに進んだと見なす いちばん大きい差（ステップ。60 = 1 秒） */
export const CLOCK_FADE_MAX_STEPS = 60;

/** 1 日の長さ（ステップ） */
export function dayLength(s: TimeSettings): number {
  return s.dayTicks + s.duskTicks + s.nightTicks + s.dawnTicks;
}

/**
 * 絵を ふわっと入れかえるか。前に見た dayTick から、1 日で回りこむ前向きの差が小さいときだけ true。
 * 大きくとんだ・もどった・最初（prev なし）は false（すぐ入れかえる）。
 */
export function clockShouldFade(prevTick: number | null, tick: number, s: TimeSettings): boolean {
  if (prevTick === null) return false;
  const len = dayLength(s);
  const diff = (((tick - prevTick) % len) + len) % len;
  return diff <= CLOCK_FADE_MAX_STEPS;
}
