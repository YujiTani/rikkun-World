import { ARA, ARA_BROKEN, ARA_MOSSY } from './stoneLegend';
import { TORII } from './torii';
import type { StructureShape } from './types';

/**
 * 石の とりい（古い とりい）。朱色の とりい（torii.ts）と 同じ 形の データを つかい、凡例だけ 石に 入れかえる:
 * 柱・横木 = あらいし（こけ・かけが 多い）、笠 = かけの 多い 石、根もと = こけの 多い 石、足もとの 台 = こけいし。高さ 14・はば 11・柱は 1×1。
 */
export const ISHI_TORII: StructureShape = {
  ...TORII,
  id: 'ishi_torii',
  legend: {
    S: ARA_MOSSY,
    K: 'koke_ara_ishi',
    T: ARA_BROKEN,
    I: { ...ARA, id: 'koke_ishi', moss: 0.2, mossId: 'koke_ara_ishi' },
    J: { ...ARA, id: 'koke_ishi', moss: 0.5, mossId: 'koke_ara_ishi' },
  },
};
