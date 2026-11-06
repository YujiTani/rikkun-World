import { DUO_TUNING } from './tuning';

/** 距離メーターの 長さ 0〜1（§9.4。48 マスで 1、それより 遠くても 1。距離に 比例。色は 距離で かえない） */
export function distanceMeter(distance: number): number {
  if (!(distance > 0)) return 0;
  return Math.min(1, distance / DUO_TUNING.meterFullTiles);
}
