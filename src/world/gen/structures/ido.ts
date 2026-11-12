import { ARA } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * いど（5×5・高さ 8）。石の 丸い わく（3×3 の まわり 8 マス・高さ 2）、中は くらい 穴（くろい かわらの 底）。
 * 木の はしら 2 本（左右）と すじかい、つるべの 横木（はしらの てっぺんを つなぐ）、こけむした かわらの 屋根（かたむいて 少し かけている）。
 */
export const IDO: StructureShape = {
  id: 'ido',
  layers: [
    // y0 わく と 穴の 底（H）。左右に 細い はしら（P）
    ['.....', '.RRR.', 'PRHRP', '.RRR.', '.....'],
    // y1 わくの 2 段め（中は あいた 穴）
    ['.....', '.RRR.', 'PR.RP', '.RRR.', '.....'],
    // y2〜3 はしら
    ['.....', '.....', 'P...P', '.....', '.....'],
    ['.....', '.....', 'P...P', '.....', '.....'],
    // y4 すじかい（細い かきね）
    ['.....', '.....', 'PB.BP', '.....', '.....'],
    // y5 つるべの 横木（細い かきね 5 つ）
    ['.....', '.....', 'BBBBB', '.....', '.....'],
    // y6 屋根（うすいた 5×3。上の 3 だん）
    ['.....', 'EEEEE', 'EEEEE', 'EEEEE', '.....'],
    // y7 むね（うすいた。下の 3 だん）
    ['.....', '.....', '.DDD.', '.....', '.....'],
  ],
  legend: {
    R: ARA,
    H: 'kawara',
    P: 'log_hashira',
    B: 'log_kakine_x',
    D: 'kawara_usuita_shita',
    E: { id: 'kawara_usuita_ue', skip: 0.03, moss: 0.15, mossId: 'ara_ishi_usuita_ue' },
  },
  anchor: { x: 2, z: 2 },
  base: { id: 'ara_ishi', maxFill: 3 },
  maxSlope: 2,
};
