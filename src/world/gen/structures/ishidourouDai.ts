import type { StructureShape } from './types';

/**
 * いしどうろう 大（5×5・高さ 7）。形つきブロックで 細く 作る。
 * 台 3×3（こけが 多い）→ さお（細い はしら 2 段）→ ひぶくろ（わの ちょうちん）→ 広い 笠 5×5（ふちは うすいた・まんなかは かわらの かたまり）→ 笠の 上の ぎぼし → てっぺんの たま。
 * M = 台、I = さお、C = ちょうちん、E = 笠の ふち、K = 笠の まんなか、G = 笠の 上の ぎぼし（四角すい台）、T = てっぺんの たま。
 */
export const ISHIDOUROU_DAI: StructureShape = {
  id: 'ishidourou-dai',
  layers: [
    ['.....', '.MMM.', '.MMM.', '.MMM.', '.....'],
    ['.....', '.....', '..I..', '.....', '.....'],
    ['.....', '.....', '..I..', '.....', '.....'],
    ['.....', '.....', '..C..', '.....', '.....'],
    ['EEEEE', 'EKKKE', 'EKKKE', 'EKKKE', 'EEEEE'],
    ['.....', '.....', '..G..', '.....', '.....'],
    ['.....', '.....', '..T..', '.....', '.....'],
  ],
  legend: {
    M: { id: 'ara_ishi', moss: 0.25, mossId: 'koke_ara_ishi', mossLow: 0.3, mix: [['koke_ishi', 0.1], ['hibi_ishi', 0.1]] },
    I: { id: 'ara_ishi_hashira', moss: 0.15, mossId: 'koke_ara_ishi_hashira', mix: [['stone_hashira', 0.1]] },
    C: 'chouchin',
    E: { id: 'kawara_usuita_shita', skip: 0.06, moss: 0.2, mossId: 'ara_ishi_usuita_shita' },
    K: { id: 'kawara', moss: 0.3, mossId: 'koke_ishi' },
    G: { id: 'kawara_kasa', moss: 0.3, mossId: 'koke_ara_ishi_kasa' },
    T: 'koke_ara_ishi_hashira',
  },
  anchor: { x: 2, z: 2 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
