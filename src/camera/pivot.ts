import type { Vec3, VoxelWorld } from '../contracts';
import { DEFAULT_CAMERA_CONFIG, PIVOT_CEILING_GAP } from './config';

/** P の足もとからの高さ（目 1.62 + 0.5 = 2.12） */
export const PIVOT_HEIGHT = DEFAULT_CAMERA_CONFIG.eyeHeight + DEFAULT_CAMERA_CONFIG.thirdPersonHeight;

/**
 * カメラの回転の中心 P（CHAR-1 §4.1）。ねらいの線・矢の出どころもここ。
 * 足もと + 2.12。目から P までの間（P を含む）に固いブロックがあれば、
 * いちばん低いそのブロックの下の面より 0.1 下まで下げる（2 マスのトンネルで 足もと + 1.90）。
 */
export function aimPivot(
  world: VoxelWorld,
  feet: Vec3,
  out: Vec3,
  height: number = PIVOT_HEIGHT,
  eyeHeight: number = DEFAULT_CAMERA_CONFIG.eyeHeight,
): Vec3 {
  const x = Math.floor(feet.x);
  const z = Math.floor(feet.z);
  let y = feet.y + height;
  const lo = Math.floor(feet.y + eyeHeight);
  const hi = Math.floor(y);
  for (let by = lo; by <= hi; by++) {
    if (world.isSolid(x, by, z)) {
      y = Math.min(y, by - PIVOT_CEILING_GAP);
      break;
    }
  }
  out.x = feet.x;
  out.y = y;
  out.z = feet.z;
  return out;
}
