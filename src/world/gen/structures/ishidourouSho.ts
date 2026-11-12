import type { StructureShape } from './types';

/**
 * いしどうろう 小（ゆきみがた・5×5・高さ 3）。ひくい 太い 足（こけの あらいし）→ ちょうちん → 広い 笠 5×5（ふちは うすいた・まんなかに 四角すい台）。ひくくて 笠が 広い。
 * M = 足、C = ちょうちん、E = 笠の ふち（こけが 多め）、G = 笠の まんなか（四角すい台）。
 */
export const ISHIDOUROU_SHO: StructureShape = {
  id: 'ishidourou-sho',
  layers: [
    ['.....', '.....', '..M..', '.....', '.....'],
    ['.....', '.....', '..C..', '.....', '.....'],
    ['EEEEE', 'EEEEE', 'EEGEE', 'EEEEE', 'EEEEE'],
  ],
  legend: {
    M: { id: 'koke_ara_ishi', mix: [['koke_ishi', 0.3]] },
    C: 'chouchin',
    E: { id: 'kawara_usuita_shita', skip: 0.05, moss: 0.35, mossId: 'ara_ishi_usuita_shita' },
    G: { id: 'kawara_kasa', moss: 0.4, mossId: 'koke_ara_ishi_kasa' },
  },
  anchor: { x: 2, z: 2 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 3,
};
