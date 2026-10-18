import { chickenSpec } from './chickenSpec';
import { cachedModel, type BuiltModel } from './voxelMesh';

/** にわとり の 形（なかまは リボン つき）。1 回 だけ 作って 使いまわす */
export function getChickenModel(mark: boolean): BuiltModel {
  return cachedModel(mark ? 'chicken:mark' : 'chicken', () => chickenSpec(mark));
}
