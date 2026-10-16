// 方向（0〜7）と 段（0〜2）のえらび方（仕様 §4.3）。数だけの関数。

/** 段を切りかえる仰ぎ角（度） */
export const TIER_DEG = 60;
/** からだの中心（足もと + これ）から カメラの仰ぎ角を はかる */
export const BODY_CENTER_Y = 1.0;
/** カメラがからだの中心から これより近いとき 板をかくす */
export const HIDE_DISTANCE = 1.2;

const mod360 = (a: number): number => ((a % 360) + 360) % 360;

/** 足もとから カメラへの 水平の方角（yaw と同じ数え方。0 = 北 −Z、90 = 東 +X） */
export function bearingDeg(dx: number, dz: number): number {
  return mod360((Math.atan2(dx, -dz) * 180) / Math.PI);
}

/** 方向 i（0 = 正面、2 = キャラの右手がわ、4 = うしろ、6 = 左手がわ） */
export function dirIndex(cameraBearing: number, facingDeg: number): number {
  const r = mod360(cameraBearing - facingDeg);
  return Math.floor((r + 22.5) / 45) % 8;
}

/** 段: 仰ぎ角 e が +60 度以上 = 1（見下ろし）、−60 度以下 = 2（見上げ）、そのほか 0 */
export function tierFor(elevDeg: number): 0 | 1 | 2 {
  if (elevDeg >= TIER_DEG) return 1;
  if (elevDeg <= -TIER_DEG) return 2;
  return 0;
}
