import type { StructureShape } from './types';

/**
 * みはらしの あずまや（5×5・高さ 7）。はしら 4 本（朱色・高さ 4）と かわらの 屋根だけ（かべなし）。屋根は 2 段（5×5 → 3×3）、張り出し 1。
 * 足もとは いしだたみ 3×3、まん中の 軒に ちょうちん 1 つ。K = かけらが ぬける ことが ある かわら（1 段め）、T = ぬけない（2 段め）。
 */
export const AZUMAYA: StructureShape = {
  id: 'azumaya',
  layers: [
    // y0 ゆか
    ['.....', '.III.', '.III.', '.III.', '.....'],
    // y1〜4 はしら 4 本
    ['.....', '.S.S.', '.....', '.S.S.', '.....'],
    ['.....', '.S.S.', '.....', '.S.S.', '.....'],
    ['.....', '.S.S.', '.....', '.S.S.', '.....'],
    ['.....', '.S.S.', '..C..', '.S.S.', '.....'],
    // y5 屋根の 1 段め（5×5）
    ['KKKKK', 'KKKKK', 'KKKKK', 'KKKKK', 'KKKKK'],
    // y6 2 段め（3×3）
    ['.....', '.TTT.', '.TTT.', '.TTT.', '.....'],
  ],
  legend: {
    S: 'shu_ita',
    K: { id: 'kawara', skip: 0.05 },
    T: 'kawara',
    I: { id: 'ishidatami', moss: 0.2 },
    C: 'chouchin',
  },
  anchor: { x: 2, z: 2 },
  base: { id: 'ishidatami', maxFill: 3 },
  maxSlope: 3,
};
