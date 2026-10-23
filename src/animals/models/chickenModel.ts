import type { AnimalBreed, AnimalStage } from '../../contracts';
import { CHICK_SCALE, MACHO_ADULT_RATIO, MACHO_CHICK_SCALE, chickSpec, machoSpec } from './chickSpec';
import { CHICKEN_SCALE, chickenSpec } from './chickenSpec';
import { cachedModel, type BuiltModel } from './voxelMesh';

/** にわとり の 形（なかまは リボン つき）。1 回 だけ 作って 使いまわす */
export function getChickenModel(mark: boolean): BuiltModel {
  return cachedModel(mark ? 'chicken:mark' : 'chicken', () => chickenSpec(mark));
}

/** 形の 種類（LIVE-2）: 大人 の にわとり・ひよこ・マッチョひよこ・マッチョにわとり */
export type AnimalModelKind = 'chicken' | 'chick' | 'machoChick' | 'macho';

/** 育ち と しゅるい から 形 を えらぶ（`AnimalView` の `stage`・`breed`。なければ ふつう の 大人） */
export function modelKindOf(stage: AnimalStage | undefined, breed: AnimalBreed | undefined): AnimalModelKind {
  const macho = breed === 'macho';
  if (stage === 'chick') return macho ? 'machoChick' : 'chick';
  return macho ? 'macho' : 'chicken';
}

/** 形 ごとの 見た目 の 倍率（1/16 で 組んだ 形 に かける。ひよこ 0.62・マッチョひよこ 0.72・マッチョ 大人 は 大人 の 1.15 倍） */
export const MODEL_SCALE: Readonly<Record<AnimalModelKind, number>> = {
  chicken: CHICKEN_SCALE,
  chick: CHICK_SCALE,
  machoChick: MACHO_CHICK_SCALE,
  macho: CHICKEN_SCALE * MACHO_ADULT_RATIO,
};

/** 1 わ の 形（`mark` = なかま・小屋 の 子 の リボン）。1 回 だけ 作って 使いまわす */
export function getAnimalModel(kind: AnimalModelKind, mark: boolean): BuiltModel {
  const key = `${kind}:${mark ? 'mark' : 'plain'}`;
  switch (kind) {
    case 'chicken':
      return getChickenModel(mark);
    case 'chick':
      return cachedModel(key, () => chickSpec(mark, false));
    case 'machoChick':
      return cachedModel(key, () => chickSpec(mark, true));
    case 'macho':
      return cachedModel(key, () => machoSpec(mark));
  }
}
