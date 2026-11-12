import { CHUNK_SIZE } from '../../contracts';
import { featuresNearChunk } from './countryFeatureBlocks';
import { WATER_BLOCKS as B, WATER_V2 } from './waterV2Table';

/**
 * 水の 景色 v2: 生成した 列に わきどころ（滝・川の 段差）が あるか。水の 係（waterSystem の springsIn）が 「この 列は さがす」と 決める のに 使う。
 * フラグが なければ いつも false。列ごとに 覚える（countryFeatureBlocks が 覚えて いる）。
 */
export function waterV2SpringsIn(seed: number, cx: number, cz: number): boolean {
  if (!WATER_V2) return false;
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  return featuresNearChunk(seed, x0, z0).sites.some((s) => (s.type === 'taki' || s.type === 'kawa') && s.blocks.some((b) => b.id === B.spring && b.x >= x0 && b.x < x0 + CHUNK_SIZE && b.z >= z0 && b.z < z0 + CHUNK_SIZE));
}
