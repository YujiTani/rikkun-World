import type { DayPhase } from '../contracts';

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
