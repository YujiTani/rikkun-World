import { DEFAULT_CAMERA_CONFIG, RAY_STEP, SHOULDER_DROP, SHOULDER_OFFSET, WALL_MARGIN } from '../camera/config';
import type { DuoVec3 } from './types';

/**
 * COOP-1 作業 2（#399）: 分割の とき 2P の カメラの 位置（§2.5・§9.1）。1P の CameraRig と 同じ 考え方
 * （肩の点 S から 向きの うしろへ 距離ぶん。壁で 手前に 寄せる）を 小さく 書いた 物。three を 使わない。
 * 向きの 決まりは PlayerController と 同じ（yaw 0 = 北 -Z・90 = +X が 前。pitch + は 上）。
 */
const DEG = Math.PI / 180;

export interface P2Pose {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

/** out に 書いて 返す（毎ステップ 呼んでも 新しい 物を 作らない） */
export function p2CameraPose(feet: DuoVec3, yawDeg: number, pitchDeg: number, distance: number, isSolid: (x: number, y: number, z: number) => boolean, out: P2Pose): P2Pose {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  const dx = Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);
  // 肩の点 S: 目の 高さ + 少し 上 - 肩の 落ち、カメラの 右へ 少し
  const sy = feet.y + DEFAULT_CAMERA_CONFIG.eyeHeight + DEFAULT_CAMERA_CONFIG.thirdPersonHeight - SHOULDER_DROP;
  const sx = feet.x + Math.cos(yaw) * SHOULDER_OFFSET * Math.cos(pitch);
  const sz = feet.z + Math.sin(yaw) * SHOULDER_OFFSET * Math.cos(pitch);
  let allowed = distance;
  for (let t = RAY_STEP; t <= distance; t += RAY_STEP) {
    if (isSolid(Math.floor(sx - dx * t), Math.floor(sy - dy * t), Math.floor(sz - dz * t))) {
      allowed = Math.max(0, t - RAY_STEP - WALL_MARGIN);
      break;
    }
  }
  out.x = sx - dx * allowed;
  out.y = sy - dy * allowed;
  out.z = sz - dz * allowed;
  out.yawDeg = yawDeg;
  out.pitchDeg = pitchDeg;
  return out;
}
