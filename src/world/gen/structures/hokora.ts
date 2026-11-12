import { ARA, ARA_MOSSY } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * ほこら（7×7・高さ 9）。石の 台（3 段 = ふもと 2 段 ＋ 台の うえ）と 正面（南）の 石段、台の まわりに 石の かこい（正面は あけて 入り口）、
 * 朱色の はしら 4 本、中に 小さい 石ぞう（2 マス）と ちょうちん 1 つ、そった かわらの 屋根（すみが 1 段 上がる）。
 */
export const HOKORA: StructureShape = {
  id: 'hokora',
  layers: [
    // y0 台の 1 段め（7×5）と 石段の 1 段め・2 段め
    ['IIIIIII', 'IIIIIII', 'IIIIIII', 'IIIIIII', 'IIIIIII', '..III..', '..III..'],
    // y1 台の 2 段め と 石段の 3 段めの 手前
    ['IIIIIII', 'IIIIIII', 'IIIIIII', 'IIIIIII', 'IIIIIII', '..III..', '.......'],
    // y2 台の うえの 面（7×5）
    ['IIIIIII', 'IIIIIII', 'IIIIIII', 'IIIIIII', 'IIIIIII', '.......', '.......'],
    // y3 石の かこい（正面の まん中は あけて 入り口）と はしら と 小さい 石ぞう
    ['FFFFFFF', 'FS...SF', 'F..N..F', 'FS...SF', 'FF...FF', '.......', '.......'],
    ['.......', '.S...S.', '...N...', '.S...S.', '.......', '.......', '.......'],
    ['.......', '.S...S.', '.......', '.S.C.S.', '.......', '.......', '.......'],
    // y6 かわらの 屋根の 1 段め（7×5）
    ['KKKKKKK', 'KKKKKKK', 'KKKKKKK', 'KKKKKKK', 'KKKKKKK', '.......', '.......'],
    // y7 2 段め と すみの 反り
    ['T.....T', '.TTTTT.', '.TTTTT.', '.TTTTT.', 'T.....T', '.......', '.......'],
    // y8 むね
    ['.......', '.......', '..TTT..', '.......', '.......', '.......', '.......'],
  ],
  legend: {
    I: ARA,
    F: ARA_MOSSY,
    N: ARA_MOSSY,
    S: 'shu_ita',
    C: 'chouchin',
    K: { id: 'kawara', skip: 0.04 },
    T: 'kawara',
  },
  anchor: { x: 3, z: 3 },
  base: { id: 'ara_ishi', maxFill: 4 },
  maxSlope: 3,
};
