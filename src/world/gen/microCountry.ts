import type { ChunkedVoxelWorld } from '../VoxelWorld';
import { microCountries } from '../micro/microSurface';
import { defOf, newSample } from './biome';
import { terrainFor } from './terrain';

/** 12 の国: 小ブロックの地面のきまりを 国（と 境目のまぜ具合）ごとの表の番号で返すようにする（ゲームの起動とテストの populateWorld が呼ぶ） */
export function installMicroCountries(world: ChunkedVoxelWorld, seed: number): void {
  const T = terrainFor(seed);
  const microKeys = new Map<string, number>();
  const microTmp = newSample();
  world.microForest = (bx, bz) => {
    const b = T.biome(bx, bz, microTmp);
    const q = Math.round(b.a * 8);
    const key = `${b.kind}|${b.kind2}|${q}`;
    let idx = microKeys.get(key);
    if (idx === undefined) {
      const w = q / 8;
      const m1 = defOf(b.kind).micro;
      const m2 = defOf(b.kind2).micro;
      microCountries.table.push({
        tuftThreshold: m1.tuft * w + m2.tuft * (1 - w),
        rockChance: m1.rock * w + m2.rock * (1 - w),
        soilThreshold: m1.soil * w + m2.soil * (1 - w),
      });
      idx = microCountries.table.length;
      microKeys.set(key, idx);
    }
    return idx;
  };
}
