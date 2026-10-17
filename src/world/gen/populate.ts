import { CHUNK_SIZE, SEA_Y } from '../../contracts';
import type { ChunkedVoxelWorld } from '../VoxelWorld';
import { generateChunk } from './chunk';
import { installMicroCountries } from './microCountry';
import { regionRect } from './region';
import { createWorldInfo, type WorldGenInfo } from './worldInfo';

export type { WorldGenInfo } from './worldInfo';
export { terrainTopOf } from './worldInfo';

/**
 * テストや試作で「R のまわりの列を まとめて読みこんだ世界」がほしいときの道具（ゲームの起動は使わない。起動は src/world/stream/）。
 * R（スタートのまわり 128×128。VOX-D G1）をふくむ列を generateChunk で読みこみ、世界の目印を返す。
 * 仮の海のふちは もう無い: どの列も generateChunk のそのままの形。
 */
export function populateWorld(world: ChunkedVoxelWorld, seed: number): WorldGenInfo {
  installMicroCountries(world, seed);
  world.edgeClosedBelow = SEA_Y - 8; // 読みこんでいない列の横は、海ゆかより下は ふさがっているとみなす（VOX-D の決まり: 値は今のまま）
  const info = createWorldInfo(seed, world);
  const R = regionRect(seed);
  for (let cz = R.z0 >> 4; cz <= (R.z1 - 1) >> 4; cz++) {
    for (let cx = R.x0 >> 4; cx <= (R.x1 - 1) >> 4; cx++) {
      const g0 = performance.now();
      world.loadColumn(generateChunk(seed, cx, cz));
      info.noteGen?.(performance.now() - g0);
    }
  }
  void CHUNK_SIZE;
  return info;
}
