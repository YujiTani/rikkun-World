import type { BlockId, TargetInfo, VoxelWorld } from '../contracts';
import { isWater } from '../world/blocks/water';

const DEG = Math.PI / 180;

/** yaw 0 = 北（-Z）、90 = 東（+X）。pitch 上がプラス（M1-02 §4.3） */
export function lookDirection(yawDeg: number, pitchDeg: number, out: { x: number; y: number; z: number }) {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  const c = Math.cos(pitch);
  out.x = Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * c;
  return out;
}

function targetable(id: BlockId | 'outside'): id is BlockId {
  return id !== 'air' && !isWater(id) && id !== 'outside';
}

/**
 * 目から向きへ線をのばし、reach 以内で最初の「air・water 以外」のブロックを返す（M2 §2.2）。
 * 世界の外のマスは通りぬける。solidOnly なら 固いブロックだけ（作物・かかし・さく・たいまつ は通りぬける。弓・刀の さえぎり用）。
 */
export function raycastBlocks(
  world: VoxelWorld,
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  reach: number,
  solidOnly = false,
): TargetInfo | null {
  let x = Math.floor(ox);
  let y = Math.floor(oy);
  let z = Math.floor(oz);

  const start = world.getBlock(x, y, z);
  if (targetable(start) && (!solidOnly || world.isSolid(x, y, z))) {
    // 目がブロックの中: 向きの強い軸の反対側を面とする
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const az = Math.abs(dz);
    const face = { x: 0, y: 0, z: 0 };
    if (ax >= ay && ax >= az) face.x = dx > 0 ? -1 : 1;
    else if (ay >= az) face.y = dy > 0 ? -1 : 1;
    else face.z = dz > 0 ? -1 : 1;
    return {
      block: { x, y, z },
      id: start,
      face,
      place: { x: x + face.x, y: y + face.y, z: z + face.z },
      distance: 0,
    };
  }

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
  const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
  const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
  let tMaxX = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX;
  let tMaxY = dy === 0 ? Infinity : (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY;
  let tMaxZ = dz === 0 ? Infinity : (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ;

  for (;;) {
    let t: number;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
      fx = -stepX;
    } else if (tMaxY <= tMaxZ) {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
      fy = -stepY;
    } else {
      t = tMaxZ;
      z += stepZ;
      tMaxZ += tDeltaZ;
      fz = -stepZ;
    }
    if (t > reach) return null;
    const id = world.getBlock(x, y, z);
    if (targetable(id) && (!solidOnly || world.isSolid(x, y, z))) {
      return {
        block: { x, y, z },
        id,
        face: { x: fx, y: fy, z: fz },
        place: { x: x + fx, y: y + fy, z: z + fz },
        distance: t,
      };
    }
  }
}
