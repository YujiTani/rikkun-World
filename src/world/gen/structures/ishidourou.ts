import type { StructureShape } from './types';

/**
 * いしどうろう（1×1・高さ 4）。こけいしの 台 1 → いしだたみ 1 → ちょうちん（わの ちょうちん。光る）→ かわらの 笠 1。
 * 石段の 両わきに 立てる（ishidan.ts が よぶ）。灰色の 台と 黒い 笠で、赤い あかりが 目に 入る。
 */
export const ISHIDOUROU: StructureShape = {
  id: 'ishidourou',
  layers: [['M'], ['I'], ['C'], ['K']],
  legend: {
    M: 'koke_ishi',
    I: 'ishidatami',
    C: 'chouchin',
    K: 'kawara',
  },
  anchor: { x: 0, z: 0 },
  base: { id: 'koke_ishi', maxFill: 4 },
  maxSlope: 0,
};
