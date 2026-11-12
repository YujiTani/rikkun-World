import type { StructureShape } from './types';

/**
 * とりい（高さ 10・はば 11・ふかさ 4）。朱色の はしら 2 本（2×2）、上の 横木は 2 段（下の 段 = しまき、上の 段 = かさぎ が 外へ 1 のびる）、
 * かさぎの はしは 1 段 そる。かわらの かさ。足もとに いしだたみ（右がわは こけが 多め）。正面は 図の 下（南）。
 */
export const TORII: StructureShape = {
  id: 'torii',
  layers: [
    // y0 足もとの いしだたみ
    ['IIII...JJJJ', 'IIII...JJJJ', 'IIII...JJJJ', 'IIII...JJJJ'],
    // y1〜4 はしら
    ['...........', '.SS.....SS.', '.SS.....SS.', '...........'],
    ['...........', '.SS.....SS.', '.SS.....SS.', '...........'],
    ['...........', '.SS.....SS.', '.SS.....SS.', '...........'],
    ['...........', '.SS.....SS.', '.SS.....SS.', '...........'],
    // y5 ぬき（はしらの あいだを つなぐ 横木。外へ 1 のびる）
    ['...........', 'SSSSSSSSSSS', 'SSSSSSSSSSS', '...........'],
    // y6 はしら
    ['...........', '.SS.....SS.', '.SS.....SS.', '...........'],
    // y7 しまき（下の 横木）
    ['...........', '.SSSSSSSSS.', '.SSSSSSSSS.', '...........'],
    // y8 かさぎ（上の 横木。かわら。外へ 1 のびる）
    ['KKKKKKKKKKK', 'KKKKKKKKKKK', 'KKKKKKKKKKK', 'KKKKKKKKKKK'],
    // y9 はしが 1 段 そる
    ['K.........K', 'K.........K', 'K.........K', 'K.........K'],
  ],
  legend: {
    S: 'shu_ita',
    K: { id: 'kawara', skip: 0.06 },
    I: { id: 'ishidatami', moss: 0.1 },
    J: { id: 'ishidatami', moss: 0.45 },
  },
  anchor: { x: 5, z: 1 },
  base: { id: 'ishidatami', maxFill: 3 },
  maxSlope: 3,
};
