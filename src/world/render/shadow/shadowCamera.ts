// 影の地図のカメラの中心を、地図の 1 目の整数倍にそろえる（SHADOW.md §5.2）。
// カメラが動いても影のへりがちらつかない。
import type { V3 } from './shadowLight';

/** 光の向き dir の軸: 右 = (dir.y, -dir.x, 0) を単位にしたもの、上 = dir × 右 */
export function lightAxes(dir: V3): { right: V3; up: V3 } {
  const rn = Math.hypot(dir.y, dir.x) || 1;
  const right = { x: dir.y / rn, y: -dir.x / rn, z: 0 };
  const up = {
    x: dir.y * right.z - dir.z * right.y,
    y: dir.z * right.x - dir.x * right.z,
    z: dir.x * right.y - dir.y * right.x,
  };
  const un = Math.hypot(up.x, up.y, up.z) || 1;
  return { right, up: { x: up.x / un, y: up.y / un, z: up.z / un } };
}

const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * 中心 center を、（右, 上）の値が 1 目（= 2*half/size）の整数倍になる点にする。奥行き（光の向きの値）も 1 目にそろえる（地図の奥行きの値に 1 目より細かい動きを入れない。奥行きは 160 ブロックぶんあるので 1 目ずれても影響なし）。
 */
export function snapMapCenter(center: V3, mapDir: V3, half: number, size: number): V3 {
  const { right, up } = lightAxes(mapDir);
  const texel = (2 * half) / size;
  const r = Math.round(dot(center, right) / texel) * texel;
  const u = Math.round(dot(center, up) / texel) * texel;
  const w = Math.round(dot(center, mapDir) / texel) * texel;
  return {
    x: right.x * r + up.x * u + mapDir.x * w,
    y: right.y * r + up.y * u + mapDir.y * w,
    z: right.z * r + up.z * u + mapDir.z * w,
  };
}
