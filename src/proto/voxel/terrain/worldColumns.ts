import { AIR, BLOCK_INDEX, WATER, isCrossIndex, isTorchIndex } from '../../../world/blocks/blockTypes';
import type { ArrayVoxelWorld } from '../../../world/VoxelWorld';
import { MICRO_PARAMS, type ColumnSource } from './microSurface';

/** 小ブロック地形の「地面」にする種類（建物・畑・たいまつ などは ふつうのブロックのまま） */
const GROUND = new Set<number>(
  ['grass', 'dirt', 'sand', 'stone', 'coal_ore', 'iron_ore', 'bedrock'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]),
);
/** 岩をのせてよい地面 */
const ROCKABLE = new Set<number>(['grass', 'dirt', 'stone'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]));
const LEAVES = BLOCK_INDEX.leaves;
const LOG = BLOCK_INDEX.log;

export interface ColumnInfo {
  /** 地面ブロックの y（無ければ -1） */
  ty: number;
  /** 地面ブロックの種類（番号） */
  kind: number;
  /** 上に はみ出してよい高さ（小ブロック）。-1 = 上のへりに ぴったり（上に木・建物がある） */
  reach: number;
  rockOk: boolean;
}

/** ワールドの 1 列を見て、小ブロック地形の地面があるか調べる（上から下へ。空気・水・草花・たいまつ・木・葉は とばす） */
export function scanColumn(world: ArrayVoxelWorld, wx: number, wz: number, out: ColumnInfo): void {
  out.ty = -1;
  out.kind = AIR;
  out.reach = 0;
  out.rockOk = false;
  for (let y = world.size.y - 1; y >= 0; y--) {
    const k = world.getIndex(wx, y, wz);
    if (k < 0) return;
    if (k === AIR || k === WATER || k === LEAVES || k === LOG || isCrossIndex(k) || isTorchIndex(k)) continue;
    if (!GROUND.has(k)) return; // 建物・畑など
    out.ty = y;
    out.kind = k;
    const above = world.getIndex(wx, y + 1, wz);
    out.reach =
      above === AIR ? MICRO_PARAMS.reachAir : isCrossIndex(above) ? MICRO_PARAMS.reachCross : above === WATER || above < 0 ? 0 : -1;
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
  };
}
