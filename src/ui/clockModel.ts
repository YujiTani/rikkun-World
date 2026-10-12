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
