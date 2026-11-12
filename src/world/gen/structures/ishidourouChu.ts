import type { StructureShape } from './types';

/**
 * いしどうろう 中（3×3・高さ 5）。
 * 台（3×3 → 1×1 の 2 だん）→ ひぶくろ（わの ちょうちん。笠の 1 だん 下で はっきり 見える）→ 笠（3×3 の うすいた ＋ まんなかに かさ）→ てっぺんの たま。
 * M = 台、N = 台の 2 だん（さお）、C = ちょうちん、E = 笠の ふち、G = 笠の まんなか、T = たま。
 */
export const ISHIDOUROU_CHU: StructureShape = {
  id: 'ishidourou-chu',
  layers: [
    ['MMM', 'MMM', 'MMM'],
    ['...', '.N.', '...'],
    ['...', '.C.', '...'],
    ['EEE', 'EGE', 'EEE'],
    ['...', '.T.', '...'],
  ],
  legend: {
    M: { id: 'ara_ishi', moss: 0.25, mossId: 'koke_ara_ishi', mossLow: 0.3, mix: [['koke_ishi', 0.1], ['hibi_ishi', 0.08], ['kizami_ishi', 0.12]] },
    N: { id: 'ara_ishi', moss: 0.12, mossId: 'koke_ara_ishi', mix: [['hibi_ishi', 0.1]] },
    C: 'chouchin',
    E: { id: 'kawara_usuita_shita', moss: 0.2, mossId: 'ara_ishi_usuita_shita' },
    G: { id: 'kawara_kasa', moss: 0.3, mossId: 'koke_ara_ishi_kasa' },
    T: 'koke_ara_ishi_hashira',
  },
  anchor: { x: 1, z: 1 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
