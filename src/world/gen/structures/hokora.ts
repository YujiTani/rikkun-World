import { ARA, ARA_MOSSY } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * ほこら（7×7・高さ 9）。石の 台（3 段 = ふもと 2 段 ＋ 台の うえ）と 正面（南）の 石段、台の まわりに 石の かこい（正面は あけて 入り口）、
 * 朱色の 細い はしら 4 本、中に 小さい 石ぞう（2 マス）と ちょうちん 1 つ、そった かわらの 屋根（ふちは うすいた〔軒先〕・すみが 上がる）。かこいは 朱色の 細い かきね。
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
    // y3 石の かこい（細い かきね。正面の まん中は あけて 入り口）と はしら と 小さい 石ぞう
    ['xxxxxxx', 'zS...Sz', 'z..N..z', 'zS...Sz', 'xx...xx', '.......', '.......'],
    ['.......', '.S...S.', '...N...', '.S...S.', '.......', '.......', '.......'],
    ['.......', '.S...S.', '.......', '.S.C.S.', '.......', '.......', '.......'],
    // y6 かわらの 屋根: ふちは うすいた（軒先）、まんなかは かたまり（5×3）
    ['EEEEEEE', 'EKKKKKE', 'EKKKKKE', 'EKKKKKE', 'EEEEEEE', '.......', '.......'],
    // y7 2 段め（3×3）と すみの 反り（うすいた）
    ['U.....U', '..TTT..', '..TTT..', '..TTT..', 'U.....U', '.......', '.......'],
    // y8 むね（四角すい台）
    ['.......', '.......', '...G...', '.......', '.......', '.......', '.......'],
  ],
  legend: {
    I: ARA,
    N: ARA_MOSSY,
    x: 'shu_ita_kakine_x',
    z: 'shu_ita_kakine_z',
    S: 'shu_ita_hashira',
    C: 'chouchin',
    E: { id: 'kawara_usuita_shita', skip: 0.04 },
    K: { id: 'kawara', skip: 0.04 },
    T: 'kawara',
    U: 'kawara_usuita_shita',
    G: 'kawara_kasa',
  },
  anchor: { x: 3, z: 3 },
  base: { id: 'ara_ishi', maxFill: 4 },
  maxSlope: 3,
};
