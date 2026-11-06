import type { DuoTier } from './types';
import { DUO_TUNING } from './tuning';

/** 距離メーターの 長さ 0〜1（§9.4。48 マスで 1、それより 遠くても 1。距離に 比例） */
export function distanceMeter(distance: number): number {
  if (!(distance > 0)) return 0;
  return Math.min(1, distance / DUO_TUNING.meterFullTiles);
}

/** 色の 段（§9.2。上がるのは 16・20 以上、下がるのは 17・13 以下。上りと 下りで 幅を 持たせる）。prev = 今の 段 */
export function nextTier(prev: DuoTier, distance: number): DuoTier {
  let t: number = prev;
  while (t < 2 && distance >= DUO_TUNING.tierUpAt[t]!) t++;
  while (t > 0 && distance <= DUO_TUNING.tierDownAt[t - 1]!) t--;
  return t as DuoTier;
}
