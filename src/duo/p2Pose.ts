import { clearDistance, firstSolidDistance, pushOutOfSolids } from '../camera/clearance';
import { DEFAULT_CAMERA_CONFIG, SHOULDER_DROP, SHOULDER_OFFSET, SHOULDER_WALL_MARGIN } from '../camera/config';
import type { DuoVec3 } from './types';

/**
 * COOP-1 作業 2（#399）: 分割の とき 2P の カメラの 位置（§2.5・§9.1）。1P の CameraRig と 同じ 考え方
 * （肩の点 S から 向きの うしろへ 距離ぶん。壁で 手前に 寄せる）を 小さく 書いた 物。three を 使わない。
 * 向きの 決まりは PlayerController と 同じ（yaw 0 = 北 -Z・90 = +X が 前。pitch + は 上）。
 */
const DEG = Math.PI / 180;

const shoulderScratch = { x: 0, y: 0, z: 0 };

export interface P2Pose {
  x: number;
  y: number;
  z: number;
  yawDeg: number;
  pitchDeg: number;
}

/**
 * out に 書いて 返す（毎ステップ 呼んでも 新しい 物を 作らない）。
 * eyeDrop（マス。省くと 0）＝ すわって いる 間の `SeatSystem.eyeDrop()`。先に 足もとを その ぶん さげてから 肩の 点・うしろへの 光線を 決める（COOP-1 5e。1P の CameraRig と 同じ 考え方）。
 */
export function p2CameraPose(feet: DuoVec3, yawDeg: number, pitchDeg: number, distance: number, isSolid: (x: number, y: number, z: number) => boolean, out: P2Pose, eyeDrop = 0): P2Pose {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  const dx = Math.sin(yaw) * Math.cos(pitch);
  const dy = Math.sin(pitch);
  const dz = -Math.cos(yaw) * Math.cos(pitch);
  // 肩の点 S: 目の 高さ + 少し 上 - 肩の 落ち、カメラの 右へ 少し
  const sy = feet.y - eyeDrop + DEFAULT_CAMERA_CONFIG.eyeHeight + DEFAULT_CAMERA_CONFIG.thirdPersonHeight - SHOULDER_DROP;
  // 肩の ずらし s: 1P と 同じく 壁ぎわで 小さくする
  const rx = Math.cos(yaw);
  const rz = Math.sin(yaw);
  const full = SHOULDER_OFFSET * Math.cos(pitch);
  const hit = firstSolidDistance(isSolid, feet.x, sy, feet.z, rx, 0, rz, full + SHOULDER_WALL_MARGIN);
  const s = hit !== null ? Math.max(0, Math.min(full, hit - SHOULDER_WALL_MARGIN)) : full;
  const S = shoulderScratch;
  S.x = feet.x + rx * s;
  S.y = sy;
  S.z = feet.z + rz * s;
  pushOutOfSolids(isSolid, S);
  const allowed = clearDistance(isSolid, S.x, S.y, S.z, -dx, -dy, -dz, distance);
  out.x = S.x - dx * allowed;
  out.y = S.y - dy * allowed;
  out.z = S.z - dz * allowed;
  out.yawDeg = yawDeg;
  out.pitchDeg = pitchDeg;
  return out;
}
