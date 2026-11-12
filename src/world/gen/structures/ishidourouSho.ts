import type { StructureShape } from './types';

/**
 * いしどうろう 小（ゆきみがた・5×5・高さ 3）。ひくい 足（こけいし 1）→ ちょうちん → 広い 笠 5×5。ひくくて 笠が 広い。
 * R = 笠（こけが 多めに 出る）。
 */
export const ISHIDOUROU_SHO: StructureShape = {
  id: 'ishidourou-sho',
  layers: [
    ['.....', '.....', '..M..', '.....', '.....'],
    ['.....', '.....', '..C..', '.....', '.....'],
    ['RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR'],
  ],
  legend: {
    M: 'koke_ishi',
    C: 'chouchin',
    R: { id: 'kawara', moss: 0.4 },
  },
  anchor: { x: 2, z: 2 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
