import type { AnimalView } from '../contracts';
import { ANIMAL_FX } from './animalFxConfig';

export function mix(a: number, b: number): number {
  let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function rngOf(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = (t: number): number => t * t * (3 - 2 * t);


/** 頭 の 上の しるし の 高さ（足もと から）。ひよこ は ひくく、マッチョ の 大人 は たかく */
export function headYOf(v: AnimalView): number {
  const macho = v.breed === 'macho';
  if (v.stage === 'chick') return macho ? ANIMAL_FX.machoChickHeadY : ANIMAL_FX.chickHeadY;
  return macho ? ANIMAL_FX.machoHeadY : ANIMAL_FX.headHeartY;
}
