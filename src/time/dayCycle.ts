import type { DayPhase } from '../contracts';
import { SKY_COLORS, type TimeSettings } from './config';

export function dayLength(s: TimeSettings): number {
  return s.dayTicks + s.duskTicks + s.nightTicks + s.dawnTicks;
}

/** 1 日の中の時刻 → 時間帯 */
export function phaseAt(dayTick: number, s: TimeSettings): DayPhase {
  if (dayTick < s.dayTicks) return 'day';
  if (dayTick < s.dayTicks + s.duskTicks) return 'dusk';
  if (dayTick < s.dayTicks + s.duskTicks + s.nightTicks) return 'night';
  return 'dawn';
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function mixColor(a: number, b: number, t: number): number {
  const r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t));
  const g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t));
  const bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
}

export function hexString(color: number): string {
  return '#' + color.toString(16).padStart(6, '0').toUpperCase();
}

export interface SkyLook {
  color: number;
  brightness: number;
  dollBrightness: number;
}

/** 空の色と明るさ。ゆうがた・あさ は まっすぐ（ステップごとに少しずつ）変える */
export function lookAt(dayTick: number, s: TimeSettings): SkyLook {
  const C = SKY_COLORS;
  const phase = phaseAt(dayTick, s);
  if (phase === 'day') return { color: C.day, brightness: 1, dollBrightness: 1 };
  if (phase === 'night') {
    return { color: C.night, brightness: s.nightBrightness, dollBrightness: s.nightDollBrightness };
  }
  if (phase === 'dusk') {
    const u = (dayTick - s.dayTicks) / s.duskTicks;
    const color = u < 0.5 ? mixColor(C.day, C.dusk, u * 2) : mixColor(C.dusk, C.night, (u - 0.5) * 2);
    return {
      color,
      brightness: lerp(1, s.nightBrightness, u),
      dollBrightness: lerp(1, s.nightDollBrightness, u),
    };
  }
  const u = (dayTick - (s.dayTicks + s.duskTicks + s.nightTicks)) / s.dawnTicks;
  const color = u < 0.5 ? mixColor(C.night, C.dawn, u * 2) : mixColor(C.dawn, C.day, (u - 0.5) * 2);
  return {
    color,
    brightness: lerp(s.nightBrightness, 1, u),
    dollBrightness: lerp(s.nightDollBrightness, 1, u),
  };
}
