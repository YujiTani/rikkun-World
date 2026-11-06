import { AIR, BLOCK_INDEX, isCrossIndex, isLeafIndex, isPropIndex, isTorchIndex } from '../blocks/blockTypes';
import type { ArrayVoxelWorld } from '../VoxelWorld';
import { MICRO_PARAMS, type ColumnSource } from './microSurface';
import { isWaterIndex } from '../blocks/water';

/** 小ブロック地形の「地面」にする種類（建物・畑・たいまつ などは ふつうのブロックのまま） */
const GROUND = new Set<number>(
  ['grass', 'dirt', 'sand', 'snow', 'stone', 'coal_ore', 'iron_ore', 'bedrock'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]),
);
// 小ブロック地形の マスは 種類を 6 ビット〔0〜63〕で もつ（render/voxel/sectionMesher.ts の `t & 63`）。地面に できるのは 64 番より 前の 種類だけ
// （ブロックが 64 種を こえても、新しい 種類を 地面に 足して 絵が くるう のを 起動の ときに 落とす）
for (const k of GROUND) if (!(k >= 0 && k < 64)) throw new Error(`小ブロック地形の 地面の 種類は 0〜63 番まで（${k} 番）`);
/** 岩をのせてよい地面 */
const ROCKABLE = new Set<number>(['grass', 'dirt', 'stone'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]));
const LOG = BLOCK_INDEX.log;
const BAMBOO = BLOCK_INDEX.bamboo;

export interface ColumnInfo {
  /** 地面ブロックの y（無ければ -1） */
  ty: number;
  /** 地面ブロックの種類（番号） */
  kind: number;
  /** 上に はみ出してよい高さ（小ブロック）。-1 = 上のへりに ぴったり（上に木・建物がある） */
  reach: number;
  rockOk: boolean;
}

/** テスト用: false にすると 小ブロック地形（地面の でこぼこの高さ）を 作らない（地面のブロックも ふつうの形のブロックとして描く）。TEX-A の E2E の 平らな面の確認用 */
export const microTerrain = { enabled: true };

/** ワールドの 1 列を見て、小ブロック地形の地面があるか調べる（上から下へ。空気・水・草花・たいまつ・木・葉は とばす） */
export function scanColumn(world: Pick<ArrayVoxelWorld, 'topY' | 'getIndex'>, wx: number, wz: number, out: ColumnInfo): void {
  out.ty = -1;
  out.kind = AIR;
  out.reach = 0;
  out.rockOk = false;
  if (!microTerrain.enabled) return;
  for (let y = world.topY(wx, wz); y >= 0; y--) {
    const k = world.getIndex(wx, y, wz);
    if (k < 0) return;
    if (k === AIR || isWaterIndex(k) || isLeafIndex(k) || k === LOG || k === BAMBOO || isCrossIndex(k) || isTorchIndex(k) || isPropIndex(k)) continue;
    if (!GROUND.has(k)) return; // 建物・畑など
    out.ty = y;
    out.kind = k;
    const above = world.getIndex(wx, y + 1, wz);
    out.reach =
      above === AIR ? MICRO_PARAMS.reachAir : isCrossIndex(above) ? MICRO_PARAMS.reachCross : isWaterIndex(above) || above < 0 ? 0 : -1;
    out.rockOk = ROCKABLE.has(k);
    return;
  }
}

/** world をそのまま読む ColumnSource（テスト・確認用。メッシュ作りは チャンクごとに配列に写して速くする） */
export function worldColumnSource(world: ArrayVoxelWorld): ColumnSource {
  const info: ColumnInfo = { ty: -1, kind: AIR, reach: 0, rockOk: false };
  return {
    surfaceY: (bx, bz) => {
      scanColumn(world, bx, bz, info);
      return info.ty;
    },
    reach: (bx, bz) => {
      scanColumn(world, bx, bz, info);
      return info.reach;
    },
    rockOk: (bx, bz) => {
      scanColumn(world, bx, bz, info);
      return info.rockOk;
    },
    forest: (bx, bz) => (world.microForest === null ? 0 : world.microForest(bx, bz)),
  };
}
