import type { DayPhase } from '../contracts';
import type { TimeOfDayImpl } from './TimeOfDay';

export interface TimeInfo {
  dayTick: number;
  day: number;
  phase: DayPhase;
  skyColor: string;
  brightness: number;
  dollBrightness: number;
}

/** `time.*`（M3 §6.1）に入れる関数 */
export function createTimeHook(time: TimeOfDayImpl) {
  return {
    get: (): TimeInfo => ({
      dayTick: time.dayTick(),
      day: time.day(),
      phase: time.phase(),
      skyColor: time.skyColor(),
      brightness: time.brightness(),
      dollBrightness: time.dollBrightness(),
    }),
    set: (dayTick: number): void => time.set(dayTick),
  };
}
