import { ARA } from './stoneLegend';
import type { StructureShape } from './types';

/**
 * かねの やぐら（7×7・高さ 11）。石の 台（5×5・2 段）と 正面の 石段、朱色の はしら 4 本（高さ 5）、
 * はしらの 上の 横木から つりがね（くろい かわらを 2 マス つるす）、そった かわらの 屋根（7×7 → 5×5 → 3×3・すみが 1 段 上がる）、てっぺんに しろい かざり。
 */
export const YAGURA: StructureShape = {
  id: 'yagura',
  layers: [
    // y0 台の 1 段め（5×5）と 石段
    ['.......', '.AAAAA.', '.AAAAA.', '.AAAAA.', '.AAAAA.', '.AAAAA.', '..AZA..'],
    // y1 台の 2 段め
    ['.......', '.AAAAA.', '.AAAAA.', '.AAAAA.', '.AAAAA.', '.AAAAA.', '.......'],
    // y2〜3 はしら
    ['.......', '.P...P.', '.......', '.......', '.......', '.P...P.', '.......'],
    ['.......', '.P...P.', '.......', '.......', '.......', '.P...P.', '.......'],
    // y4 はしら と つりがね（上）
    ['.......', '.P...P.', '.......', '...B...', '.......', '.P...P.', '.......'],
    // y5 はしら と つりがね（下）
    ['.......', '.P...P.', '.......', '...B...', '.......', '.P...P.', '.......'],
    // y6 横木（はしらを つなぎ、つりがねを つるす）
    ['.......', '.xxxxx.', '...z...', '.xxxxx.', '...z...', '.xxxxx.', '.......'],
    // y7 屋根の 1 段め（7×7）
    ['EEEEEEE', 'EKKKKKE', 'EKKKKKE', 'EKKKKKE', 'EKKKKKE', 'EKKKKKE', 'EEEEEEE'],
    // y8 2 段め（5×5）と すみの 反り
    ['U.....U', '.TTTTT.', '.TTTTT.', '.TTTTT.', '.TTTTT.', '.TTTTT.', 'U.....U'],
    // y9 3 段め（3×3）
    ['.......', '.......', '..TTT..', '..TTT..', '..TTT..', '.......', '.......'],
    // y10 てっぺんの かざり
    ['.......', '.......', '.......', '...W...', '.......', '.......', '.......'],
  ],
  legend: {
    A: ARA,
    Z: 'renga_ishi', // 石段の 中ほどの かざり
    P: 'shu_ita_hashira',
    x: 'shu_ita_kakine_x',
    z: 'shu_ita_kakine_z',
    E: { id: 'kawara_usuita_shita', skip: 0.05 },
    U: 'kawara_usuita_shita',
    B: 'kawara',
    K: { id: 'kawara', skip: 0.04 },
    T: 'kawara',
    W: 'shikkui',
  },
  anchor: { x: 3, z: 3 },
  base: { id: 'ara_ishi', maxFill: 6 },
  maxSlope: 5,
};
