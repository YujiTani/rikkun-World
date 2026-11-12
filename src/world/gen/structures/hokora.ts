import { ARA, ARA_MOSSY, STONE_BASE } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * ほこら（9×8・高さ 9）。石の 台（3 段 = ふもと 2 段 ＋ 台の うえ）と 正面（南）の 石段、台の まわりに 朱色の 細い かきね（正面は あけて 入り口）、
 * 朱色の 細い はしら 4 本、中に 小さい 石ぞう（2 マス）と ちょうちん 1 つ、そった かわらの 屋根。
 * 屋根は 台より 1 マス 外へ 広がり（はば 9）、ふちは うすいた〔軒先〕、四すみが 上がる。台の 正面に きざみいしを 2 こ かざる。
 */
export const HOKORA: StructureShape = {
  id: 'hokora',
  layers: [
    // y0 台の 1 段め（7×5）と 石段の 1 段め・2 段め
    ['.........', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.IIIZIII.', '...III...', '...III...'],
    // y1 台の 2 段め と 石段の 3 段めの 手前
    ['.........', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.IIIZIII.', '...III...', '.........'],
    // y2 台の うえの 面（7×5）
    ['.........', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.IIIIIII.', '.........', '.........'],
    // y3 朱色の かきね（正面の まん中は あけて 入り口）と はしら と 小さい 石ぞう
    ['.........', '.xxxxxxx.', '.zS...Sz.', '.z..N..z.', '.zS...Sz.', '.xx...xx.', '.........', '.........'],
    ['.........', '.........', '..S...S..', '....N....', '..S...S..', '.........', '.........', '.........'],
    ['.........', '.........', '..S...S..', '.........', '..S.C.S..', '.........', '.........', '.........'],
    // y6 かわらの 屋根: ふちは うすいた（軒先。台より 1 マス 外へ）、まんなかは かたまり（7×5）
    ['EEEEEEEEE', 'EKKKKKKKE', 'EKKKKKKKE', 'EKKKKKKKE', 'EKKKKKKKE', 'EKKKKKKKE', 'EEEEEEEEE', '.........'],
    // y7 2 段め（3×3）と 四すみの 反り（うすいた）
    ['U.......U', '.........', '...TTT...', '...TTT...', '...TTT...', '.........', 'U.......U', '.........'],
    // y8 むね（四角すい台）
    ['.........', '.........', '.........', '....G....', '.........', '.........', '.........', '.........'],
  ],
  legend: {
    I: ARA,
    Z: 'kizami_ishi',
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
  anchor: { x: 4, z: 4 },
  base: { ...STONE_BASE, maxFill: 5, cap: 'renga_ishi' },
  maxSlope: 4,
};
