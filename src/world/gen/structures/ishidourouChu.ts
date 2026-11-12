import type { StructureShape } from './types';

/**
 * いしどうろう 中（3×3・高さ 5）。形つきブロックで 細く 作る。
 * 台 3×3 → さお（細い はしら）→ ちょうちん（ひぶくろ）→ 笠 3×3（ふちは うすいた・まんなかは かわらの かたまり）→ 笠の 上の ぎぼし。
 * M = 台（こけが 多い）、I = さお、C = ちょうちん、E = 笠の ふち、K = 笠の まんなか、G = ぎぼし。
 */
export const ISHIDOUROU_CHU: StructureShape = {
  id: 'ishidourou-chu',
  layers: [
    ['MMM', 'MMM', 'MMM'],
    ['...', '.I.', '...'],
    ['...', '.C.', '...'],
    ['EEE', 'EKE', 'EEE'],
    ['...', '.G.', '...'],
  ],
  legend: {
    M: { id: 'ara_ishi', moss: 0.25, mossId: 'koke_ara_ishi', mossLow: 0.3, mix: [['koke_ishi', 0.1], ['hibi_ishi', 0.1]] },
    I: { id: 'ara_ishi_hashira', moss: 0.15, mossId: 'koke_ara_ishi_hashira', mix: [['stone_hashira', 0.1]] },
    C: 'chouchin',
    E: { id: 'kawara_usuita_shita', skip: 0.06, moss: 0.2, mossId: 'ara_ishi_usuita_shita' },
    K: { id: 'kawara', moss: 0.3, mossId: 'koke_ishi' },
    G: { id: 'kawara_kasa', moss: 0.3, mossId: 'koke_ara_ishi_kasa' },
  },
  anchor: { x: 1, z: 1 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
