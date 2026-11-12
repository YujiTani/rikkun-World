import type { LegendFull } from './types';

/**
 * 石の もの（いしどうろう・石ぞう・いし とりい など）の 凡例の ひながた。あらいしを 主に、こけの あらいし・こけいし・ひびの いしを ゆらぎで まぜる。
 * 下の 段ほど こけが 多い（mossLow）。数を かえる ときは ここだけ。
 */
export const ARA: LegendFull = { id: 'ara_ishi', moss: 0.15, mossId: 'koke_ara_ishi', mossLow: 0.3, mix: [['koke_ishi', 0.08], ['hibi_ishi', 0.08]] };

/** こけが 多い 石（石ぞうの 頭の てっぺん・ひざ など） */
export const ARA_MOSSY: LegendFull = { id: 'ara_ishi', moss: 0.25, mossId: 'koke_ara_ishi', mossLow: 0.2, mix: [['koke_ishi', 0.1], ['hibi_ishi', 0.05]] };

