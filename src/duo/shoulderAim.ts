import { SHOULDER_DROP, SHOULDER_OFFSET } from '../camera/config';

const DEG = Math.PI / 180;

/** 向きを 求めなおす 回数（肩の 点 S は 向きで 動く ので、十数回で そろう） */
const SHOULDER_AIM_ROUNDS = 16;

/**
 * 1P の ねらいの 線は 目では なく 肩の 点 S（回転の 中心 P の 0.72 下から、右へ 0.70 × cos(pitch)）から 出る（CameraRig.placeShoulder）。
 * まとの マス cell の 中心を 線が 通る 向き（度）を 返す。`duo.aimAt(1, …)` が 使う（テストの 口。2P は 目から なので 使わない）。
 * S は 向きで 動く ので、向きを 求めて S を 取りなおす のを くりかえす。壁ぎわで s が 小さくなる 分は 見ない（開けた 所で 使う）。
 */
export function shoulderAimDeg(pivot: { x: number; y: number; z: number }, cell: { x: number; y: number; z: number }): { yawDeg: number; pitchDeg: number } {
  let yaw = 0;
  let pitch = 0;
  for (let i = 0; i < SHOULDER_AIM_ROUNDS; i++) {
    const off = SHOULDER_OFFSET * Math.cos(pitch);
    const dx = cell.x + 0.5 - (pivot.x + Math.cos(yaw) * off);
    const dy = cell.y + 0.5 - (pivot.y - SHOULDER_DROP);
    const dz = cell.z + 0.5 - (pivot.z + Math.sin(yaw) * off);
    yaw = Math.atan2(dx, -dz);
    pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  return { yawDeg: yaw / DEG, pitchDeg: pitch / DEG };
}
