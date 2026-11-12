import type { StructureShape } from './types';

/**
 * いしどうろう 中（3×3・高さ 5）。台 3×3 → さお 1×1 → ちょうちん（ひぶくろ）→ 笠 3×3 → てっぺんに こけ。
 * M = 台（こけが 多い）、I = さお、R = 笠（こけが 出る）、T = こけ。
 */
export const ISHIDOUROU_CHU: StructureShape = {
  id: 'ishidourou-chu',
  layers: [
    ['MMM', 'MMM', 'MMM'],
    ['...', '.I.', '...'],
    ['...', '.C.', '...'],
    ['RRR', 'RRR', 'RRR'],
    ['...', '.T.', '...'],
  ],
  legend: {
    M: { id: 'ara_ishi', moss: 0.25, mossId: 'koke_ara_ishi', mossLow: 0.3, mix: [['koke_ishi', 0.1], ['hibi_ishi', 0.1]] },
    I: { id: 'ara_ishi', moss: 0.12, mossId: 'koke_ara_ishi', mix: [['hibi_ishi', 0.1]] },
    C: 'chouchin',
    R: { id: 'kawara', moss: 0.3 },
    T: 'koke_ishi',
  },
  anchor: { x: 1, z: 1 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
