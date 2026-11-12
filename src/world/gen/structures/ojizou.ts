import { ARA } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * おじぞうさん（3 たい ならぶ。はば 5・ふかさ 2・高さ 3〜4）。石の 台・体・頭、体の 前に 赤い 前かけ 1 マス（朱色の 木）。
 * まん中が 1 マス 高い。正面は 図の 下（南）。
 */
export const OJIZOU: StructureShape = {
  id: 'ojizou',
  layers: [
    ['B.B.B', '.....'],
    ['I.I.I', 'S.S.S'],
    ['I.I.I', '.....'],
    ['..I..', '.....'],
  ],
  legend: {
    B: ARA,
    I: ARA,
    S: 'shu_ita',
  },
  anchor: { x: 2, z: 0 },
  base: { id: 'koke_ara_ishi', maxFill: 3 },
  maxSlope: 2,
};
