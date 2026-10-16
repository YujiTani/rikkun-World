import { AIR, BLOCK_INDEX, blockIdFromIndex } from '../../../world/blocks/blockTypes';
import { ArrayVoxelWorld } from '../../../world/VoxelWorld';

/** 高さの倍率（VOX-3 試作）。1 = 今のまま */
export const HEIGHT_FACTORS = [1, 2, 3] as const;
export type HeightFactor = (typeof HEIGHT_FACTORS)[number];

/** 海の水面の y（GEN_CONFIG.waterY と同じ）。これより上の地面を k 倍にのばす */
export const SEA_Y = 7;
/** 世界の高さ（ブロック）。元は 48 */
export const BASE_HEIGHT = 48;
/** 上から数えて この段数までは 元の地層（草・土・すな）をそのまま使う（草 1 + 土 1）。それより下は石。1 段の崖（3 ブロック）にも 草→土→石 の層が出るように薄くした */
const SKIN = 1;

const GROUND = new Set<number>(
  ['grass', 'dirt', 'sand', 'stone', 'coal_ore', 'iron_ore', 'bedrock'].map((id) => (BLOCK_INDEX as Record<string, number>)[id]),
);
const SOFT = new Set<number>([BLOCK_INDEX.grass, BLOCK_INDEX.dirt, BLOCK_INDEX.sand]);

export function heightFactorFromParam(v: string | null): HeightFactor {
  const n = Number(v);
  return (HEIGHT_FACTORS as readonly number[]).includes(n) ? (n as HeightFactor) : 1;
}

/** 列の地面（草・土・石など）のいちばん上の y。無ければ -1 */
function groundTop(src: ArrayVoxelWorld, x: number, z: number): number {
  for (let y = src.size.y - 1; y >= 0; y--) if (GROUND.has(src.getIndex(x, y, z))) return y;
  return -1;
}

/** 地面の高さ ty が k 倍にのびたあとの高さ */
export function stretchedTop(ty: number, k: number): number {
  return ty > SEA_Y ? SEA_Y + (ty - SEA_Y) * k : ty;
}

/**
 * 今の島（src）を、海の高さより上の地面を列ごとに k 倍にのばした世界に写す。
 * 地面は 上 = 元の草など → 土 → 石。木・花・水・たいまつなど地面の上の物は その列の地面が上がった分だけ上へずらす。
 * 海（SEA_Y 以下）は そのまま。k = 1 なら同じ中身の世界。
 */
export function stretchHeight(src: ArrayVoxelWorld, k: number): ArrayVoxelWorld {
  const sy = src.size.y;
  const dst = new ArrayVoxelWorld({ x: src.size.x, y: BASE_HEIGHT * k, z: src.size.z });
  const dy = dst.size.y;
  const put = (x: number, y: number, z: number, b: number): void => {
    if (b > AIR && y >= 0 && y < dy) dst.setBlock(x, y, z, blockIdFromIndex(b));
  };
  for (let z = 0; z < src.size.z; z++) {
    for (let x = 0; x < src.size.x; x++) {
      const ty = groundTop(src, x, z);
      if (k === 1 || ty <= SEA_Y) {
        for (let y = 0; y < sy; y++) put(x, y, z, src.getIndex(x, y, z));
        continue;
      }
      const top = stretchedTop(ty, k);
      const delta = top - ty;
      for (let y = 0; y <= SEA_Y; y++) put(x, y, z, src.getIndex(x, y, z));
      for (let y = SEA_Y + 1; y <= top; y++) {
        const d = top - y;
        let b: number;
        if (d <= SKIN) b = src.getIndex(x, Math.max(SEA_Y, ty - d), z);
        else {
          b = src.getIndex(x, SEA_Y + Math.floor((y - SEA_Y) / k), z);
          if (SOFT.has(b) || !GROUND.has(b)) b = BLOCK_INDEX.stone;
        }
        put(x, y, z, b);
      }
      for (let y = ty + 1; y < sy; y++) put(x, y + delta, z, src.getIndex(x, y, z));
    }
  }
  dst.takeDirtyChunks();
  dst.takeChangeBox();
  return dst;
}
