import type { AnimalBreed, AnimalStage, BodySize } from '../contracts';

/** マッチョ の 倍率（見た目 も 当たり も。LIVE-2 §2.2・§2.10） */
export const MACHO_SCALE = 1.15;
const ADULT: BodySize = { h: 0.8, w: 0.6, l: 0.6 };
const CHICK: BodySize = { h: 0.35, w: 0.3, l: 0.3 };

const round = (n: number) => Math.round(n * 10000) / 10000;

/** 体 の 当たり の 大きさ（`animals.list()` の `size`）。ひよこ 0.35×0.3×0.3・大人 0.8×0.6×0.6、マッチョ は 1.15 倍 */
export function bodySize(stage: AnimalStage, breed: AnimalBreed): BodySize {
  const b = stage === 'chick' ? CHICK : ADULT;
  if (breed !== 'macho') return { ...b };
  return { h: round(b.h * MACHO_SCALE), w: round(b.w * MACHO_SCALE), l: round(b.l * MACHO_SCALE) };
}

const AIM_CHICK = Object.freeze({ hw: 0.35, h: 0.6 });
const AIM_ADULT = Object.freeze({ hw: 0.4, h: 1.0 });
const AIM_MACHO = Object.freeze({ hw: 0.4 * MACHO_SCALE, h: 1.0 * MACHO_SCALE });

/** ねらう 箱（横 はんぶん・高さ）。ひよこ は 体 より かなり 大きく 0.7×0.7×0.6、大人 は 0.8×0.8×1.0。マッチョ の 大人 は 1.15 倍（毎回 作らない） */
export function aimBox(stage: AnimalStage, breed: AnimalBreed): { readonly hw: number; readonly h: number } {
  if (stage === 'chick') return AIM_CHICK;
  return breed === 'macho' ? AIM_MACHO : AIM_ADULT;
}
