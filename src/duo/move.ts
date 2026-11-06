const DEG = Math.PI / 180;

/**
 * 1 画面・ルーペの とき 2P の 左スティックが 歩く 向き（§2.5・AC4）。画面の 向きで 歩く。
 * forward = スティックを 上に 倒す 量（+1 で 画面の 奥）、right = 右に 倒す 量。cameraYawDeg = 1P の カメラの 向き（PlayerController の yawDeg と 同じ 決まり）。
 * 返すのは 世界での 向き（度。向き θ の 前は (sin θ, -cos θ)）。倒していない（0, 0）ときは null。
 */
export function walkHeadingDeg(forward: number, right: number, cameraYawDeg: number): number | null {
  if (Math.hypot(forward, right) < 1e-9) return null;
  const yaw = cameraYawDeg * DEG;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const wx = forward * sin + right * cos;
  const wz = -forward * cos + right * sin;
  const deg = Math.atan2(wx, -wz) / DEG;
  return ((deg % 360) + 360) % 360;
}
