import type { StructureShape } from './types';

/**
 * いしどうろう 大（5×5・高さ 7）。台 3×3 → さお 1×1（2 段）→ 中だい 3×3 → ひぶくろ（四すみに ちょうちん 4 つ。すけて 見える 光る 所）→
 * 広い 笠 5×5 → てっぺんに こけ。M = 台（こけが 多い）、I = さお・中だい、R = 笠（こけが 出る）、T = てっぺんの こけ。
 */
export const ISHIDOUROU_DAI: StructureShape = {
  id: 'ishidourou-dai',
  layers: [
    ['.....', '.MMM.', '.MMM.', '.MMM.', '.....'],
    ['.....', '.....', '..I..', '.....', '.....'],
    ['.....', '.....', '..I..', '.....', '.....'],
    ['.....', '.III.', '.III.', '.III.', '.....'],
    ['.....', '.C.C.', '.....', '.C.C.', '.....'],
    ['RRRRR', 'RRRRR', 'RRRRR', 'RRRRR', 'RRRRR'],
    ['.....', '.....', '..T..', '.....', '.....'],
  ],
  legend: {
    M: { id: 'ishidatami', moss: 0.5 },
    I: { id: 'ishidatami', moss: 0.12 },
    C: 'chouchin',
    R: { id: 'kawara', moss: 0.3 },
    T: 'koke_ishi',
  },
  anchor: { x: 2, z: 2 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
